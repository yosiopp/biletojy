package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/yosiopp/biletojy/data"
)

// 実DBを汚さないよう一時ディレクトリでDBを作成し、静的配信なしのハンドラを返す
func newTestServer(t *testing.T) http.Handler {
	return newTestServerWithUserHeader(t, "")
}

// -user-header指定相当のハンドラを返す
func newTestServerWithUserHeader(t *testing.T, userHeader string) http.Handler {
	t.Helper()
	t.Chdir(t.TempDir())
	dao, err := data.NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)
	return newServer(dao, nil, userHeader)
}

// bodyはstringならそのまま、それ以外はJSONにして送る
func request(t *testing.T, handler http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	return requestWithHeader(t, handler, method, path, body, "", "")
}

// requestと同様だが、任意のリクエストヘッダを1つ付けて送る
func requestWithHeader(t *testing.T, handler http.Handler, method, path string, body any, header, value string) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	switch v := body.(type) {
	case nil:
	case string:
		reader = strings.NewReader(v)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("marshal request body: %v", err)
		}
		reader = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, reader)
	if header != "" {
		req.Header.Set(header, value)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	return w
}

func decodeBody[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode response %q: %v", w.Body.String(), err)
	}
	return v
}

func assertStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status = %d, want %d (body: %s)", w.Code, want, w.Body.String())
	}
}

func assertErrorResponse(t *testing.T, w *httptest.ResponseRecorder, wantStatus int) {
	t.Helper()
	assertStatus(t, w, wantStatus)
	body := decodeBody[map[string]string](t, w)
	if body["error"] == "" {
		t.Errorf("error response has no error message: %v", body)
	}
}

func createTicket(t *testing.T, handler http.Handler, ticket data.Ticket) data.Ticket {
	t.Helper()
	w := request(t, handler, "POST", "/api/tickets", ticket)
	assertStatus(t, w, http.StatusCreated)
	return decodeBody[data.Ticket](t, w)
}

func TestTicketCreate(t *testing.T) {
	handler := newTestServer(t)

	created := createTicket(t, handler, data.Ticket{Title: "新規チケット", Content: "本文", Tags: "status:OPEN", CreatedBy: "alice"})
	if created.Id <= 0 {
		t.Errorf("id not set: %+v", created)
	}
	if created.CreatedBy != "alice" || created.Title != "新規チケット" {
		t.Errorf("created = %+v", created)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Errorf("timestamps not set: %+v", created)
	}

	// created_by省略時はanonymous
	anon := createTicket(t, handler, data.Ticket{Title: "作成者なし"})
	if anon.CreatedBy != "anonymous" {
		t.Errorf("created_by = %q, want anonymous", anon.CreatedBy)
	}

	// バリデーション
	assertErrorResponse(t, request(t, handler, "POST", "/api/tickets", data.Ticket{Content: "タイトルなし"}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "POST", "/api/tickets", "{invalid json"), http.StatusBadRequest)
}

func TestTicketGet(t *testing.T) {
	handler := newTestServer(t)
	created := createTicket(t, handler, data.Ticket{Title: "取得テスト", Content: "本文"})

	w := request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d", created.Id), nil)
	assertStatus(t, w, http.StatusOK)
	got := decodeBody[data.Ticket](t, w)
	if got.Id != created.Id || got.Title != "取得テスト" {
		t.Errorf("got = %+v", got)
	}

	assertErrorResponse(t, request(t, handler, "GET", "/api/tickets/9999", nil), http.StatusNotFound)
	assertErrorResponse(t, request(t, handler, "GET", "/api/tickets/abc", nil), http.StatusBadRequest)
}

func TestTicketUpdate(t *testing.T) {
	handler := newTestServer(t)
	created := createTicket(t, handler, data.Ticket{Title: "元タイトル", Content: "本文", CreatedBy: "alice"})

	// created_by, created_atは編集リクエストの値を無視して元の値が維持される
	w := request(t, handler, "PUT", fmt.Sprintf("/api/tickets/%d", created.Id),
		data.Ticket{Title: "新タイトル", Content: "新本文", Tags: "status:DONE", CreatedBy: "bob"})
	assertStatus(t, w, http.StatusOK)
	updated := decodeBody[data.Ticket](t, w)
	if updated.Title != "新タイトル" || updated.Tags != "status:DONE" {
		t.Errorf("updated = %+v", updated)
	}
	if updated.CreatedBy != "alice" {
		t.Errorf("created_by = %q, want alice (must keep original)", updated.CreatedBy)
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Errorf("created_at = %v, want %v (must keep original)", updated.CreatedAt, created.CreatedAt)
	}

	// バリデーションと404
	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/tickets/%d", created.Id), data.Ticket{Content: "タイトルなし"}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "PUT", "/api/tickets/9999", data.Ticket{Title: "x"}), http.StatusNotFound)
}

