package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/yosiopp/biletojy/data"
)

// 貼り付け・ドロップで添付するファイルの上限サイズ
const _MAX_FILE_BYTES = 10 << 20

// インライン表示で配信する画像のMIMEタイプ。これ以外はHTML等の埋め込み実行を防ぐためダウンロードとして配信する
var inlineImageMimes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/gif":  true,
	"image/webp": true,
}

func newServer(dao *data.Dao, static fs.FS, userHeader string) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/tickets", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		tags := []string{}
		if v := r.URL.Query().Get("tags"); v != "" {
			tags = strings.Split(v, ",")
		}
		tickets, err := dao.QueryTickets(q, tags)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, tickets)
	})

	mux.HandleFunc("POST /api/tickets", func(w http.ResponseWriter, r *http.Request) {
		var ticket data.Ticket
		if !readJson(w, r, &ticket) {
			return
		}
		if ticket.Title == "" {
			writeErrorMessage(w, http.StatusBadRequest, "title is required")
			return
		}
		if ticket.CreatedBy == "" {
			ticket.CreatedBy = "anonymous"
		}
		// subはヘッダ由来の値のみを記録する（ボディでの指定は無視）。作成時は更新者=作成者
		sub := requestSub(r)
		ticket.CreatedSub = sub
		ticket.UpdatedBy = ticket.CreatedBy
		ticket.UpdatedSub = sub
		if err := dao.AddTicket(&ticket); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, ticket)
	})

	mux.HandleFunc("GET /api/tickets/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		ticket, ok := fetchOr404(w, dao.GetTicket, id, "ticket")
		if !ok {
			return
		}
		writeJson(w, http.StatusOK, ticket)
	})

	mux.HandleFunc("PUT /api/tickets/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		current, ok := fetchOr404(w, dao.GetTicket, id, "ticket")
		if !ok {
			return
		}
		var ticket data.Ticket
		if !readJson(w, r, &ticket) {
			return
		}
		if ticket.Title == "" {
			writeErrorMessage(w, http.StatusBadRequest, "title is required")
			return
		}
		ticket.Id = id
		ticket.CreatedBy = current.CreatedBy
		ticket.CreatedSub = current.CreatedSub
		ticket.CreatedAt = current.CreatedAt
		// updated_byはボディのクライアント申告値、updated_subはヘッダ由来の値を採用する
		if ticket.UpdatedBy == "" {
			ticket.UpdatedBy = "anonymous"
		}
		ticket.UpdatedSub = requestSub(r)
		if err := dao.EditTicket(&ticket); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, ticket)
	})

	mux.HandleFunc("GET /api/tickets/{id}/comments", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		comments, err := dao.QueryComments(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, comments)
	})

	mux.HandleFunc("GET /api/tickets/{id}/histories", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		histories, err := dao.QueryTicketHistories(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, histories)
	})

	mux.HandleFunc("GET /api/comments/{id}/histories", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		histories, err := dao.QueryCommentHistories(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, histories)
	})

	mux.HandleFunc("GET /api/tickets/{id}/backlinks", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		tickets, err := dao.QueryBacklinks(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, tickets)
	})

	mux.HandleFunc("POST /api/tickets/{id}/comments", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		if _, ok := fetchOr404(w, dao.GetTicket, id, "ticket"); !ok {
			return
		}
		var comment data.Comment
		if !readJson(w, r, &comment) {
			return
		}
		if comment.Content == "" {
			writeErrorMessage(w, http.StatusBadRequest, "content is required")
			return
		}
		comment.TicketId = id
		if comment.CreatedBy == "" {
			comment.CreatedBy = "anonymous"
		}
		// subはヘッダ由来の値のみを記録する（ボディでの指定は無視）。作成時は更新者=作成者
		sub := requestSub(r)
		comment.CreatedSub = sub
		comment.UpdatedBy = comment.CreatedBy
		comment.UpdatedSub = sub
		if err := dao.AddComment(&comment); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, comment)
	})

	mux.HandleFunc("PUT /api/comments/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		current, ok := fetchOr404(w, dao.GetComment, id, "comment")
		if !ok {
			return
		}
		var comment data.Comment
		if !readJson(w, r, &comment) {
			return
		}
		if comment.Content == "" {
			writeErrorMessage(w, http.StatusBadRequest, "content is required")
			return
		}
		current.Content = comment.Content
		// updated_byはボディのクライアント申告値、updated_subはヘッダ由来の値を採用する
		current.UpdatedBy = comment.UpdatedBy
		if current.UpdatedBy == "" {
			current.UpdatedBy = "anonymous"
		}
		current.UpdatedSub = requestSub(r)
		if err := dao.EditComment(current); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, current)
	})

	// チケットのエクスポート。検索と同じ条件（q, tags）で絞り込んだチケットをコメント込みで、
	// JSON（機械可読・再インポート用）またはmarkdown（人間可読）のダウンロードとして返す
	mux.HandleFunc("GET /api/export", func(w http.ResponseWriter, r *http.Request) {
		format := r.URL.Query().Get("format")
		if format == "" {
			format = "json"
		}
		if format != "json" && format != "markdown" {
			writeErrorMessage(w, http.StatusBadRequest, "format must be json or markdown")
			return
		}
		q := r.URL.Query().Get("q")
		tags := []string{}
		if v := r.URL.Query().Get("tags"); v != "" {
			tags = strings.Split(v, ",")
		}
		tickets, err := dao.ExportTickets(q, tags)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if format == "markdown" {
			w.Header().Set("Content-Disposition", `attachment; filename="biletojy-export.md"`)
			w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
			io.WriteString(w, exportMarkdown(tickets))
			return
		}
		w.Header().Set("Content-Disposition", `attachment; filename="biletojy-export.json"`)
		writeJson(w, http.StatusOK, struct {
			ExportedAt time.Time           `json:"exported_at"`
			Tickets    []data.TicketExport `json:"tickets"`
		}{time.Now(), tickets})
	})

	// エクスポートしたJSONデータのインポート。チケット・コメントは新規IDで登録され、
	// 作成者・更新者・sub・タイムスタンプはデータの値をそのまま引き継ぐ（バックアップの復元用）
	mux.HandleFunc("POST /api/import", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Tickets []data.TicketExport `json:"tickets"`
		}
		// エクスポートデータは通常のリクエストより大きくなるため、上限は添付ファイルと同じ10MiB
		if !readJsonLimit(w, r, &req, _MAX_FILE_BYTES) {
			return
		}
		if len(req.Tickets) == 0 {
			writeErrorMessage(w, http.StatusBadRequest, "tickets is required")
			return
		}
		for i := range req.Tickets {
			ticket := &req.Tickets[i]
			if ticket.Title == "" {
				writeErrorMessage(w, http.StatusBadRequest, fmt.Sprintf("tickets[%d]: title is required", i))
				return
			}
			if ticket.CreatedBy == "" {
				ticket.CreatedBy = "anonymous"
			}
			if ticket.UpdatedBy == "" {
				ticket.UpdatedBy = ticket.CreatedBy
			}
			for j := range ticket.Comments {
				comment := &ticket.Comments[j]
				if comment.Content == "" {
					writeErrorMessage(w, http.StatusBadRequest, fmt.Sprintf("tickets[%d].comments[%d]: content is required", i, j))
					return
				}
				if comment.CreatedBy == "" {
					comment.CreatedBy = "anonymous"
				}
				if comment.UpdatedBy == "" {
					comment.UpdatedBy = comment.CreatedBy
				}
			}
		}
		if err := dao.ImportTickets(req.Tickets); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, map[string]int{"imported": len(req.Tickets)})
	})

	mux.HandleFunc("POST /api/files", func(w http.ResponseWriter, r *http.Request) {
		mimeType := r.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, _MAX_FILE_BYTES))
		if err != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				writeErrorMessage(w, http.StatusRequestEntityTooLarge, "file too large")
				return
			}
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if len(body) == 0 {
			writeErrorMessage(w, http.StatusBadRequest, "file is required")
			return
		}
		file := data.File{Name: r.URL.Query().Get("name"), Mime: mimeType, Data: body}
		if err := dao.AddFile(&file); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, file)
	})

	serveFile := func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		file, ok := fetchOr404(w, dao.GetFile, id, "file")
		if !ok {
			return
		}
		// ファイルは編集されないため長期キャッシュを許可し、IDをそのままETagにする。
		// ServeContentがLast-Modifiedの付与とIf-None-Match/If-Modified-Sinceによる304応答を処理する
		w.Header().Set("Content-Type", file.Mime)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("ETag", `"`+strconv.FormatInt(file.Id, 10)+`"`)
		// 画像以外はインライン表示させずダウンロードとして配信する（text/html等の埋め込み実行を防ぐ）
		if !inlineImageMimes[file.Mime] {
			disposition := "attachment"
			if file.Name != "" {
				// 非ASCIIのファイル名はRFC 2231のfilename*形式でエンコードされる
				disposition = mime.FormatMediaType("attachment", map[string]string{"filename": file.Name})
			}
			w.Header().Set("Content-Disposition", disposition)
			w.Header().Set("X-Content-Type-Options", "nosniff")
		}
		http.ServeContent(w, r, "", file.CreatedAt, bytes.NewReader(file.Data))
	}
	mux.HandleFunc("GET /api/files/{id}", serveFile)
	// ファイル一般化前の画像URL（/api/images/{id}）を参照している既存チケット本文のための後方互換エイリアス
	mux.HandleFunc("GET /api/images/{id}", serveFile)

	mux.HandleFunc("GET /api/templates", func(w http.ResponseWriter, r *http.Request) {
		templates, err := dao.QueryTemplates()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, templates)
	})

	mux.HandleFunc("POST /api/templates", func(w http.ResponseWriter, r *http.Request) {
		var tpl data.Template
		if !readJson(w, r, &tpl) {
			return
		}
		if tpl.Name == "" {
			writeErrorMessage(w, http.StatusBadRequest, "name is required")
			return
		}
		if err := dao.AddTemplate(&tpl); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, tpl)
	})

	mux.HandleFunc("PUT /api/templates/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		current, ok := fetchOr404(w, dao.GetTemplate, id, "template")
		if !ok {
			return
		}
		var tpl data.Template
		if !readJson(w, r, &tpl) {
			return
		}
		if tpl.Name == "" {
			writeErrorMessage(w, http.StatusBadRequest, "name is required")
			return
		}
		tpl.Id = id
		tpl.CreatedAt = current.CreatedAt
		if err := dao.EditTemplate(&tpl); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, tpl)
	})

	mux.HandleFunc("DELETE /api/templates/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		deleted, err := dao.DeleteTemplate(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if !deleted {
			writeErrorMessage(w, http.StatusNotFound, "template not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("GET /api/tags", func(w http.ResponseWriter, r *http.Request) {
		tags, err := dao.QueryTags()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, tags)
	})

	mux.HandleFunc("POST /api/tags", func(w http.ResponseWriter, r *http.Request) {
		tag := saveTag(w, r, dao.AddTag)
		if tag == nil {
			return
		}
		writeJson(w, http.StatusCreated, tag)
	})

	// グループ内の並び替え。送られたID順にsort_orderへ連番を振る
	// （リテラルの "order" はワイルドカードの {id} より優先してマッチする）
	mux.HandleFunc("PUT /api/tags/order", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Ids []int64 `json:"ids"`
		}
		if !readJson(w, r, &req) {
			return
		}
		if len(req.Ids) == 0 {
			writeErrorMessage(w, http.StatusBadRequest, "ids is required")
			return
		}
		if err := dao.ReorderTags(req.Ids); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("PUT /api/tags/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		if _, ok := fetchOr404(w, dao.GetTag, id, "tag"); !ok {
			return
		}
		tag := saveTag(w, r, func(tag *data.Tag) error {
			tag.Id = id
			return dao.EditTag(tag)
		})
		if tag == nil {
			return
		}
		writeJson(w, http.StatusOK, tag)
	})

	// タグ名の変更。カタログの更新に加え、そのタグを使用している全チケットのタグ表記も一括で書き換える
	mux.HandleFunc("PUT /api/tags/{id}/rename", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		if _, ok := fetchOr404(w, dao.GetTag, id, "tag"); !ok {
			return
		}
		var req struct {
			data.Tag
			UpdatedBy string `json:"updated_by"`
		}
		if !readJson(w, r, &req) {
			return
		}
		if msg := validateTag(req.Tag.Tag); msg != "" {
			writeErrorMessage(w, http.StatusBadRequest, msg)
			return
		}
		normalizeTag(&req.Tag)
		req.Tag.Id = id
		// 書き換えたチケットの更新者はチケット編集と同じくクライアント申告値＋ヘッダ由来のsub
		if req.UpdatedBy == "" {
			req.UpdatedBy = "anonymous"
		}
		if _, err := dao.RenameTag(&req.Tag, req.UpdatedBy, requestSub(r)); err != nil {
			if data.IsUniqueConstraintErr(err) {
				writeErrorMessage(w, http.StatusConflict, "tag already exists")
				return
			}
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, req.Tag)
	})

	mux.HandleFunc("DELETE /api/tags/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		deleted, err := dao.DeleteTag(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if !deleted {
			writeErrorMessage(w, http.StatusNotFound, "tag not found")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// 未定義・メソッド違いの /api リクエストはJSONの404を返す（上の個別パターンが優先される）
	apiNotFound := func(w http.ResponseWriter, r *http.Request) {
		writeErrorMessage(w, http.StatusNotFound, "not found")
	}
	mux.HandleFunc("/api/", apiNotFound)
	mux.HandleFunc("/api", apiNotFound)

	// フロントのビルド成果物（埋め込みまたは-static指定ディレクトリ）を配信
	// （SPAのためパスが無ければindex.htmlへフォールバック）
	if static != nil {
		fileServer := http.FileServerFS(static)
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
			if info, err := fs.Stat(static, name); err != nil || info.IsDir() {
				if r.URL.Path != "/" {
					http.ServeFileFS(w, r, static, "index.html")
					return
				}
			}
			fileServer.ServeHTTP(w, r)
		})
	}

	return withUserSub(mux, userHeader)
}

