package data

import (
	"database/sql"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const (
	_DB_FILE = "./biletojy.db"
)

type Dao struct {
	db *sql.DB
}

type Ticket struct {
	Id        int64     `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Tags      string    `json:"tags"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Comment struct {
	Id        int64     `json:"id"`
	TicketId  int64     `json:"ticket_id"`
	Content   string    `json:"content"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Tag struct {
	Id      int64   `json:"id"`
	Tag     string  `json:"tag"`
	Note    *string `json:"note"`
	Color   *string `json:"color"`
	IsGroup bool    `json:"is_group"`
	IsRange bool    `json:"is_range"`
}

func NewDao() (*Dao, error) {
	db, err := sql.Open("sqlite3", _DB_FILE)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(_SQL_INIT); err != nil {
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
	if err := rebuildFtsIfNeeded(db); err != nil {
		db.Close()
		return nil, err
	}
	return &Dao{db: db}, nil
}

// bi-gram化されずに格納された旧FTSデータを再構築する（user_version=0の場合のみ一度だけ実行）
func rebuildFtsIfNeeded(db *sql.DB) error {
	var version int
	if err := db.QueryRow(_SQL_GET_USER_VERSION).Scan(&version); err != nil {
		return err
	}
	if version >= 1 {
		return nil
	}
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
		if _, err := tx.Exec(_SQL_ADD_TICKET_FTS, t.Id, Bigram(t.Title), Bigram(StripMarkdown(t.Content)), t.Tags, ""); err != nil {
			return err
		}
		if err := refreshCommentsFts(tx, t.Id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(_SQL_SET_USER_VERSION_1); err != nil {
		return err
	}
	return tx.Commit()
}

func (dao *Dao) Close() {
	dao.db.Close()
	dao.db = nil
}

// チケット検索。qはbi-gram全文検索、tagsはタグの完全一致または階層の前方一致で絞り込む。
// 日時タグは "due-date@:>=2026-01-01" のように比較演算子（>, <, >=, <=, =）付きで範囲指定できる
func (dao *Dao) QueryTickets(q string, tags []string) ([]Ticket, error) {
	query := _SQL_QUERY_TICKETS_BASE
	where := []string{}
	args := []any{}
	if q != "" {
		query += _SQL_QUERY_TICKETS_FTS
		where = append(where, `tickets_fts MATCH ?`)
		args = append(args, BigramQuery(q))
	}
	conds := []*rangeCond{}
	for _, tag := range tags {
		if c := parseRangeCond(tag); c != nil {
			// 値の比較はGo側で行い、SQLではグループの存在だけで絞り込む
			conds = append(conds, c)
			where = append(where, `' ' || t.tags LIKE '% ' || ? || '%'`)
			args = append(args, c.group)
			continue
		}
		where = append(where, `(' ' || t.tags || ' ' LIKE '% ' || ? || ' %' OR ' ' || t.tags || ' ' LIKE '% ' || ? || '/%')`)
		args = append(args, tag, tag)
	}
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, ` AND `)
	}
	query += ` ORDER BY t.updated_at DESC`

	rows, err := dao.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tickets := []Ticket{}
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.Id, &t.Title, &t.Content, &t.Tags, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		if !matchAllRangeConds(conds, t.Tags) {
			continue
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

func matchAllRangeConds(conds []*rangeCond, tags string) bool {
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
		var t Ticket
		var comments string
		if err := rows.Scan(&t.Id, &t.Title, &t.Content, &t.Tags, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt, &comments); err != nil {
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
	var t Ticket
	err := dao.db.QueryRow(_SQL_GET_TICKET, id).Scan(&t.Id, &t.Title, &t.Content, &t.Tags, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
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
	res, err := tx.Exec(_SQL_ADD_TICKET, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, ticket.CreatedAt, ticket.UpdatedAt)
	if err != nil {
		return err
	}
	ticket.Id, _ = res.LastInsertId()
	if _, err := tx.Exec(_SQL_ADD_TICKET_HISTORY, ticket.Id, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, now); err != nil {
		return err
	}
	if _, err := tx.Exec(_SQL_ADD_TICKET_FTS, ticket.Id, Bigram(ticket.Title), Bigram(StripMarkdown(ticket.Content)), ticket.Tags, ""); err != nil {
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
	if _, err := tx.Exec(_SQL_EDIT_TICKET, ticket.Title, ticket.Content, ticket.Tags, ticket.UpdatedAt, ticket.Id); err != nil {
		return err
	}
	if _, err := tx.Exec(_SQL_ADD_TICKET_HISTORY, ticket.Id, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, now); err != nil {
		return err
	}
	if _, err := tx.Exec(_SQL_EDIT_TICKET_FTS, Bigram(ticket.Title), Bigram(StripMarkdown(ticket.Content)), ticket.Tags, ticket.Id); err != nil {
		return err
	}
	return tx.Commit()
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
		if err := rows.Scan(&c.Id, &c.TicketId, &c.Content, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

func (dao *Dao) GetComment(id int64) (*Comment, error) {
	var c Comment
	err := dao.db.QueryRow(_SQL_GET_COMMENT, id).Scan(&c.Id, &c.TicketId, &c.Content, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
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
	res, err := tx.Exec(_SQL_ADD_COMMENT, comment.TicketId, comment.Content, comment.CreatedBy, comment.CreatedAt, comment.UpdatedAt)
	if err != nil {
		return err
	}
	comment.Id, _ = res.LastInsertId()
	if _, err := tx.Exec(_SQL_ADD_COMMENT_HISTORY, comment.Id, comment.Content, now); err != nil {
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
	if _, err := tx.Exec(_SQL_EDIT_COMMENT, comment.Content, comment.UpdatedAt, comment.Id); err != nil {
		return err
	}
	if _, err := tx.Exec(_SQL_ADD_COMMENT_HISTORY, comment.Id, comment.Content, now); err != nil {
		return err
	}
	if err := refreshCommentsFts(tx, comment.TicketId); err != nil {
		return err
	}
	return tx.Commit()
}

// チケットの全コメントを結合してFTSのcommentsカラムを再構築する
func refreshCommentsFts(tx *sql.Tx, ticketId int64) error {
	rows, err := tx.Query(_SQL_QUERY_COMMENTS, ticketId)
	if err != nil {
		return err
	}
	defer rows.Close()
	contents := []string{}
	for rows.Next() {
		var c Comment
		if err := rows.Scan(&c.Id, &c.TicketId, &c.Content, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return err
		}
		contents = append(contents, c.Content)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	joined := Bigram(StripMarkdown(strings.Join(contents, " ")))
	_, err = tx.Exec(_SQL_EDIT_COMMENT_FTS, joined, ticketId)
	return err
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
		if err := rows.Scan(&t.Id, &t.Tag, &t.Note, &t.Color, &t.IsGroup, &t.IsRange); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func (dao *Dao) GetTag(id int64) (*Tag, error) {
	var t Tag
	err := dao.db.QueryRow(_SQL_GET_TAG, id).Scan(&t.Id, &t.Tag, &t.Note, &t.Color, &t.IsGroup, &t.IsRange)
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

func (dao *Dao) DeleteTag(id int64) error {
	_, err := dao.db.Exec(_SQL_DELETE_TAG, id)
	return err
}