func TestTicketSearch(t *testing.T) {
	handler := newTestServer(t)
	t1 := createTicket(t, handler, data.Ticket{Title: "ログイン画面のバグ", Content: "エラーが発生する", Tags: "status:OPEN type:BUG"})
	t2 := createTicket(t, handler, data.Ticket{Title: "ドキュメント整備", Content: "API仕様をまとめる", Tags: "status:WIP docs/design"})

	search := func(q, tags string) []data.Ticket {
		t.Helper()
		params := url.Values{}
		if q != "" {
			params.Set("q", q)
		}
		if tags != "" {
			params.Set("tags", tags)
		}
		w := request(t, handler, "GET", "/api/tickets?"+params.Encode(), nil)
		assertStatus(t, w, http.StatusOK)
		return decodeBody[[]data.Ticket](t, w)
	}

	if got := search("", ""); len(got) != 2 {
		t.Errorf("search all = %d tickets, want 2", len(got))
	}
	if got := search("ログイン", ""); len(got) != 1 || got[0].Id != t1.Id {
		t.Errorf("search q=ログイン = %+v, want ticket %d", got, t1.Id)
	}
	if got := search("", "docs"); len(got) != 1 || got[0].Id != t2.Id {
		t.Errorf("search tags=docs = %+v, want ticket %d", got, t2.Id)
	}
	if got := search("", "status:WIP,docs/design"); len(got) != 1 || got[0].Id != t2.Id {
		t.Errorf("search tags AND = %+v, want ticket %d", got, t2.Id)
	}
	if got := search("ログイン", "docs"); len(got) != 0 {
		t.Errorf("search q+tags mismatch = %+v, want empty", got)
	}
	if got := search("", "-status:WIP"); len(got) != 1 || got[0].Id != t1.Id {
		t.Errorf("search tags NOT = %+v, want ticket %d", got, t1.Id)
	}
	if got := search("", "status:OPEN|status:WIP"); len(got) != 2 {
		t.Errorf("search tags OR = %d tickets, want 2", len(got))
	}
	if got := search("", "status:OPEN|status:WIP,-docs"); len(got) != 1 || got[0].Id != t1.Id {
		t.Errorf("search tags OR+NOT = %+v, want ticket %d", got, t1.Id)
	}

	// 数値タグの範囲検索（数値として比較され、辞書順の "10" < "9" にならない）
	t3 := createTicket(t, handler, data.Ticket{Title: "見積り大", Content: "本文", Tags: "estimate#:10"})
	if got := search("", "estimate#:>=9"); len(got) != 1 || got[0].Id != t3.Id {
		t.Errorf("search tags numeric range = %+v, want ticket %d", got, t3.Id)
	}
	if got := search("", "estimate#:<9"); len(got) != 0 {
		t.Errorf("search tags numeric range = %+v, want empty", got)
	}
}

func TestCommentCreateAndList(t *testing.T) {
	handler := newTestServer(t)
	ticket := createTicket(t, handler, data.Ticket{Title: "チケット", Content: "本文"})
	commentsPath := fmt.Sprintf("/api/tickets/%d/comments", ticket.Id)

	// コメントなしは空配列
	w := request(t, handler, "GET", commentsPath, nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.Comment](t, w); len(got) != 0 {
		t.Errorf("comments on empty = %+v", got)
	}

	w = request(t, handler, "POST", commentsPath, data.Comment{Content: "最初のコメント", CreatedBy: "alice"})
	assertStatus(t, w, http.StatusCreated)
	c1 := decodeBody[data.Comment](t, w)
	if c1.Id <= 0 || c1.TicketId != ticket.Id || c1.CreatedBy != "alice" {
		t.Errorf("created comment = %+v", c1)
	}

	// created_by省略時はanonymous
	w = request(t, handler, "POST", commentsPath, data.Comment{Content: "作成者なし"})
	assertStatus(t, w, http.StatusCreated)
	if c2 := decodeBody[data.Comment](t, w); c2.CreatedBy != "anonymous" {
		t.Errorf("created_by = %q, want anonymous", c2.CreatedBy)
	}

	w = request(t, handler, "GET", commentsPath, nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.Comment](t, w); len(got) != 2 {
		t.Errorf("comments = %+v, want 2", got)
	}

	// バリデーションと404
	assertErrorResponse(t, request(t, handler, "POST", commentsPath, data.Comment{}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "POST", "/api/tickets/9999/comments", data.Comment{Content: "x"}), http.StatusNotFound)
}

func TestCommentUpdate(t *testing.T) {
	handler := newTestServer(t)
	ticket := createTicket(t, handler, data.Ticket{Title: "チケット", Content: "本文"})
	w := request(t, handler, "POST", fmt.Sprintf("/api/tickets/%d/comments", ticket.Id), data.Comment{Content: "元コメント", CreatedBy: "alice"})
	assertStatus(t, w, http.StatusCreated)
	comment := decodeBody[data.Comment](t, w)

	// contentのみ更新され、他の項目は維持される
	w = request(t, handler, "PUT", fmt.Sprintf("/api/comments/%d", comment.Id), data.Comment{Content: "編集後コメント", CreatedBy: "bob"})
	assertStatus(t, w, http.StatusOK)
	updated := decodeBody[data.Comment](t, w)
	if updated.Content != "編集後コメント" {
		t.Errorf("content = %q", updated.Content)
	}
	if updated.CreatedBy != "alice" || updated.TicketId != ticket.Id {
		t.Errorf("updated = %+v, must keep created_by/ticket_id", updated)
	}

	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/comments/%d", comment.Id), data.Comment{}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "PUT", "/api/comments/9999", data.Comment{Content: "x"}), http.StatusNotFound)
}

