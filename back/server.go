package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

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
		ticket, err := dao.GetTicket(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if ticket == nil {
			writeErrorMessage(w, http.StatusNotFound, "ticket not found")
			return
		}
		writeJson(w, http.StatusOK, ticket)
	})

	mux.HandleFunc("PUT /api/tickets/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		current, err := dao.GetTicket(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if current == nil {
			writeErrorMessage(w, http.StatusNotFound, "ticket not found")
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

	mux.HandleFunc("POST /api/tickets/{id}/comments", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		ticket, err := dao.GetTicket(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if ticket == nil {
			writeErrorMessage(w, http.StatusNotFound, "ticket not found")
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
		current, err := dao.GetComment(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if current == nil {
			writeErrorMessage(w, http.StatusNotFound, "comment not found")
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
		var tag data.Tag
		if !readJson(w, r, &tag) {
			return
		}
		if tag.Tag == "" {
			writeErrorMessage(w, http.StatusBadRequest, "tag is required")
			return
		}
		normalizeTag(&tag)
		if err := dao.AddTag(&tag); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusCreated, tag)
	})

	mux.HandleFunc("PUT /api/tags/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		current, err := dao.GetTag(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if current == nil {
			writeErrorMessage(w, http.StatusNotFound, "tag not found")
			return
		}
		var tag data.Tag
		if !readJson(w, r, &tag) {
			return
		}
		if tag.Tag == "" {
			writeErrorMessage(w, http.StatusBadRequest, "tag is required")
			return
		}
		tag.Id = id
		normalizeTag(&tag)
		if err := dao.EditTag(&tag); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJson(w, http.StatusOK, tag)
	})

	mux.HandleFunc("DELETE /api/tags/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, ok := pathId(w, r)
		if !ok {
			return
		}
		if err := dao.DeleteTag(id); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

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

	return withCors(mux)
}

// タググループ(:を含む)、日時タグ(グループ名末尾@)の属性をタグ名から導出する
func normalizeTag(tag *data.Tag) {
	sep := strings.Index(tag.Tag, ":")
	tag.IsGroup = sep > 0
	tag.IsRange = sep > 0 && strings.HasSuffix(tag.Tag[:sep], "@")
}

func withCors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
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
