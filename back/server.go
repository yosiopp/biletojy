package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strconv"
	"strings"
	"unicode"

	"github.com/yosiopp/biletojy/data"
)

// 貼り付け添付画像の上限サイズと受け付けるMIMEタイプ
const _MAX_IMAGE_BYTES = 10 << 20

var allowedImageMimes = map[string]bool{
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

	mux.HandleFunc("POST /api/images", func(w http.ResponseWriter, r *http.Request) {
		mime := r.Header.Get("Content-Type")
		if !allowedImageMimes[mime] {
			writeErrorMessage(w, http.StatusBadRequest, "unsupported image type")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, _MAX_IMAGE_BYTES))
		if err != nil {
			var maxBytesErr *http.MaxBytesError
			if errors.As(err, &maxBytesErr) {
				writeErrorMessage(w, http.StatusRequestEntityTooLarge, "image too large")
				return
			}
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if len(body) == 0 {
			writeErrorMessage(w, http.StatusBadRequest, "image is required")
			return
		}
		image := data.Image{Mime: mime, Data: body}
		if err := dao.AddImage(&image); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, image)
	})

	mux.HandleFunc("GET /api/images/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		image, ok := fetchOr404(w, dao.GetImage, id, "image")
		if !ok {
			return
		}
		// 画像は編集されないため長期キャッシュを許可し、IDをそのままETagにする。
		// ServeContentがLast-Modifiedの付与とIf-None-Match/If-Modified-Sinceによる304応答を処理する
		w.Header().Set("Content-Type", image.Mime)
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("ETag", `"`+strconv.FormatInt(image.Id, 10)+`"`)
		http.ServeContent(w, r, "", image.CreatedAt, bytes.NewReader(image.Data))
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

func readJson(w http.ResponseWriter, r *http.Request, v any) bool {
	body := http.MaxBytesReader(w, r.Body, 1<<20)
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