func TestTicketHistories(t *testing.T) {
	handler := newTestServer(t)
	created := createTicket(t, handler, data.Ticket{Title: "初版", Content: "本文1", Tags: "status:OPEN", CreatedBy: "alice"})

	w := request(t, handler, "PUT", fmt.Sprintf("/api/tickets/%d", created.Id),
		data.Ticket{Title: "改版", Content: "本文2", Tags: "status:WIP", UpdatedBy: "bob"})
	assertStatus(t, w, http.StatusOK)

	// 作成時・編集時の版が古い順に返り、各版を作成した人が記録される
	w = request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d/histories", created.Id), nil)
	assertStatus(t, w, http.StatusOK)
	histories := decodeBody[[]data.TicketHistory](t, w)
	if len(histories) != 2 {
		t.Fatalf("histories = %d entries, want 2", len(histories))
	}
	if histories[0].TicketId != created.Id || histories[0].Title != "初版" || histories[0].Tags != "status:OPEN" || histories[0].CreatedBy != "alice" {
		t.Errorf("histories[0] = %+v, want 初版 by alice", histories[0])
	}
	if histories[1].Title != "改版" || histories[1].Content != "本文2" || histories[1].CreatedBy != "bob" {
		t.Errorf("histories[1] = %+v, want 改版 by bob", histories[1])
	}

	// 存在しないチケットは空配列
	w = request(t, handler, "GET", "/api/tickets/9999/histories", nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.TicketHistory](t, w); len(got) != 0 {
		t.Errorf("histories of missing ticket = %+v, want empty", got)
	}

	assertErrorResponse(t, request(t, handler, "GET", "/api/tickets/abc/histories", nil), http.StatusBadRequest)
}

func TestCommentHistories(t *testing.T) {
	handler := newTestServer(t)
	ticket := createTicket(t, handler, data.Ticket{Title: "チケット", Content: "本文"})
	w := request(t, handler, "POST", fmt.Sprintf("/api/tickets/%d/comments", ticket.Id), data.Comment{Content: "初版コメント", CreatedBy: "alice"})
	assertStatus(t, w, http.StatusCreated)
	comment := decodeBody[data.Comment](t, w)

	w = request(t, handler, "PUT", fmt.Sprintf("/api/comments/%d", comment.Id), data.Comment{Content: "改版コメント", UpdatedBy: "bob"})
	assertStatus(t, w, http.StatusOK)

	// 作成時・編集時の版が古い順に返り、各版を作成した人が記録される
	w = request(t, handler, "GET", fmt.Sprintf("/api/comments/%d/histories", comment.Id), nil)
	assertStatus(t, w, http.StatusOK)
	histories := decodeBody[[]data.CommentHistory](t, w)
	if len(histories) != 2 {
		t.Fatalf("histories = %d entries, want 2", len(histories))
	}
	if histories[0].CommentId != comment.Id || histories[0].Content != "初版コメント" || histories[0].CreatedBy != "alice" {
		t.Errorf("histories[0] = %+v, want 初版コメント by alice", histories[0])
	}
	if histories[1].Content != "改版コメント" || histories[1].CreatedBy != "bob" {
		t.Errorf("histories[1] = %+v, want 改版コメント by bob", histories[1])
	}

	// 存在しないコメントは空配列
	w = request(t, handler, "GET", "/api/comments/9999/histories", nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.CommentHistory](t, w); len(got) != 0 {
		t.Errorf("histories of missing comment = %+v, want empty", got)
	}

	assertErrorResponse(t, request(t, handler, "GET", "/api/comments/abc/histories", nil), http.StatusBadRequest)
}