// contextへ保持した認証済みユーザ識別子(sub)のキー
type subKey struct{}

// -user-headerで指定されたリクエストヘッダから認証済みユーザの識別子(sub)を取り出しcontextへ保持する。
// Cloud IAPの "accounts.google.com:xxx" のようなプレフィックスは ":" 以降を採用する。
// ヘッダは信頼できる前提のため、IAPを迂回した直接アクセスはネットワーク層で遮断すること（docs/development.md参照）
func withUserSub(next http.Handler, header string) http.Handler {
	if header == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sub := r.Header.Get(header)
		if _, after, found := strings.Cut(sub, ":"); found {
			sub = after
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), subKey{}, sub)))
	})
}

// contextからsubを返す（-user-header未指定時は空文字）
func requestSub(r *http.Request) string {
	sub, _ := r.Context().Value(subKey{}).(string)
	return sub
}

// タググループ(:を含む)、日時・数値タグ(グループ名末尾@/#)の属性をタグ名から導出する
func normalizeTag(tag *data.Tag) {
	sep := strings.Index(tag.Tag, ":")
	tag.IsGroup = sep > 0
	tag.IsRange = sep > 0 && (strings.HasSuffix(tag.Tag[:sep], "@") || strings.HasSuffix(tag.Tag[:sep], "#"))
}

