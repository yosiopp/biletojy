package data

import (
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"slices"
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

// 貼り付け・ドロップで添付されたファイル（画像を含む）。バイナリ本体はJSONに含めず配信APIで返す
type File struct {
	Id        int64     `json:"id"`
	Name      string    `json:"name"`
	Mime      string    `json:"mime"`
	Data      []byte    `json:"-"`
	CreatedAt time.Time `json:"created_at"`
}

// エクスポート/インポートで受け渡すチケット（コメント込み）
type TicketExport struct {
	Ticket
	Comments []Comment `json:"comments"`
}

// チケット作成時に適用するタイトル・本文・タグの雛形
type Template struct {
	Id        int64     `json:"id"`
	Name      string    `json:"name"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Tags      string    `json:"tags"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
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
//   - v3未満: sub関連カラムを追加する（新規DBは_SQL_INITで作成済みのため、カラムの有無で判定する）
//   - v4未満: tag_catalogへsort_orderカラムを追加する（同上）
//   - v5未満: 旧imagesテーブルの内容をfilesテーブルへ移行する（テーブルの有無で判定する）
//   - v6未満: プリセットのstatus:CLOSEタグをstatus:CLOSEDへ改名し、チケットのタグ表記も書き換える
//   - v7未満: FTSを再構築し、rowidへチケットIDを設定する
//     （v2の旧トークナイズ形式からの再構築もこの全件再構築が兼ねる）
func migrate(db *sql.DB) error {
	var version int
	if err := db.QueryRow(_SQL_GET_USER_VERSION).Scan(&version); err != nil {
		return err
	}
	if version >= _SCHEMA_VERSION {
		return nil
	}
	if version < 7 {
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
	if err := db.QueryRow(_SQL_COUNT_IMAGES_TABLE).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		// IDを引き継いでfilesへ移す（ファイル名は記録がないため空）
		if _, err := db.Exec(_SQL_MIGRATE_IMAGES_TO_FILES); err != nil {
			return err
		}
		if _, err := db.Exec(_SQL_DROP_IMAGES_TABLE); err != nil {
			return err
		}
	}
	if err := renameCloseTag(db); err != nil {
		return err
	}
	_, err := db.Exec(fmt.Sprintf("PRAGMA user_version = %d", _SCHEMA_VERSION))
	return err
}

// v6: プリセットのstatus:CLOSEタグをstatus:CLOSEDへ改名し、使用中チケットのタグ表記とFTSも書き換える。
// ユーザー操作によるRenameTagと異なりスキーマ移行のため、更新者・更新日時・履歴は変更しない
func renameCloseTag(db *sql.DB) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(_SQL_RENAME_CLOSE_TAG); err != nil {
		return err
	}
	if _, err := rewriteTicketTags(tx, "status:CLOSE", "status:CLOSED", func(t Ticket, tags string) error {
		_, err := tx.Exec(_SQL_MIGRATE_TICKET_TAGS, tags, t.Id)
		return err
	}); err != nil {
		return err
	}
	return tx.Commit()
}

// oldNameを使用している全チケットのタグ表記をnewNameへ書き換え、FTSも更新する。
// チケット本体の保存（履歴・更新者の扱いは呼び出し側による）はupdateへ書き換え後のタグとともに委ねる。
// 書き換えたチケット数を返す
func rewriteTicketTags(tx *sql.Tx, oldName, newName string, update func(t Ticket, tags string) error) (int, error) {
	// LIKEは上位集合を返す（oldNameを含むだけのタグにもマッチする）が、
	// replaceTagTokensのトークン単位の判定で実際の書き換え対象が決まる
	tickets, err := queryTicketsByTagPattern(tx, "%"+oldName+"%")
	if err != nil {
		return 0, err
	}

	updated := 0
	for _, t := range tickets {
		tags, changed := replaceTagTokens(t.Tags, oldName, newName)
		if !changed {
			continue
		}
		if err := update(t, tags); err != nil {
			return 0, err
		}
		if _, err := tx.Exec(_SQL_EDIT_TICKET_FTS_TAGS, Bigram(tags), t.Id); err != nil {
			return 0, err
		}
		updated++
	}
	return updated, nil
}

// タグのLIKEパターンに一致するチケットを返す（rewriteTicketTagsの候補取得用）
func queryTicketsByTagPattern(tx *sql.Tx, pattern string) ([]Ticket, error) {
	rows, err := tx.Query(_SQL_QUERY_TICKETS_BY_TAG, pattern)
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
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

// FTSの再構築対象（全チケットのid, title, content, tags）を返す
func queryTicketsForFts(tx *sql.Tx) ([]Ticket, error) {
	rows, err := tx.Query(_SQL_QUERY_TICKETS_FOR_FTS)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tickets := []Ticket{}
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.Id, &t.Title, &t.Content, &t.Tags); err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
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
	tickets, err := queryTicketsForFts(tx)
	if err != nil {
		return err
	}
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
// NOT/ORを含むタグ条件はSQLに落とし込みにくいため、タグの厳密な判定はGo側で行う
// （肯定条件はLIKEで候補を事前に絞り、全件の本文込みスキャンを避ける）。
// 検索条件（q, tags）に一致するチケットをupdated_at降順で返す。
// limit > 0 のとき一致した先頭limit件で打ち切る（0で全件）。タグ条件がある場合は
// Go側の判定後に数えるためSQLのLIMITは使えず、タグ条件がない場合のみSQLで打ち切る
func (dao *Dao) QueryTickets(q string, tags []string, limit int) ([]Ticket, error) {
	conds := []*tagCond{}
	for _, tag := range tags {
		if c := parseTagCond(tag); c != nil {
			conds = append(conds, c)
		}
	}

	query := _SQL_QUERY_TICKETS_BASE
	args := []any{}
	where := []string{}
	// 空白のみ・記号のみの検索語は空のMATCH式（構文エラー）になるため、変換後に判定する
	if match := BigramQuery(q); match != "" {
		query += _SQL_QUERY_TICKETS_FTS
		where = append(where, `tickets_fts MATCH ?`)
		args = append(args, match)
	}
	// 肯定条件はLIKEで候補を事前に絞る（rewriteTicketTagsと同じ2段構え。
	// LIKEは上位集合を返すため、厳密な一致判定は従来通り下のループで行う）
	for _, c := range conds {
		if cond, condArgs := c.likeCond(); cond != "" {
			where = append(where, cond)
			args = append(args, condArgs...)
		}
	}
	if len(where) > 0 {
		query += ` WHERE ` + strings.Join(where, ` AND `)
	}
	query += ` ORDER BY t.updated_at DESC`
	if limit > 0 && len(conds) == 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
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
		// タグの分割は条件・択ごとに繰り返さず、チケットごとに1回だけ行う
		if len(conds) > 0 && !matchAllTagConds(conds, strings.Fields(t.Tags)) {
			continue
		}
		tickets = append(tickets, t)
		if limit > 0 && len(tickets) == limit {
			break
		}
	}
	return tickets, rows.Err()
}

// 分割済みのタグ群がすべてのタグ条件を満たすか
func matchAllTagConds(conds []*tagCond, tags []string) bool {
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

// チケットに付与されたタグのうちタグカタログ未定義のものを自動登録する。
// 既存タグ名を1回のSELECTで取得し、未定義の差分だけINSERTする（タグごとの集計付きINSERTを避ける）。
// 日時・数値タグ（グループ名末尾 @/#）は値ごとではなくグループ（例: "due-date@:"）として登録する。
// タグAPIの検証（TagNameError）に通らない名前はカタログに登録できないため除外する
func registerUnknownTags(tx *sql.Tx, tags string) error {
	fields := strings.Fields(tags)
	if len(fields) == 0 {
		return nil
	}
	known, err := queryTagNames(tx)
	if err != nil {
		return err
	}
	for _, tag := range fields {
		sep := strings.Index(tag, ":")
		isGroup, isRange := TagAttrs(tag)
		if isRange {
			tag = tag[:sep+1]
		}
		if known[tag] || TagNameError(tag) != "" {
			continue
		}
		// 一覧のセクション区分（_SQL_QUERY_TAGSと同じ。グループ接頭辞、値なしのグループエントリは ":"、
		// グループでないタグは ""）を渡し、同一セクションの末尾に並ぶsort_orderを設定させる
		var section string
		switch {
		case sep <= 0:
			section = ""
		case sep == len(tag)-1:
			section = ":"
		default:
			section = tag[:sep+1]
		}
		if _, err := tx.Exec(_SQL_ADD_UNKNOWN_TAG, tag, isGroup, isRange, section); err != nil {
			return err
		}
		known[tag] = true
	}
	return nil
}

// タグカタログの全タグ名を集合として返す（未定義タグの差分判定用）
func queryTagNames(tx *sql.Tx) (map[string]bool, error) {
	rows, err := tx.Query(_SQL_QUERY_TAG_NAMES)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	names := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names[name] = true
	}
	return names, rows.Err()
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
	if err := insertTicket(tx, ticket); err != nil {
		return err
	}
	return tx.Commit()
}

// チケットの登録本体（タイムスタンプは設定済みであること）。
// 履歴の追加・FTSへの登録・カタログ未定義タグの自動登録もここで行う（インポートと共用）
func insertTicket(tx *sql.Tx, ticket *Ticket) error {
	res, err := tx.Exec(_SQL_ADD_TICKET, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, ticket.CreatedSub, ticket.UpdatedBy, ticket.UpdatedSub, ticket.CreatedAt, ticket.UpdatedAt)
	if err != nil {
		return err
	}
	ticket.Id, _ = res.LastInsertId()
	if _, err := tx.Exec(_SQL_ADD_TICKET_HISTORY, ticket.Id, ticket.Title, ticket.Content, ticket.Tags, ticket.CreatedBy, ticket.CreatedSub, ticket.CreatedAt); err != nil {
		return err
	}
	title, content, tags := ftsValues(ticket)
	if _, err := tx.Exec(_SQL_ADD_TICKET_FTS, ticket.Id, title, content, tags, ""); err != nil {
		return err
	}
	return registerUnknownTags(tx, ticket.Tags)
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
	if err := registerUnknownTags(tx, ticket.Tags); err != nil {
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
		c, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, rows.Err()
}

// コメントの9カラム（id〜updated_at）をスキャンする
func scanComment(row interface{ Scan(...any) error }) (Comment, error) {
	var c Comment
	return c, row.Scan(&c.Id, &c.TicketId, &c.Content, &c.CreatedBy, &c.CreatedSub, &c.UpdatedBy, &c.UpdatedSub, &c.CreatedAt, &c.UpdatedAt)
}

func (dao *Dao) GetComment(id int64) (*Comment, error) {
	c, err := scanComment(dao.db.QueryRow(_SQL_GET_COMMENT, id))
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
	if err := insertComment(tx, comment); err != nil {
		return err
	}
	if err := refreshCommentsFts(tx, comment.TicketId); err != nil {
		return err
	}
	return tx.Commit()
}

// コメントの登録本体（タイムスタンプは設定済みであること）。履歴の追加もここで行う（インポートと共用）。
// FTSのcommentsカラムは呼び出し側でrefreshCommentsFtsを実行して再構築する
func insertComment(tx *sql.Tx, comment *Comment) error {
	res, err := tx.Exec(_SQL_ADD_COMMENT, comment.TicketId, comment.Content, comment.CreatedBy, comment.CreatedSub, comment.UpdatedBy, comment.UpdatedSub, comment.CreatedAt, comment.UpdatedAt)
	if err != nil {
		return err
	}
	comment.Id, _ = res.LastInsertId()
	_, err = tx.Exec(_SQL_ADD_COMMENT_HISTORY, comment.Id, comment.Content, comment.CreatedBy, comment.CreatedSub, comment.CreatedAt)
	return err
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

// エクスポート用に検索条件（QueryTicketsと同じq, tags）に一致するチケットをコメント込みで返す
func (dao *Dao) ExportTickets(q string, tags []string) ([]TicketExport, error) {
	tickets, err := dao.QueryTickets(q, tags, 0)
	if err != nil {
		return nil, err
	}
	ids := make([]int64, len(tickets))
	for i, t := range tickets {
		ids[i] = t.Id
	}
	byTicket, err := dao.queryCommentsByTickets(ids)
	if err != nil {
		return nil, err
	}
	exports := []TicketExport{}
	for _, t := range tickets {
		comments := byTicket[t.Id]
		if comments == nil {
			comments = []Comment{}
		}
		exports = append(exports, TicketExport{Ticket: t, Comments: comments})
	}
	return exports, nil
}

// 指定したチケットID群のコメントをチケットごとにまとめて返す（チケットごとのN+1クエリを避けるエクスポート用）
func (dao *Dao) queryCommentsByTickets(ids []int64) (map[int64][]Comment, error) {
	byTicket := map[int64][]Comment{}
	// SQLiteのバインド変数上限を超えないようINのプレースホルダをチャンク単位で展開する
	for chunk := range slices.Chunk(ids, 500) {
		if err := dao.queryCommentsChunk(chunk, byTicket); err != nil {
			return nil, err
		}
	}
	return byTicket, nil
}

// 1チャンク分のコメントを取得してbyTicketへ格納する
func (dao *Dao) queryCommentsChunk(chunk []int64, byTicket map[int64][]Comment) error {
	query := fmt.Sprintf(_SQL_QUERY_COMMENTS_BY_TICKETS, strings.TrimSuffix(strings.Repeat("?,", len(chunk)), ","))
	args := make([]any, len(chunk))
	for i, id := range chunk {
		args[i] = id
	}
	rows, err := dao.db.Query(query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return err
		}
		byTicket[c.TicketId] = append(byTicket[c.TicketId], c)
	}
	return rows.Err()
}

// エクスポートデータのチケット（コメント込み）をひとつのトランザクションで登録する。
// IDは元の値によらず新規に採番し、通常の作成と同じ経路で履歴の追加・FTSへの登録・
// カタログ未定義タグの自動登録も行う。作成者・更新者とタイムスタンプはエクスポート時の値を
// 引き継ぐ（タイムスタンプ未設定時はインポート時刻）。履歴はインポート後の内容の1版のみ記録される
func (dao *Dao) ImportTickets(tickets []TicketExport) error {
	tx, err := dao.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	now := time.Now()
	for i := range tickets {
		t := &tickets[i]
		t.Id = 0
		if t.CreatedAt.IsZero() {
			t.CreatedAt = now
		}
		if t.UpdatedAt.IsZero() {
			t.UpdatedAt = t.CreatedAt
		}
		if err := insertTicket(tx, &t.Ticket); err != nil {
			return err
		}
		for j := range t.Comments {
			c := &t.Comments[j]
			c.Id = 0
			c.TicketId = t.Id
			if c.CreatedAt.IsZero() {
				c.CreatedAt = now
			}
			if c.UpdatedAt.IsZero() {
				c.UpdatedAt = c.CreatedAt
			}
			if err := insertComment(tx, c); err != nil {
				return err
			}
		}
		if len(t.Comments) > 0 {
			if err := refreshCommentsFts(tx, t.Id); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (dao *Dao) AddFile(file *File) error {
	file.CreatedAt = time.Now()
	res, err := dao.db.Exec(_SQL_ADD_FILE, file.Name, file.Mime, file.Data, file.CreatedAt)
	if err != nil {
		return err
	}
	file.Id, _ = res.LastInsertId()
	return nil
}

func (dao *Dao) GetFile(id int64) (*File, error) {
	var f File
	err := dao.db.QueryRow(_SQL_GET_FILE, id).Scan(&f.Id, &f.Name, &f.Mime, &f.Data, &f.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// テンプレートを名前順（同名は登録順）に返す
func (dao *Dao) QueryTemplates() ([]Template, error) {
	rows, err := dao.db.Query(_SQL_QUERY_TEMPLATES)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	templates := []Template{}
	for rows.Next() {
		var tpl Template
		if err := rows.Scan(&tpl.Id, &tpl.Name, &tpl.Title, &tpl.Content, &tpl.Tags, &tpl.CreatedAt, &tpl.UpdatedAt); err != nil {
			return nil, err
		}
		templates = append(templates, tpl)
	}
	return templates, rows.Err()
}

func (dao *Dao) GetTemplate(id int64) (*Template, error) {
	var tpl Template
	err := dao.db.QueryRow(_SQL_GET_TEMPLATE, id).Scan(&tpl.Id, &tpl.Name, &tpl.Title, &tpl.Content, &tpl.Tags, &tpl.CreatedAt, &tpl.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &tpl, nil
}

func (dao *Dao) AddTemplate(tpl *Template) error {
	now := time.Now()
	tpl.CreatedAt = now
	tpl.UpdatedAt = now
	res, err := dao.db.Exec(_SQL_ADD_TEMPLATE, tpl.Name, tpl.Title, tpl.Content, tpl.Tags, tpl.CreatedAt, tpl.UpdatedAt)
	if err != nil {
		return err
	}
	tpl.Id, _ = res.LastInsertId()
	return nil
}

func (dao *Dao) EditTemplate(tpl *Template) error {
	tpl.UpdatedAt = time.Now()
	_, err := dao.db.Exec(_SQL_EDIT_TEMPLATE, tpl.Name, tpl.Title, tpl.Content, tpl.Tags, tpl.UpdatedAt, tpl.Id)
	return err
}

// テンプレートを削除する。該当行がなければfalseを返す
func (dao *Dao) DeleteTemplate(id int64) (bool, error) {
	res, err := dao.db.Exec(_SQL_DELETE_TEMPLATE, id)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
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

// タグ名を変更し、そのタグを使用している全チケットのタグ表記も一括で書き換える。
// 書き換えたチケットは通常の編集と同じく更新者・更新日時を設定し、履歴とFTSも更新する。
// 書き換えたチケット数を返す
func (dao *Dao) RenameTag(tag *Tag, updatedBy, updatedSub string) (int, error) {
	tx, err := dao.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var oldName string
	if err := tx.QueryRow(_SQL_GET_TAG_NAME, tag.Id).Scan(&oldName); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(_SQL_EDIT_TAG, tag.Tag, tag.Note, tag.Color, tag.IsGroup, tag.IsRange, tag.Id); err != nil {
		return 0, err
	}
	if oldName == tag.Tag {
		return 0, tx.Commit()
	}

	now := time.Now()
	updated, err := rewriteTicketTags(tx, oldName, tag.Tag, func(t Ticket, tags string) error {
		if _, err := tx.Exec(_SQL_EDIT_TICKET, t.Title, t.Content, tags, updatedBy, updatedSub, now, t.Id); err != nil {
			return err
		}
		_, err := tx.Exec(_SQL_ADD_TICKET_HISTORY, t.Id, t.Title, t.Content, tags, updatedBy, updatedSub, now)
		return err
	})
	if err != nil {
		return 0, err
	}
	return updated, tx.Commit()
}

// タグ文字列中のoldNameをnewNameへ置き換えたタグ文字列と、置き換えの有無を返す。
// 値なしのグループエントリ（"due-date@:" など末尾 ":"）は前方一致でグループ名部分を置き換える。
// 階層タグの子孫（"docs" に対する "docs/design" など）は別タグのため置き換えない。
// 置き換えの結果、既存のタグと重複した場合はひとつにまとめる
func replaceTagTokens(tags, oldName, newName string) (string, bool) {
	changed := false
	seen := map[string]bool{}
	result := []string{}
	for _, token := range strings.Fields(tags) {
		switch {
		case token == oldName:
			token = newName
			changed = true
		case strings.HasSuffix(oldName, ":") && strings.HasPrefix(token, oldName):
			token = newName + token[len(oldName):]
			changed = true
		}
		if seen[token] {
			continue
		}
		seen[token] = true
		result = append(result, token)
	}
	if !changed {
		return tags, false
	}
	return strings.Join(result, " "), true
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