func TestUserSubRecording(t *testing.T) {
	handler := newTestServerWithUserHeader(t, "X-Test-User")

	// 作成時: created_sub/updated_subはヘッダ値から設定され、ボディでのsub指定は無視される。
	// Cloud IAP形式の "accounts.google.com:" プレフィックスは ":" 以降が採用される
	w := requestWithHeader(t, handler, "POST", "/api/tickets",
		data.Ticket{Title: "sub記録", Content: "本文", CreatedBy: "alice", CreatedSub: "spoofed", UpdatedBy: "spoofed", UpdatedSub: "spoofed"},
		"X-Test-User", "accounts.google.com:sub-alice")
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.Ticket](t, w)
	if created.CreatedSub != "sub-alice" || created.UpdatedSub != "sub-alice" {
		t.Errorf("created subs = %q/%q, want sub-alice (from header)", created.CreatedSub, created.UpdatedSub)
	}
	if created.UpdatedBy != "alice" {
		t.Errorf("updated_by = %q, want alice (creator)", created.UpdatedBy)
	}

	// 編集時: ボディのupdated_byとヘッダ由来のupdated_subが保存され、created_by/created_subは維持される
	w = requestWithHeader(t, handler, "PUT", fmt.Sprintf("/api/tickets/%d", created.Id),
		data.Ticket{Title: "編集後", Content: "本文", UpdatedBy: "bob", CreatedSub: "spoofed", UpdatedSub: "spoofed"},
		"X-Test-User", "accounts.google.com:sub-bob")
	assertStatus(t, w, http.StatusOK)
	updated := decodeBody[data.Ticket](t, w)
	if updated.CreatedBy != "alice" || updated.CreatedSub != "sub-alice" {
		t.Errorf("created = %q/%q, want alice/sub-alice (must keep original)", updated.CreatedBy, updated.CreatedSub)
	}
	if updated.UpdatedBy != "bob" || updated.UpdatedSub != "sub-bob" {
		t.Errorf("updated = %q/%q, want bob/sub-bob", updated.UpdatedBy, updated.UpdatedSub)
	}

	// GETのレスポンスにもsubが含まれる
	w = request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d", created.Id), nil)
	assertStatus(t, w, http.StatusOK)
	got := decodeBody[data.Ticket](t, w)
	if got.CreatedSub != "sub-alice" || got.UpdatedSub != "sub-bob" {
		t.Errorf("got subs = %q/%q, want sub-alice/sub-bob", got.CreatedSub, got.UpdatedSub)
	}

	// コメント作成: プレフィックスなしのヘッダ値はそのまま採用される
	w = requestWithHeader(t, handler, "POST", fmt.Sprintf("/api/tickets/%d/comments", created.Id),
		data.Comment{Content: "コメント", CreatedBy: "carol", CreatedSub: "spoofed"},
		"X-Test-User", "sub-carol")
	assertStatus(t, w, http.StatusCreated)
	comment := decodeBody[data.Comment](t, w)
	if comment.CreatedSub != "sub-carol" || comment.UpdatedSub != "sub-carol" {
		t.Errorf("comment subs = %q/%q, want sub-carol", comment.CreatedSub, comment.UpdatedSub)
	}

	// コメント編集: ボディのupdated_byとヘッダ由来のupdated_subが保存される
	w = requestWithHeader(t, handler, "PUT", fmt.Sprintf("/api/comments/%d", comment.Id),
		data.Comment{Content: "編集後コメント", UpdatedBy: "dave", UpdatedSub: "spoofed"},
		"X-Test-User", "accounts.google.com:sub-dave")
	assertStatus(t, w, http.StatusOK)
	edited := decodeBody[data.Comment](t, w)
	if edited.CreatedBy != "carol" || edited.CreatedSub != "sub-carol" {
		t.Errorf("comment created = %q/%q, must keep original", edited.CreatedBy, edited.CreatedSub)
	}
	if edited.UpdatedBy != "dave" || edited.UpdatedSub != "sub-dave" {
		t.Errorf("comment updated = %q/%q, want dave/sub-dave", edited.UpdatedBy, edited.UpdatedSub)
	}
}

func TestUserSubDisabled(t *testing.T) {
	handler := newTestServer(t)

	// -user-header未指定時はヘッダを送ってもsubは空文字で記録される（現行動作）
	w := requestWithHeader(t, handler, "POST", "/api/tickets",
		data.Ticket{Title: "フラグなし", Content: "本文", CreatedBy: "alice"},
		"X-Goog-Authenticated-User-Id", "accounts.google.com:sub-alice")
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.Ticket](t, w)
	if created.CreatedSub != "" || created.UpdatedSub != "" {
		t.Errorf("subs = %q/%q, want empty (header disabled)", created.CreatedSub, created.UpdatedSub)
	}

	w = requestWithHeader(t, handler, "POST", fmt.Sprintf("/api/tickets/%d/comments", created.Id),
		data.Comment{Content: "コメント", CreatedBy: "bob"},
		"X-Goog-Authenticated-User-Id", "accounts.google.com:sub-bob")
	assertStatus(t, w, http.StatusCreated)
	if comment := decodeBody[data.Comment](t, w); comment.CreatedSub != "" || comment.UpdatedSub != "" {
		t.Errorf("comment subs = %q/%q, want empty (header disabled)", comment.CreatedSub, comment.UpdatedSub)
	}
}

func TestTicketBacklinks(t *testing.T) {
	handler := newTestServer(t)
	target := createTicket(t, handler, data.Ticket{Title: "参照される側", Content: "本文"})
	fromContent := createTicket(t, handler, data.Ticket{Title: "本文から参照", Content: fmt.Sprintf("関連: #%d を参照", target.Id)})
	fromComment := createTicket(t, handler, data.Ticket{Title: "コメントから参照", Content: "本文"})
	w := request(t, handler, "POST", fmt.Sprintf("/api/tickets/%d/comments", fromComment.Id),
		data.Comment{Content: fmt.Sprintf("#%d と同件", target.Id)})
	assertStatus(t, w, http.StatusCreated)

	// 桁違いのID（#10 など）は #1 のバックリンクに含まれない
	createTicket(t, handler, data.Ticket{Title: "桁違い", Content: fmt.Sprintf("#%d0 は別件", target.Id)})

	// 自己参照は含まれない
	w = request(t, handler, "PUT", fmt.Sprintf("/api/tickets/%d", target.Id),
		data.Ticket{Title: target.Title, Content: fmt.Sprintf("自分自身 #%d への言及", target.Id)})
	assertStatus(t, w, http.StatusOK)

	w = request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d/backlinks", target.Id), nil)
	assertStatus(t, w, http.StatusOK)
	got := decodeBody[[]data.Ticket](t, w)
	ids := map[int64]bool{}
	for _, ticket := range got {
		ids[ticket.Id] = true
	}
	if len(got) != 2 || !ids[fromContent.Id] || !ids[fromComment.Id] {
		t.Errorf("backlinks = %+v, want tickets %d and %d", got, fromContent.Id, fromComment.Id)
	}

	// 参照されていないチケットは空配列
	w = request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d/backlinks", fromContent.Id), nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.Ticket](t, w); len(got) != 0 {
		t.Errorf("backlinks of unreferenced ticket = %+v, want empty", got)
	}

	assertErrorResponse(t, request(t, handler, "GET", "/api/tickets/abc/backlinks", nil), http.StatusBadRequest)
}