// タグ名を検証し、問題があればエラーメッセージを返す。
// "," "|" 空白は検索構文（カンマ区切り・OR・タグのスペース区切り）のメタ文字、先頭 "-" はNOT指定と衝突するため使えない
func validateTag(name string) string {
	switch {
	case name == "":
		return "tag is required"
	case strings.HasPrefix(name, "-"):
		return "tag must not start with '-'"
	case strings.ContainsAny(name, ",|"):
		return "tag must not contain ',' or '|'"
	case strings.ContainsFunc(name, unicode.IsSpace):
		return "tag must not contain whitespace"
	}
	return ""
}

// エンティティを取得する。エラーなら500、存在しなければ404（"<name> not found"）を書き込みfalseを返す
func fetchOr404[T any](w http.ResponseWriter, get func(int64) (*T, error), id int64, name string) (*T, bool) {
	v, err := get(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return nil, false
	}
	if v == nil {
		writeErrorMessage(w, http.StatusNotFound, name+" not found")
		return nil, false
	}
	return v, true
}

// タグの保存処理（検証 → 属性導出 → 保存。重複は409）。レスポンス書き込み済みならnilを返す
func saveTag(w http.ResponseWriter, r *http.Request, save func(*data.Tag) error) *data.Tag {
	var tag data.Tag
	if !readJson(w, r, &tag) {
		return nil
	}
	if msg := validateTag(tag.Tag); msg != "" {
		writeErrorMessage(w, http.StatusBadRequest, msg)
		return nil
	}
	normalizeTag(&tag)
	if err := save(&tag); err != nil {
		if data.IsUniqueConstraintErr(err) {
			writeErrorMessage(w, http.StatusConflict, "tag already exists")
			return nil
		}
		writeError(w, http.StatusInternalServerError, err)
		return nil
	}
	return &tag
}

