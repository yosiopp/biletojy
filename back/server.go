package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode"

	"github.com/yosiopp/biletojy/data"
)

func newServer(dao *data.Dao, staticDir string) http.Handler {
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
		ticket.CreatedAt = current.CreatedAt
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
		if err := dao.EditComment(current); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, current)
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

	// フロントのビルド成果物を配信（SPAのためパスが無ければindex.htmlへフォールバック）
	if staticDir != "" {
		fs := http.FileServer(http.Dir(staticDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			path := filepath.Join(staticDir, filepath.Clean(r.URL.Path))
			if info, err := os.Stat(path); err != nil || info.IsDir() {
				if r.URL.Path != "/" {
					http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
					return
				}
			}
			fs.ServeHTTP(w, r)
		})
	}

	return mux
}

// タググループ(:を含む)、日時タグ(グループ名末尾@)の属性をタグ名から導出する
func normalizeTag(tag *data.Tag) {
	sep := strings.Index(tag.Tag, ":")
	tag.IsGroup = sep > 0
	tag.IsRange = sep > 0 && strings.HasSuffix(tag.Tag[:sep], "@")
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