func TestTemplateCrud(t *testing.T) {
	handler := newTestServer(t)

	// 初期状態は空配列
	w := request(t, handler, "GET", "/api/templates", nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.Template](t, w); len(got) != 0 {
		t.Errorf("templates on empty = %+v", got)
	}

	// 作成
	w = request(t, handler, "POST", "/api/templates",
		data.Template{Name: "バグ報告", Title: "【バグ】", Content: "## 再現手順\n", Tags: "type:BUG status:OPEN"})
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.Template](t, w)
	if created.Id <= 0 || created.Name != "バグ報告" || created.Title != "【バグ】" || created.Tags != "type:BUG status:OPEN" {
		t.Errorf("created = %+v", created)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Errorf("timestamps not set: %+v", created)
	}

	// バリデーション（nameは必須）
	assertErrorResponse(t, request(t, handler, "POST", "/api/templates", data.Template{Title: "名前なし"}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "POST", "/api/templates", "{invalid json"), http.StatusBadRequest)

	// 一覧は名前順に返る
	w = request(t, handler, "POST", "/api/templates", data.Template{Name: "a-作業依頼"})
	assertStatus(t, w, http.StatusCreated)
	second := decodeBody[data.Template](t, w)
	w = request(t, handler, "GET", "/api/templates", nil)
	assertStatus(t, w, http.StatusOK)
	list := decodeBody[[]data.Template](t, w)
	if len(list) != 2 || list[0].Id != second.Id || list[1].Id != created.Id {
		t.Errorf("templates = %+v, want name order [%d %d]", list, second.Id, created.Id)
	}

	// 更新。created_atは維持される
	w = request(t, handler, "PUT", fmt.Sprintf("/api/templates/%d", created.Id),
		data.Template{Name: "不具合報告", Title: "【不具合】", Content: "## 事象\n", Tags: "type:BUG"})
	assertStatus(t, w, http.StatusOK)
	updated := decodeBody[data.Template](t, w)
	if updated.Name != "不具合報告" || updated.Title != "【不具合】" || updated.Tags != "type:BUG" {
		t.Errorf("updated = %+v", updated)
	}
	if !updated.CreatedAt.Equal(created.CreatedAt) {
		t.Errorf("created_at = %v, want %v (must keep original)", updated.CreatedAt, created.CreatedAt)
	}

	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/templates/%d", created.Id), data.Template{Title: "名前なし"}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "PUT", "/api/templates/9999", data.Template{Name: "x"}), http.StatusNotFound)

	// 削除。存在しないテンプレート（削除済みを含む）は404
	w = request(t, handler, "DELETE", fmt.Sprintf("/api/templates/%d", created.Id), nil)
	assertStatus(t, w, http.StatusNoContent)
	assertErrorResponse(t, request(t, handler, "DELETE", fmt.Sprintf("/api/templates/%d", created.Id), nil), http.StatusNotFound)
	assertErrorResponse(t, request(t, handler, "DELETE", "/api/templates/abc", nil), http.StatusBadRequest)
	w = request(t, handler, "GET", "/api/templates", nil)
	assertStatus(t, w, http.StatusOK)
	if got := decodeBody[[]data.Template](t, w); len(got) != 1 || got[0].Id != second.Id {
		t.Errorf("templates after delete = %+v, want [%d]", got, second.Id)
	}
}

func TestTagCreateDerivesAttributes(t *testing.T) {
	handler := newTestServer(t)

	tests := []struct {
		tag       string
		wantGroup bool
		wantRange bool
	}{
		{"priority:HIGH", true, false}, // タググループ
		{"start-date@:", true, true},   // 日時タグ
		{"estimate#:", true, true},     // 数値タグ
		{"docs/manual", false, false},  // 通常タグ
	}
	for _, tt := range tests {
		// is_group/is_rangeはリクエスト値を無視してタグ名から導出される
		w := request(t, handler, "POST", "/api/tags", data.Tag{Tag: tt.tag, IsGroup: !tt.wantGroup, IsRange: !tt.wantRange})
		assertStatus(t, w, http.StatusCreated)
		created := decodeBody[data.Tag](t, w)
		if created.Id <= 0 || created.IsGroup != tt.wantGroup || created.IsRange != tt.wantRange {
			t.Errorf("POST tag %q = %+v, want is_group=%v is_range=%v", tt.tag, created, tt.wantGroup, tt.wantRange)
		}
	}

	assertErrorResponse(t, request(t, handler, "POST", "/api/tags", data.Tag{}), http.StatusBadRequest)
}

