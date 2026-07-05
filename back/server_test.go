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

func TestImageUploadAndServe(t *testing.T) {
	handler := newTestServer(t)
	// 1x1透過PNG
	png := []byte{
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
		0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
		0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
		0x42, 0x60, 0x82,
	}

	upload := func(contentType string, body []byte) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest("POST", "/api/images", bytes.NewReader(body))
		req.Header.Set("Content-Type", contentType)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w
	}

	w := upload("image/png", png)
	assertStatus(t, w, http.StatusCreated)
	created := decodeBody[data.Image](t, w)
	if created.Id <= 0 || created.Mime != "image/png" || created.CreatedAt.IsZero() {
		t.Errorf("created = %+v", created)
	}

	// アップロードした画像がそのままのバイト列・MIMEで配信される
	imagePath := fmt.Sprintf("/api/images/%d", created.Id)
	w = request(t, handler, "GET", imagePath, nil)
	assertStatus(t, w, http.StatusOK)
	if ct := w.Header().Get("Content-Type"); ct != "image/png" {
		t.Errorf("Content-Type = %q, want image/png", ct)
	}
	if !bytes.Equal(w.Body.Bytes(), png) {
		t.Errorf("served image = %d bytes, want %d bytes (same content)", w.Body.Len(), len(png))
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
	req := httptest.NewRequest("GET", imagePath, nil)
	req.Header.Set("If-None-Match", etag)
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assertStatus(t, w, http.StatusNotModified)
	if w.Body.Len() != 0 {
		t.Errorf("304 response has body: %d bytes", w.Body.Len())
	}

	// バリデーションと404
	assertErrorResponse(t, upload("text/html", []byte("<html></html>")), http.StatusBadRequest)
	assertErrorResponse(t, upload("application/json", []byte("{}")), http.StatusBadRequest)
	assertErrorResponse(t, upload("image/png", nil), http.StatusBadRequest)
	assertErrorResponse(t, request(t, handler, "GET", "/api/images/9999", nil), http.StatusNotFound)
	assertErrorResponse(t, request(t, handler, "GET", "/api/images/abc", nil), http.StatusBadRequest)

	// 10MiB超は413
	assertErrorResponse(t, upload("image/png", bytes.Repeat([]byte{0}, 10<<20+1)), http.StatusRequestEntityTooLarge)
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