func pathId(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErrorMessage(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}

// エクスポートのmarkdown表現を組み立てる（人間可読用。再インポートにはJSON形式を使う）
func exportMarkdown(tickets []data.TicketExport) string {
	const timeFormat = "2006-01-02 15:04"
	var b strings.Builder
	for i, t := range tickets {
		if i > 0 {
			b.WriteString("\n---\n\n")
		}
		fmt.Fprintf(&b, "# #%d %s\n\n", t.Id, t.Title)
		if t.Tags != "" {
			fmt.Fprintf(&b, "- tags: %s\n", t.Tags)
		}
		fmt.Fprintf(&b, "- created: %s (%s)\n", t.CreatedAt.Format(timeFormat), t.CreatedBy)
		fmt.Fprintf(&b, "- updated: %s (%s)\n", t.UpdatedAt.Format(timeFormat), t.UpdatedBy)
		if t.Content != "" {
			b.WriteString("\n" + strings.TrimRight(t.Content, "\n") + "\n")
		}
		if len(t.Comments) > 0 {
			b.WriteString("\n## コメント\n")
			for _, c := range t.Comments {
				fmt.Fprintf(&b, "\n### %s (%s)\n\n%s\n", c.CreatedBy, c.CreatedAt.Format(timeFormat), strings.TrimRight(c.Content, "\n"))
			}
		}
	}
	return b.String()
}

func readJson(w http.ResponseWriter, r *http.Request, v any) bool {
	return readJsonLimit(w, r, v, 1<<20)
}

// 上限サイズを指定してリクエストボディのJSONをデコードする（インポートなど大きなボディを受けるAPI用）
func readJsonLimit(w http.ResponseWriter, r *http.Request, v any, limit int64) bool {
	body := http.MaxBytesReader(w, r.Body, limit)
	if err := json.NewDecoder(body).Decode(v); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			writeErrorMessage(w, http.StatusRequestEntityTooLarge, "request body too large")
			return false
		}
		writeErrorMessage(w, http.StatusBadRequest, "invalid json: "+err.Error())
		return false
	}
	return true
}

func writeJson(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeErrorMessage(w, status, err.Error())
}

func writeErrorMessage(w http.ResponseWriter, status int, message string) {
	writeJson(w, status, map[string]string{"error": message})
}