func TestTagListUpdateDelete(t *testing.T) {
	handler := newTestServer(t)

	// 初期データが返る
	w := request(t, handler, "GET", "/api/tags", nil)
	assertStatus(t, w, http.StatusOK)
	seeded := len(decodeBody[[]data.Tag](t, w))
	if seeded == 0 {
		t.Fatal("GET /api/tags returned no seeded tags")
	}

	w = request(t, handler, "POST", "/api/tags", data.Tag{Tag: "priority:HIGH"})
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.Tag](t, w)

	// 編集で属性が再導出される（グループ → 通常タグ）
	w = request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d", created.Id), data.Tag{Tag: "urgent"})
	assertStatus(t, w, http.StatusOK)
	updated := decodeBody[data.Tag](t, w)
	if updated.Tag != "urgent" || updated.IsGroup || updated.IsRange {
		t.Errorf("updated = %+v", updated)
	}

	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d", created.Id), data.Tag{}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "PUT", "/api/tags/9999", data.Tag{Tag: "x"}), http.StatusNotFound)

	w = request(t, handler, "DELETE", fmt.Sprintf("/api/tags/%d", created.Id), nil)
	assertStatus(t, w, http.StatusNoContent)
	w = request(t, handler, "GET", "/api/tags", nil)
	assertStatus(t, w, http.StatusOK)
	if got := len(decodeBody[[]data.Tag](t, w)); got != seeded {
		t.Errorf("tags after delete = %d, want %d", got, seeded)
	}

	// 存在しないタグ（削除済みを含む）の削除は404
	assertErrorResponse(t, request(t, handler, "DELETE", fmt.Sprintf("/api/tags/%d", created.Id), nil), http.StatusNotFound)
	assertErrorResponse(t, request(t, handler, "DELETE", "/api/tags/9999", nil), http.StatusNotFound)
}

func TestTagReorder(t *testing.T) {
	handler := newTestServer(t)

	// statusグループのタグ名を一覧の並び順で返す
	statusOrder := func() (names []string, ids map[string]int64) {
		t.Helper()
		w := request(t, handler, "GET", "/api/tags", nil)
		assertStatus(t, w, http.StatusOK)
		ids = map[string]int64{}
		for _, tag := range decodeBody[[]data.Tag](t, w) {
			if strings.HasPrefix(tag.Tag, "status:") {
				names = append(names, tag.Tag)
				ids[tag.Tag] = tag.Id
			}
		}
		return names, ids
	}

	// シードはsort_order付きで投入されるため、定義順（アルファベット順ではない）で返る
	names, ids := statusOrder()
	if got, want := strings.Join(names, ","), "status:OPEN,status:WIP,status:DONE,status:CLOSE"; got != want {
		t.Fatalf("seeded order = %s, want %s", got, want)
	}

	// 並び替え後は指定したID順で返る
	w := request(t, handler, "PUT", "/api/tags/order", map[string][]int64{
		"ids": {ids["status:CLOSE"], ids["status:DONE"], ids["status:WIP"], ids["status:OPEN"]},
	})
	assertStatus(t, w, http.StatusNoContent)
	names, _ = statusOrder()
	if got, want := strings.Join(names, ","), "status:CLOSE,status:DONE,status:WIP,status:OPEN"; got != want {
		t.Errorf("reordered = %s, want %s", got, want)
	}

	// idsが空・未指定は400
	assertErrorResponse(t, request(t, handler, "PUT", "/api/tags/order", map[string]any{}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "PUT", "/api/tags/order", map[string][]int64{"ids": {}}), http.StatusBadRequest)
}

func TestTagRename(t *testing.T) {
	handler := newTestServer(t)

	target := createTicket(t, handler, data.Ticket{Title: "対象", Content: "本文", Tags: "feature:SEARCH status:OPEN", CreatedBy: "alice"})
	other := createTicket(t, handler, data.Ticket{Title: "対象外", Content: "本文", Tags: "status:OPEN", CreatedBy: "alice"})

	// チケット作成時に自動登録されたタグのIDを取得する
	tags := decodeBody[[]data.Tag](t, request(t, handler, "GET", "/api/tags", nil))
	var tagId int64
	for _, tag := range tags {
		if tag.Tag == "feature:SEARCH" {
			tagId = tag.Id
		}
	}
	if tagId == 0 {
		t.Fatal("feature:SEARCH not registered")
	}

	w := request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d/rename", tagId),
		map[string]any{"tag": "feature:FTS", "note": "検索機能", "updated_by": "bob"})
	assertStatus(t, w, http.StatusOK)
	renamed := decodeBody[data.Tag](t, w)
	if renamed.Tag != "feature:FTS" || !renamed.IsGroup {
		t.Errorf("renamed = %+v", renamed)
	}

	// 使用中チケットのタグが書き換わり、更新者が記録される
	got := decodeBody[data.Ticket](t, request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d", target.Id), nil))
	if got.Tags != "feature:FTS status:OPEN" {
		t.Errorf("ticket tags = %q, want %q", got.Tags, "feature:FTS status:OPEN")
	}
	if got.UpdatedBy != "bob" {
		t.Errorf("updated_by = %q, want bob", got.UpdatedBy)
	}
	// 使用していないチケットは変更されない
	untouched := decodeBody[data.Ticket](t, request(t, handler, "GET", fmt.Sprintf("/api/tickets/%d", other.Id), nil))
	if untouched.Tags != "status:OPEN" || !untouched.UpdatedAt.Equal(other.UpdatedAt) {
		t.Errorf("other ticket should be untouched: %+v", untouched)
	}

	// バリデーション・404・重複は既存のタグ編集と同じ
	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d/rename", tagId), map[string]any{"tag": "a b"}), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "PUT", "/api/tags/9999/rename", map[string]any{"tag": "x"}), http.StatusNotFound)
	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d/rename", tagId), map[string]any{"tag": "status:OPEN"}), http.StatusConflict)
}

