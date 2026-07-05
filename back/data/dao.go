package data

import (
	"database/sql"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// _time_format=sqlite はmattn/go-sqlite3と互換のタイムスタンプ書式（既存DBを引き続き読み書きできる）。
// busy_timeoutはmattn/go-sqlite3のデフォルトに合わせて5秒
const (
	_DB_FILE = "./biletojy.db?_time_format=sqlite&_pragma=busy_timeout(5000)"
)

type Dao struct {
	db *sql.DB
}

type Ticket struct {
	Id         int64     `json:"id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Tags       string    `json:"tags"`
	CreatedBy  string    `json:"created_by"`
	CreatedSub string    `json:"created_sub"`
	UpdatedBy  string    `json:"updated_by"`
	UpdatedSub string    `json:"updated_sub"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type Comment struct {
	Id         int64     `json:"id"`
	TicketId   int64     `json:"ticket_id"`
	Content    string    `json:"content"`
	CreatedBy  string    `json:"created_by"`
	CreatedSub string    `json:"created_sub"`
	UpdatedBy  string    `json:"updated_by"`
	UpdatedSub string    `json:"updated_sub"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// チケットの版（作成・編集時点の内容）。created_by/created_subはその版を作成した人
type TicketHistory struct {
	Id         int64     `json:"id"`
	TicketId   int64     `json:"ticket_id"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	Tags       string    `json:"tags"`
	CreatedBy  string    `json:"created_by"`
	CreatedSub string    `json:"created_sub"`
	CreatedAt  time.Time `json:"created_at"`
}

// コメントの版（作成・編集時点の内容）。created_by/created_subはその版を作成した人
type CommentHistory struct {
	Id         int64     `json:"id"`
	CommentId  int64     `json:"comment_id"`
	Content    string    `json:"content"`
	CreatedBy  string    `json:"created_by"`
	CreatedSub string    `json:"created_sub"`
	CreatedAt  time.Time `json:"created_at"`
}

// 貼り付け添付された画像。バイナリ本体はJSONに含めず配信APIで返す
type Image struct {
	Id        int64     `json:"id"`
	Mime      string    `json:"mime"`
	Data      []byte    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
}

type Tag struct {
	Id        int64   `json:"id"`
	Tag       string  `json:"tag"`
	Note      *string `json:"note"`
	Color     *string `json:"color"`
	IsGroup   bool    `json:"is_group"`
	IsRange   bool    `json:"is_range"`
	SortOrder int64   `json:"sort_order"`
}

func NewDao() (*Dao, error) {
	db, err := sql.Open("sqlite", _DB_FILE)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(_SQL_INIT); err != nil {
		db.Close()
		return nil, err
	}
	// シードはtag_catalogのカラム（v4のsort_order）が揃ってから投入するため、マイグレーションを先に行う
	if err := migrate(db); err != nil {
		db.Close()
		return nil, err
	}
	var count int
	if err := db.QueryRow(_SQL_COUNT_TAG_CATALOG).Scan(&count); err != nil {
		db.Close()
		return nil, err
	}
	if count == 0 {
		if _, err := db.Exec(_SQL_INIT_TAG_CATALOG); err != nil {
			db.Close()
			return nil, err
		}
	}
	return &Dao{db: db}, nil
}

// user_versionが現行より古いDBへのスキーマ移行。
//   - v2未満: 旧形式（bi-gram化前や旧トークナイズ）で格納されたFTSデータを再構築する
//   - v3未満: sub関連カラムを追加する（新規DBは_SQL_INITで作成済みのため、カラムの有無で判定する）
//   - v4未満: tag_catalogへsort_orderカラムを追加する（同上）
func migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow(_SQL_GET_USER_VERSION).Scan(&version); err != nil {
		return err
	}
	if version >= _SCHEMA_VERSION {
		return nil
	}
	if version < 2 {
		if err := rebuildFts(db); err != nil {
			return err
		}
	}
	var count int
	if err := db.QueryRow(_SQL_COUNT_SUB_COLUMN).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		for _, q := range _SQL_ADD_SUB_COLUMNS {
			if _, err := db.Exec(q); err != nil {
				return err
			}
		}
	}
	if err := db.QueryRow(_SQL_COUNT_SORT_ORDER_COLUMN).Scan(&count); err != nil {
		return err
	}
	if count == 0 {
		if _, err := db.Exec(_SQL_ADD_SORT_ORDER_COLUMN); err != nil {
			return err
		}
		// カラム追加直後（＝並び替え未設定）に限り、プリセットのstatusタグへシードと同じ並び順を設定する
		if _, err := db.Exec(_SQL_BACKFILL_STATUS_ORDER); err != nil {
			return err
		}
	}
	_, err := db.Exec(_SQL_SET_USER_VERSION)
	return err
}