func TestTagDuplicateConflict(t *testing.T) {
	handler := newTestServer(t)

	w := request(t, handler, "POST", "/api/tags", data.Tag{Tag: "priority:HIGH"})
	assertStatus(t, w, http.StatusCreated)

	// 同名タグの作成は409
	assertErrorResponse(t, request(t, handler, "POST", "/api/tags", data.Tag{Tag: "priority:HIGH"}), http.StatusConflict)

	// 既存タグ名への変更も409
	w = request(t, handler, "POST", "/api/tags", data.Tag{Tag: "priority:LOW"})
	assertStatus(t, w, http.StatusCreated)
	other := decodeBody[data.Tag](t, w)
	assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d", other.Id), data.Tag{Tag: "priority:HIGH"}), http.StatusConflict)
}

func TestTagNameValidation(t *testing.T) {
	handler := newTestServer(t)

	// 検索構文のメタ文字を含むタグ名は400
	invalid := []string{"a,b", "a|b", "a b", "a\tb", "全角　空白", "-lead"}
	for _, name := range invalid {
		assertErrorResponse(t, request(t, handler, "POST", "/api/tags", data.Tag{Tag: name}), http.StatusBadRequest)
	}

	w := request(t, handler, "POST", "/api/tags", data.Tag{Tag: "valid-tag"})
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.Tag](t, w)

	// 編集時も同じ検証が働く
	for _, name := range invalid {
		assertErrorResponse(t, request(t, handler, "PUT", fmt.Sprintf("/api/tags/%d", created.Id), data.Tag{Tag: name}), http.StatusBadRequest)
	}
}

func TestNormalizeTag(t *testing.T) {
	tests := []struct {
		tag       string
		wantGroup bool
		wantRange bool
	}{
		{"status:OPEN", true, false},
		{"due-date@:", true, true},
		{"due-date@:2026-01-01", true, true},
		{"estimate#:", true, true},
		{"estimate#:3", true, true},
		{"docs/design", false, false},
		{"plain", false, false},
		{":value", false, false}, // グループ名が空はグループ扱いしない
	}
	for _, tt := range tests {
		tag := data.Tag{Tag: tt.tag}
		normalizeTag(&tag)
		if tag.IsGroup != tt.wantGroup || tag.IsRange != tt.wantRange {
			t.Errorf("normalizeTag(%q) = is_group=%v is_range=%v, want %v %v", tt.tag, tag.IsGroup, tag.IsRange, tt.wantGroup, tt.wantRange)
		}
	}
}

// アップロード用のリクエストを送る（bodyはバイナリそのまま。contentTypeが空の場合はヘッダを付けない）
func uploadFile(t *testing.T, handler http.Handler, path, contentType string, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", path, bytes.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	return w
}

func TestFileUploadAndServe(t *testing.T) {
	handler := newTestServer(t)
	// 1x1透過PNG
	png := []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
		0x42, 0x60, 0x82,
	}

	w := uploadFile(t, handler, "/api/files?name=shot.png", "image/png", png)
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.File](t, w)
	if created.Id <= 0 || created.Name != "shot.png" || created.Mime != "image/png" || created.CreatedAt.IsZero() {
		t.Errorf("created = %+v", created)
	}

	// アップロードしたファイルがそのままのバイト列・MIMEで配信される
	filePath := fmt.Sprintf("/api/files/%d", created.Id)
	w = request(t, handler, "GET", filePath, nil)
	assertStatus(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}
	if !bytes.Equal(w.Body.Bytes(), png) {
		t.Errorf("served file = %d bytes, want %d bytes (same content)", w.Body.Len(), len(png))
	}
	// 画像はこれまで通りインライン表示（Content-Dispositionなし）
	if cd := w.Header().Get("Content-Disposition"); cd != "" {
		t.Errorf("Content-Disposition = %q, want empty for image", cd)
	}

	// キャッシュ系ヘッダが付与される
	if cc := w.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("Cache-Control = %q, want immutable", cc)
	}
	etag := w.Header().Get("ETag")
	if etag == "" {
		t.Error("ETag not set")
	}
	if w.Header().Get("Last-Modified") == "" {
		t.Error("Last-Modified not set")
	}

	// 条件付きGETは304を返す
	req := httptest.NewRequest("GET", filePath, nil)
	req.Header.Set("If-None-Match", etag)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusNotModified)
	if w.Body.Len() != 0 {
		t.Errorf("304 response has body: %d bytes", w.Body.Len())
	}

	// 旧URL（/api/images/{id}）でも同じ内容が配信される（既存本文の画像リンクの後方互換）
	w = request(t, handler, "GET", fmt.Sprintf("/api/images/%d", created.Id), nil)
	assertStatus(t, w, http.StatusOK)
	if !bytes.Equal(w.Body.Bytes(), png) {
		t.Errorf("served via /api/images = %d bytes, want %d bytes (same content)", w.Body.Len(), len(png))
	}

	// バリデーションと404
	assertErrorResponse(t, uploadFile(t, handler, "/api/files", "text/plain", nil), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "GET", "/api/files/9999", nil), http.StatusNotFound)
	assertErrorResponse(t, request(t, handler, "GET", "/api/files/abc", nil), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "GET", "/api/images/9999", nil), http.StatusNotFound)

	// アップロードは/api/filesへ一般化されたため、旧POST /api/imagesは404を返す
	assertErrorResponse(t, uploadFile(t, handler, "/api/images", "image/png", png), http.StatusNotFound)

	// 10MiB超は413
	assertErrorResponse(t, uploadFile(t, handler, "/api/files", "image/png", bytes.Repeat([]byte{0}, 10<<20+1)), http.StatusRequestEntityTooLarge)
}

func TestFileServeNonImageAsAttachment(t *testing.T) {
	handler := newTestServer(t)

	upload := func(path, contentType string, body []byte) data.File {
		t.Helper()
		w := uploadFile(t, handler, path, contentType, body)
		assertStatus(t, w, http.StatusCreated)
		return decodeBody[data.File](t, w)
	}

	// 画像以外はダウンロード（attachment）として配信され、ファイル名がfilenameに入る
	created := upload("/api/files?name=app.log", "text/plain", []byte("2026-07-06 ERROR boom"))
	w := request(t, handler, "GET", fmt.Sprintf("/api/files/%d", created.Id), nil)
	assertStatus(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); ct != "text/plain" {
		t.Errorf("Content-Type = %q, want text/plain", ct)
	}
	if cd := w.Header().Get("Content-Disposition"); cd != `attachment; filename=app.log` {
		t.Errorf("Content-Disposition = %q", cd)
	}
	if xcto := w.Header().Get("X-Content-Type-Options"); xcto != "nosniff" {
		t.Errorf("X-Content-Type-Options = %q, want nosniff", xcto)
	}

	// Content-Type未指定はapplication/octet-streamとして保存する。name未指定はfilenameなしのattachment
	created = upload("/api/files", "", []byte{0x00, 0x01})
	if created.Mime != "application/octet-stream" || created.Name != "" {
		t.Errorf("created = %+v", created)
	}
	w = request(t, handler, "GET", fmt.Sprintf("/api/files/%d", created.Id), nil)
	assertStatus(t, w, http.StatusOK)
	if cd := w.Header().Get("Content-Disposition"); cd != "attachment" {
		t.Errorf("Content-Disposition = %q, want attachment", cd)
	}

	// 非ASCIIのファイル名はRFC 2231のfilename*形式でエンコードされる
	created = upload("/api/files?name="+url.QueryEscape("ログ.txt"), "text/plain", []byte("x"))
	w = request(t, handler, "GET", fmt.Sprintf("/api/files/%d", created.Id), nil)
	if cd := w.Header().Get("Content-Disposition"); !strings.Contains(cd, "filename*=utf-8''") {
		t.Errorf("Content-Disposition = %q, want filename* encoding", cd)
	}
}

func TestStaticSpaFallback(t *testing.T) {
	t.Chdir(t.TempDir())
	staticDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte("<html>spa-index</html>"), 0644); err != nil {
		t.Fatalf("write index.html: %v", err)
	}
	dao, err := data.NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)
	handler := newServer(dao, os.DirFS(staticDir), "")

	// 未定義の/apiパスはSPAへフォールバックせずJSONの404を返す
	w := request(t, handler, "GET", "/api/unknown", nil)
	assertErrorResponse(t, w, http.StatusNotFound)
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	// メソッド違いの/apiパスも404
	assertErrorResponse(t, request(t, handler, "DELETE", "/api/tickets/1", nil), http.StatusNotFound)

	// /api以外の未知パスはindex.htmlへフォールバックする
	w = request(t, handler, "GET", "/unknown-page", nil)
	assertStatus(t, w, http.StatusOK)
	if !strings.Contains(w.Body.String(), "spa-index") {
		t.Errorf("SPA fallback body = %q, want index.html content", w.Body.String())
	}

	// APIは通常通り応答する
	w = request(t, handler, "GET", "/api/tags", nil)
	assertStatus(t, w, http.StatusOK)
}

func TestApiNotFoundWithoutStatic(t *testing.T) {
	handler := newTestServer(t)

	// 静的配信なしでも未定義の/apiパスはJSONの404を返す
	w := request(t, handler, "GET", "/api/unknown", nil)
	assertErrorResponse(t, w, http.StatusNotFound)
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
}

func TestRequestBodyTooLarge(t *testing.T) {
	handler := newTestServer(t)

	// 1MiBを超えるリクエストボディは413
	body := fmt.Sprintf(`{"title":"large","content":"%s"}`, strings.Repeat("a", 1<<20))
	assertErrorResponse(t, request(t, handler, "POST", "/api/tickets", body), http.StatusRequestEntityTooLarge)
}