// FTSテーブルを全チケットから再構築する
func rebuildFts(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(_SQL_DELETE_ALL_TICKET_FTS); err != nil {
		return err
	}
	rows, err := tx.Query(_SQL_QUERY_TICKETS_FOR_FTS)
	if err != nil {
		return err
	}
	defer rows.Close()
	tickets := []Ticket{}
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.Id, &t.Title, &t.Content, &t.Tags); err != nil {
			return err
		}
		tickets = append(tickets, t)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, t := range tickets {
		title, content, tags := ftsValues(&t)
		if _, err := tx.Exec(_SQL_ADD_TICKET_FTS, t.Id, title, content, tags, ""); err != nil {
			return err
		}
		if err := refreshCommentsFts(tx, t.Id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (dao *Dao) Close() {
	dao.db.Close()
}

// SQLiteのUNIQUE制約違反エラーかどうか
func IsUniqueConstraintErr(err error) bool {
	var se *sqlite.Error
	return errors.As(err, &se) && se.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE
}

// チケットの10カラム（id〜updated_at）をスキャンする。extraで追加カラムの格納先を渡せる
func scanTicket(row interface{ Scan(...any) error }, extra ...any) (Ticket, error) {
	var t Ticket
	dest := append([]any{&t.Id, &t.Title, &t.Content, &t.Tags, &t.CreatedBy, &t.CreatedSub, &t.UpdatedBy, &t.UpdatedSub, &t.CreatedAt, &t.UpdatedAt}, extra...)
	return t, row.Scan(dest...)
}

// FTSへ格納する値（bi-gramトークナイズ済みのtitle, content, tags）を組み立てる
func ftsValues(t *Ticket) (title, content, tags string) {
	return Bigram(t.Title), Bigram(StripMarkdown(t.Content)), Bigram(t.Tags)
}

// チケット検索。qはbi-gram全文検索、tagsはタグ条件のAND絞り込み。
// 各条件は完全一致または階層の前方一致で、先頭 "-" で除外（NOT）、"|" 区切りでOR指定できる。
// 日時タグ・数値タグは "due-date@:>=2026-01-01" "estimate#:>=2" のように比較演算子（>, <, >=, <=, =）付きで範囲指定できる。
// NOT/ORを含むタグ条件はSQLに落とし込みにくいため、タグの絞り込みはGo側で行う
func (dao *Dao) QueryTickets(q string, tags []string) ([]Ticket, error) {
	query := _SQL_QUERY_TICKETS_BASE
	args := []any{}
	// 空白のみ・記号のみの検索語は空のMATCH式（構文エラー）になるため、変換後に判定する
	if match := BigramQuery(q); match != "" {
		query += _SQL_QUERY_TICKETS_FTS + ` WHERE tickets_fts MATCH ?`
		args = append(args, match)
	}
	query += ` ORDER BY t.updated_at DESC`

	conds := []*tagCond{}
	for _, tag := range tags {
		if c := parseTagCond(tag); c != nil {
			conds = append(conds, c)
		}
	}

	rows, err := dao.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tickets := []Ticket{}
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			return nil, err
		}
		if !matchAllTagConds(conds, t.Tags) {
			continue
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

func matchAllTagConds(conds []*tagCond, tags string) bool {
	for _, c := range conds {
		if !c.match(tags) {
			return false
		}
	}
	return true
}

// idのチケットを本文またはコメント中の #id 形式で参照しているチケットを返す（自分自身は除く）。
// LIKEでは #123 の検索が #1234 にもマッチするため、後続が数字でないことを正規表現で確認する
func (dao *Dao) QueryBacklinks(id int64) ([]Ticket, error) {
	idText := strconv.FormatInt(id, 10)
	ref := regexp.MustCompile(`#` + idText + `(\D|$)`)
	pattern := `%#` + idText + `%`
	rows, err := dao.db.Query(_SQL_QUERY_BACKLINKS, id, pattern, pattern)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tickets := []Ticket{}
	for rows.Next() {
		var comments string
		t, err := scanTicket(rows, &comments)
		if err != nil {
			return nil, err
		}
		if !ref.MatchString(t.Content + " " + comments) {
			continue
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

func (dao *Dao) GetTicket(id int64) (*Ticket, error) {
	t, err := scanTicket(dao.db.QueryRow(_SQL_GET_TICKET, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (dao *Dao) AddTicket(ticket *Ticket) error {
	tx, err := dao.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	ticket.CreatedAt = now
	ticket.UpdatedAt = now
	res, err := tx.Exec(_SQL_ADD_TICKET, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, ticket.CreatedSub, ticket.UpdatedBy, ticket.UpdatedSub, ticket.CreatedAt, ticket.UpdatedAt)
	if err != nil {
		return err
	}
	ticket.Id, _ = res.LastInsertId()
	if _, err := tx.Exec(_SQL_ADD_TICKET_HISTORY, ticket.Id, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, ticket.CreatedSub, now); err != nil {
		return err
	}
	title, content, tags := ftsValues(ticket)
	if _, err := tx.Exec(_SQL_ADD_TICKET_FTS, ticket.Id, title, content, tags, ""); err != nil {
		return err
	}
	return tx.Commit()
}

func (dao *Dao) EditTicket(ticket *Ticket) error {
	tx, err := dao.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	ticket.UpdatedAt = now
	if _, err := tx.Exec(_SQL_EDIT_TICKET, ticket.Title, ticket.Content, ticket.Tags, ticket.UpdatedBy, ticket.UpdatedSub, ticket.UpdatedAt, ticket.Id); err != nil {
		return err
	}
	// 履歴のcreated_by/created_subは「その版を作成した人」＝編集者を記録する
	if _, err := tx.Exec(_SQL_ADD_TICKET_HISTORY, ticket.Id, ticket.Title, ticket.Content, ticket.Tags, ticket.UpdatedBy, ticket.UpdatedSub, now); err != nil {
		return err
	}
	title, content, tags := ftsValues(ticket)
	if _, err := tx.Exec(_SQL_EDIT_TICKET_FTS, title, content, tags, ticket.Id); err != nil {
		return err
	}
	return tx.Commit()
}

// チケットの履歴を古い版から順に返す
func (dao *Dao) QueryTicketHistories(ticketId int64) ([]TicketHistory, error) {
	rows, err := dao.db.Query(_SQL_QUERY_TICKET_HISTORIES, ticketId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	histories := []TicketHistory{}
	for rows.Next() {
		var h TicketHistory
		if err := rows.Scan(&h.Id, &h.TicketId, &h.Title, &h.Content, &h.Tags, &h.CreatedBy, &h.CreatedSub, &h.CreatedAt); err != nil {
			return nil, err
		}
		histories = append(histories, h)
	}
	return histories, rows.Err()
}

// コメントの履歴を古い版から順に返す
func (dao *Dao) QueryCommentHistories(commentId int64) ([]CommentHistory, error) {
	rows, err := dao.db.Query(_SQL_QUERY_COMMENT_HISTORIES, commentId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	histories := []CommentHistory{}
	for rows.Next() {
		var h CommentHistory
		if err := rows.Scan(&h.Id, &h.CommentId, &h.Content, &h.CreatedBy, &h.CreatedSub, &h.CreatedAt); err != nil {
			return nil, err
		}
		histories = append(histories, h)
	}
	return histories, rows.Err()
}

func (dao *Dao) QueryComments(ticketId int64) ([]Comment, error) {
	rows, err := dao.db.Query(_SQL_QUERY_COMMENTS, ticketId)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	comments := []Comment{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.Id, &c.TicketId, &c.Content, &c.CreatedBy, &c.CreatedSub, &c.UpdatedBy, &c.UpdatedSub, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (dao *Dao) GetComment(id int64) (*Comment, error) {
	var c Comment
	err := dao.db.QueryRow(_SQL_GET_COMMENT, id).Scan(&c.Id, &c.TicketId, &c.Content, &c.CreatedBy, &c.CreatedSub, &c.UpdatedBy, &c.UpdatedSub, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (dao *Dao) AddComment(comment *Comment) error {
	tx, err := dao.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	comment.CreatedAt = now
	comment.UpdatedAt = now
	res, err := tx.Exec(_SQL_ADD_COMMENT, comment.TicketId, comment.Content, comment.CreatedBy, comment.CreatedSub, comment.UpdatedBy, comment.UpdatedSub, comment.CreatedAt, comment.UpdatedAt)
	if err != nil {
		return err
	}
	comment.Id, _ = res.LastInsertId()
	if _, err := tx.Exec(_SQL_ADD_COMMENT_HISTORY, comment.Id, comment.Content, comment.CreatedBy, comment.CreatedSub, now); err != nil {
		return err
	}
	if err := refreshCommentsFts(tx, comment.TicketId); err != nil {
		return err
	}
	return tx.Commit()
}

func (dao *Dao) EditComment(comment *Comment) error {
	tx, err := dao.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	comment.UpdatedAt = now
	if _, err := tx.Exec(_SQL_EDIT_COMMENT, comment.Content, comment.UpdatedBy, comment.UpdatedSub, comment.UpdatedAt, comment.Id); err != nil {
		return err
	}
	// 履歴のcreated_by/created_subは「その版を作成した人」＝編集者を記録する
	if _, err := tx.Exec(_SQL_ADD_COMMENT_HISTORY, comment.Id, comment.Content, comment.UpdatedBy, comment.UpdatedSub, now); err != nil {
		return err
	}
	if err := refreshCommentsFts(tx, comment.TicketId); err != nil {
		return err
	}
	return tx.Commit()
}

// チケットの全コメントを結合してFTSのcommentsカラムを再構築する
func refreshCommentsFts(tx *sql.Tx, ticketId int64) error {
	rows, err := tx.Query(_SQL_QUERY_COMMENT_CONTENTS, ticketId)
	if err != nil {
		return err
	}
	defer rows.Close()
	contents := []string{}
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err != nil {
			return err
		}
		contents = append(contents, content)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	joined := Bigram(StripMarkdown(strings.Join(contents, " ")))
	_, err = tx.Exec(_SQL_EDIT_COMMENT_FTS, joined, ticketId)
	return err
}

func (dao *Dao) AddImage(image *Image) error {
	image.CreatedAt = time.Now()
	res, err := dao.db.Exec(_SQL_ADD_IMAGE, image.Mime, image.Data, image.CreatedAt)
	if err != nil {
		return err
	}
	image.Id, _ = res.LastInsertId()
	return nil
}

func (dao *Dao) GetImage(id int64) (*Image, error) {
	var img Image
	err := dao.db.QueryRow(_SQL_GET_IMAGE, id).Scan(&img.Id, &img.Mime, &img.Data, &img.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &img, nil
}

func (dao *Dao) QueryTags() ([]Tag, error) {
	rows, err := dao.db.Query(_SQL_QUERY_TAGS)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tags := []Tag{}
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.Id, &t.Tag, &t.Note, &t.Color, &t.IsGroup, &t.IsRange, &t.SortOrder); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func (dao *Dao) GetTag(id int64) (*Tag, error) {
	var t Tag
	err := dao.db.QueryRow(_SQL_GET_TAG, id).Scan(&t.Id, &t.Tag, &t.Note, &t.Color, &t.IsGroup, &t.IsRange, &t.SortOrder)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (dao *Dao) AddTag(tag *Tag) error {
	res, err := dao.db.Exec(_SQL_ADD_TAG, tag.Tag, tag.Note, tag.Color, tag.IsGroup, tag.IsRange)
	if err != nil {
		return err
	}
	tag.Id, _ = res.LastInsertId()
	return nil
}

func (dao *Dao) EditTag(tag *Tag) error {
	_, err := dao.db.Exec(_SQL_EDIT_TAG, tag.Tag, tag.Note, tag.Color, tag.IsGroup, tag.IsRange, tag.Id)
	return err
}

// 指定した並び順どおりにsort_orderへ1からの連番を振り直す（タググループ内の並び替え用）
func (dao *Dao) ReorderTags(ids []int64) error {
	tx, err := dao.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for i, id := range ids {
		if _, err := tx.Exec(_SQL_SET_TAG_ORDER, i+1, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// タグを削除する。該当行がなければfalseを返す
func (dao *Dao) DeleteTag(id int64) (bool, error) {
	res, err := dao.db.Exec(_SQL_DELETE_TAG, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
