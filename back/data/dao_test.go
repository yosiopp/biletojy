package data

import (
	"database/sql"
	"encoding/json"
	"slices"
	"strconv"
	"testing"
	"time"
)

// 実DBを汚さないよう一時ディレクトリでDBを作成する
func newTestDao(t *testing.T) *Dao {
	t.Helper()
	t.Chdir(t.TempDir())
	dao, err := NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)
	return dao
}

func addTestTicket(t *testing.T, dao *Dao, title, content, tags string) *Ticket {
	t.Helper()
	ticket := &Ticket{Title: title, Content: content, Tags: tags, CreatedBy: "tester"}
	if err := dao.AddTicket(ticket); err != nil {
		t.Fatalf("AddTicket(%q): %v", title, err)
	}
	// updated_at順のテストが安定するよう作成時刻をずらす
	time.Sleep(10 * time.Millisecond)
	return ticket
}

func queryTicketIds(t *testing.T, dao *Dao, q string, tags []string) []int64 {
	t.Helper()
	tickets, err := dao.QueryTickets(q, tags, 0)
	if err != nil {
		t.Fatalf("QueryTickets(%q, %v): %v", q, tags, err)
	}
	ids := []int64{}
	for _, ticket := range tickets {
		ids = append(ids, ticket.Id)
	}
	return ids
}

func countRows(t *testing.T, dao *Dao, query string, args ...any) int {
	t.Helper()
	var n int
	if err := dao.db.QueryRow(query, args...).Scan(&n); err != nil {
		t.Fatalf("countRows(%q): %v", query, err)
	}
	return n
}

func TestAddAndGetTicket(t *testing.T) {
	dao := newTestDao(t)

	ticket := addTestTicket(t, dao, "テストチケット", "本文", "status:OPEN")
	if ticket.Id <= 0 {
		t.Fatalf("AddTicket did not set id: %d", ticket.Id)
	}
	if ticket.CreatedAt.IsZero() || ticket.UpdatedAt.IsZero() {
		t.Errorf("AddTicket did not set timestamps: %+v", ticket)
	}

	got, err := dao.GetTicket(ticket.Id)
	if err != nil {
		t.Fatalf("GetTicket: %v", err)
	}
	if got == nil {
		t.Fatal("GetTicket returned nil for existing ticket")
	}
	if got.Title != "テストチケット" || got.Content != "本文" || got.Tags != "status:OPEN" || got.CreatedBy != "tester" {
		t.Errorf("GetTicket = %+v", got)
	}

	missing, err := dao.GetTicket(9999)
	if err != nil {
		t.Fatalf("GetTicket(missing): %v", err)
	}
	if missing != nil {
		t.Errorf("GetTicket(missing) = %+v, want nil", missing)
	}
}

func TestEditTicketAndHistory(t *testing.T) {
	dao := newTestDao(t)

	ticket := addTestTicket(t, dao, "元タイトル", "元本文", "status:OPEN")
	if n := countRows(t, dao, `SELECT COUNT(*) FROM ticket_histories WHERE ticket_id = ?`, ticket.Id); n != 1 {
		t.Errorf("ticket_histories after add = %d, want 1", n)
	}

	ticket.Title = "新タイトル"
	ticket.Content = "新本文"
	ticket.Tags = "status:DONE"
	if err := dao.EditTicket(ticket); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}

	got, err := dao.GetTicket(ticket.Id)
	if err != nil {
		t.Fatalf("GetTicket: %v", err)
	}
	if got.Title != "新タイトル" || got.Content != "新本文" || got.Tags != "status:DONE" {
		t.Errorf("GetTicket after edit = %+v", got)
	}
	if !got.UpdatedAt.After(got.CreatedAt) {
		t.Errorf("updated_at %v should be after created_at %v", got.UpdatedAt, got.CreatedAt)
	}
	if n := countRows(t, dao, `SELECT COUNT(*) FROM ticket_histories WHERE ticket_id = ?`, ticket.Id); n != 2 {
		t.Errorf("ticket_histories after edit = %d, want 2", n)
	}
}

func TestQueryTicketsFullText(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "ログイン画面のバグ", "パスワード入力でエラーが発生する", "status:OPEN type:BUG")
	t2 := addTestTicket(t, dao, "ドキュメント整備", "# 設計方針\nAPI仕様をまとめる", "status:WIP docs/design")

	tests := []struct {
		q    string
		want []int64
	}{
		{"", []int64{t2.Id, t1.Id}}, // 空はすべて（updated_at降順）
		{"ログイン", []int64{t1.Id}},    // タイトル
		{"設計方針", []int64{t2.Id}},    // markdown本文（見出し記号は除去して索引される）
		{"エラー 発生", []int64{t1.Id}},  // 複数語はAND
		{"存在しない語句", []int64{}},      // 不一致
		{"ログイン 設計方針", []int64{}},    // 別チケットに跨るANDは不一致
	}
	for _, tt := range tests {
		if got := queryTicketIds(t, dao, tt.q, nil); !slices.Equal(got, tt.want) {
			t.Errorf("QueryTickets(q=%q) = %v, want %v", tt.q, got, tt.want)
		}
	}

	// 編集後は新しい内容で検索できる
	t1.Content = "タイムアウトを修正した"
	if err := dao.EditTicket(t1); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}
	if got := queryTicketIds(t, dao, "タイムアウト", nil); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets after edit = %v, want [%d]", got, t1.Id)
	}
	if got := queryTicketIds(t, dao, "パスワード", nil); len(got) != 0 {
		t.Errorf("QueryTickets with old content = %v, want empty", got)
	}
}

func TestQueryTicketsWhitespaceQuery(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "チケット1", "内容1", "")
	t2 := addTestTicket(t, dao, "チケット2", "内容2", "")

	// 空白のみ・除去される記号のみの検索語はエラーにならず全件を返す
	for _, q := range []string{"   ", "\t\n", "---"} {
		if got := queryTicketIds(t, dao, q, nil); !slices.Equal(got, []int64{t2.Id, t1.Id}) {
			t.Errorf("QueryTickets(q=%q) = %v, want [%d %d]", q, got, t2.Id, t1.Id)
		}
	}
}

func TestQueryTicketsMatchesTags(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "タグ検索対象", "本文1", "urgent docs/design")
	addTestTicket(t, dao, "別チケット", "本文2", "status:OPEN")

	// qはタグにのみ現れる語にもマッチする
	if got := queryTicketIds(t, dao, "urgent", nil); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets(q=urgent) = %v, want [%d]", got, t1.Id)
	}
	if got := queryTicketIds(t, dao, "design", nil); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets(q=design) = %v, want [%d]", got, t1.Id)
	}

	// 編集後は新しいタグで検索できる
	t1.Tags = "priority:HIGH"
	if err := dao.EditTicket(t1); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}
	if got := queryTicketIds(t, dao, "high", nil); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets(q=high after edit) = %v, want [%d]", got, t1.Id)
	}
	if got := queryTicketIds(t, dao, "urgent", nil); len(got) != 0 {
		t.Errorf("QueryTickets(q=old tag) = %v, want empty", got)
	}
}

func TestQueryTicketsWordsWithPunctuation(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "連絡手段", "問い合わせはe-mailで受け付ける", "")
	t2 := addTestTicket(t, dao, "リリース日", "リリースは2026-01-01を予定している", "")

	// 記号を含む検索語も索引側と同じ前処理で一致する
	if got := queryTicketIds(t, dao, "e-mail", nil); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets(q=e-mail) = %v, want [%d]", got, t1.Id)
	}
	if got := queryTicketIds(t, dao, "2026-01-01", nil); !slices.Equal(got, []int64{t2.Id}) {
		t.Errorf("QueryTickets(q=2026-01-01) = %v, want [%d]", got, t2.Id)
	}
}

func TestQueryTicketsSingleCharQuery(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "ペット", "飼っているのは 柴犬", "")
	addTestTicket(t, dao, "別のペット", "飼っているのは 三毛猫", "")

	// 1文字の検索語は単語末尾の文字（柴犬の「犬」）にもマッチする
	if got := queryTicketIds(t, dao, "犬", nil); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets(q=犬) = %v, want [%d]", got, t1.Id)
	}
}

func TestQueryTicketsNullTags(t *testing.T) {
	dao := newTestDao(t)

	target := addTestTicket(t, dao, "参照される側", "本文", "")

	// tagsがNULLの行（旧データや手動投入）があっても検索・取得できる
	now := time.Now()
	res, err := dao.db.Exec(`INSERT INTO tickets (title, content, tags, created_by, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)`,
		"NULLタグ", "#"+strconv.FormatInt(target.Id, 10)+" を参照", "tester", now, now)
	if err != nil {
		t.Fatalf("insert null tags ticket: %v", err)
	}
	id, _ := res.LastInsertId()

	tickets, err := dao.QueryTickets("", nil, 0)
	if err != nil {
		t.Fatalf("QueryTickets: %v", err)
	}
	if len(tickets) != 2 {
		t.Fatalf("QueryTickets = %d tickets, want 2", len(tickets))
	}
	if tickets[0].Id != id || tickets[0].Tags != "" {
		t.Errorf("QueryTickets null tags row = %+v, want empty tags", tickets[0])
	}

	got, err := dao.GetTicket(id)
	if err != nil {
		t.Fatalf("GetTicket: %v", err)
	}
	if got == nil || got.Tags != "" {
		t.Errorf("GetTicket = %+v, want empty tags", got)
	}

	backlinks, err := dao.QueryBacklinks(target.Id)
	if err != nil {
		t.Fatalf("QueryBacklinks: %v", err)
	}
	if len(backlinks) != 1 || backlinks[0].Id != id {
		t.Errorf("QueryBacklinks = %+v, want [%d]", backlinks, id)
	}
}

func TestQueryTicketsByTags(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "バグ修正", "内容1", "status:OPEN type:BUG")
	t2 := addTestTicket(t, dao, "設計資料", "内容2", "status:WIP docs/design")

	tests := []struct {
		tags []string
		want []int64
	}{
		{[]string{"status:OPEN"}, []int64{t1.Id}},        // 完全一致
		{[]string{"docs"}, []int64{t2.Id}},               // 階層の前方一致
		{[]string{"docs/design"}, []int64{t2.Id}},        // 階層の完全一致
		{[]string{"doc"}, []int64{}},                     // 階層区切りでない前方一致はしない
		{[]string{"status:WIP", "docs"}, []int64{t2.Id}}, // AND条件
		{[]string{"status:OPEN", "docs"}, []int64{}},     // AND不成立
		{[]string{"status:DONE"}, []int64{}},             // 不一致
	}
	for _, tt := range tests {
		if got := queryTicketIds(t, dao, "", tt.tags); !slices.Equal(got, tt.want) {
			t.Errorf("QueryTickets(tags=%v) = %v, want %v", tt.tags, got, tt.want)
		}
	}

	// 全文検索とタグの組み合わせ
	if got := queryTicketIds(t, dao, "設計", []string{"docs"}); !slices.Equal(got, []int64{t2.Id}) {
		t.Errorf("QueryTickets(q+tags) = %v, want [%d]", got, t2.Id)
	}
	if got := queryTicketIds(t, dao, "バグ", []string{"docs"}); len(got) != 0 {
		t.Errorf("QueryTickets(q+tags mismatch) = %v, want empty", got)
	}
}

func TestQueryTicketsNotOr(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "対応中のバグ", "内容1", "status:OPEN type:BUG")
	t2 := addTestTicket(t, dao, "作業中の設計", "内容2", "status:WIP docs/design")
	t3 := addTestTicket(t, dao, "完了済み", "内容3", "status:CLOSED type:BUG")
	t4 := addTestTicket(t, dao, "期限あり", "内容4", "status:WIP due-date@:2026-02-01")

	tests := []struct {
		tags []string
		want []int64
	}{
		{[]string{"-status:CLOSED"}, []int64{t4.Id, t2.Id, t1.Id}},                 // NOT
		{[]string{"-docs"}, []int64{t4.Id, t3.Id, t1.Id}},                         // 階層の前方一致のNOT
		{[]string{"status:OPEN|status:WIP"}, []int64{t4.Id, t2.Id, t1.Id}},        // OR
		{[]string{"status:OPEN|docs/design"}, []int64{t2.Id, t1.Id}},              // グループを跨ぐOR
		{[]string{"-status:OPEN|status:WIP"}, []int64{t3.Id}},                     // NOTはOR全体に掛かる
		{[]string{"type:BUG", "-status:CLOSED"}, []int64{t1.Id}},                   // ANDとの組み合わせ
		{[]string{"-status:CLOSED", "-status:WIP"}, []int64{t1.Id}},                // NOT同士のAND
		{[]string{"status:OPEN|status:CLOSED", "type:BUG"}, []int64{t3.Id, t1.Id}}, // ORとANDの組み合わせ
		{[]string{"due-date@:>=2026-01-01|status:OPEN"}, []int64{t4.Id, t1.Id}},   // 範囲条件を含むOR
		{[]string{"-due-date@:>=2026-01-01"}, []int64{t3.Id, t2.Id, t1.Id}},       // 範囲条件のNOT（タグなしも含む）
		{[]string{"-"}, []int64{t4.Id, t3.Id, t2.Id, t1.Id}},                      // 空の条件は無視
		{[]string{"status:OPEN|"}, []int64{t1.Id}},                                // 空の択は無視
	}
	for _, tt := range tests {
		if got := queryTicketIds(t, dao, "", tt.tags); !slices.Equal(got, tt.want) {
			t.Errorf("QueryTickets(tags=%v) = %v, want %v", tt.tags, got, tt.want)
		}
	}

	// 全文検索との組み合わせ
	if got := queryTicketIds(t, dao, "バグ", []string{"-status:CLOSED"}); !slices.Equal(got, []int64{t1.Id}) {
		t.Errorf("QueryTickets(q + NOT) = %v, want [%d]", got, t1.Id)
	}
}

func TestQueryTicketsByRangeCond(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "期限近い", "内容1", "status:OPEN due-date@:2026-01-10")
	t2 := addTestTicket(t, dao, "期限遠い", "内容2", "status:OPEN due-date@:2026-02-10")
	t3 := addTestTicket(t, dao, "時刻付き", "内容3", "status:OPEN due-date@:2026-03-05T10:00")
	addTestTicket(t, dao, "期限なし", "内容4", "status:OPEN")
	tbd := addTestTicket(t, dao, "期限未定", "内容5", "status:OPEN due-date@:TBD")

	tests := []struct {
		tags []string
		want []int64
	}{
		{[]string{"due-date@:>=2026-02-01"}, []int64{t3.Id, t2.Id}},
		{[]string{"due-date@:<2026-02-01"}, []int64{t1.Id}},
		{[]string{"due-date@:=2026-01-10"}, []int64{t1.Id}},
		{[]string{"due-date@:<=2026-02-10"}, []int64{t2.Id, t1.Id}},
		{[]string{"due-date@:>2026-03-10"}, []int64{}},
		{[]string{"due-date@:>=2026-01-01", "status:OPEN"}, []int64{t3.Id, t2.Id, t1.Id}}, // 通常タグとの組み合わせ。日付形式でない値（TBD）はマッチしない
		{[]string{"due-date@:2026-01-10"}, []int64{t1.Id}},                                // 演算子なしは "=" と同じ扱い
		{[]string{"due-date@:2026-03-05"}, []int64{t3.Id}},                                // 演算子なしでも時刻付きの値に日付精度でマッチする
		{[]string{"due-date@:TBD"}, []int64{tbd.Id}},                                      // 日付形式でない値は通常のタグ一致
	}
	for _, tt := range tests {
		if got := queryTicketIds(t, dao, "", tt.tags); !slices.Equal(got, tt.want) {
			t.Errorf("QueryTickets(tags=%v) = %v, want %v", tt.tags, got, tt.want)
		}
	}
}

func TestQueryTicketsOrder(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "先に作成", "内容1", "")
	t2 := addTestTicket(t, dao, "後に作成", "内容2", "")

	if got := queryTicketIds(t, dao, "", nil); !slices.Equal(got, []int64{t2.Id, t1.Id}) {
		t.Fatalf("QueryTickets order = %v, want [%d %d]", got, t2.Id, t1.Id)
	}

	// 編集すると先頭に来る（updated_at降順）
	if err := dao.EditTicket(t1); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}
	if got := queryTicketIds(t, dao, "", nil); !slices.Equal(got, []int64{t1.Id, t2.Id}) {
		t.Errorf("QueryTickets order after edit = %v, want [%d %d]", got, t1.Id, t2.Id)
	}
}

func TestQueryTicketsLimit(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "チケット1", "内容", "status:OPEN")
	addTestTicket(t, dao, "チケット2", "内容", "status:CLOSED")
	t3 := addTestTicket(t, dao, "チケット3", "内容", "status:OPEN")

	// updated_at降順の先頭からlimit件で打ち切る。タグ条件の絞り込み後に数える
	tickets, err := dao.QueryTickets("", []string{"status:OPEN"}, 1)
	if err != nil {
		t.Fatalf("QueryTickets(limit=1): %v", err)
	}
	if len(tickets) != 1 || tickets[0].Id != t3.Id {
		t.Errorf("QueryTickets(limit=1) = %+v, want [%d]", tickets, t3.Id)
	}

	// limitが件数を超える場合とlimit=0（全件）はすべて返す
	for _, limit := range []int{5, 0} {
		tickets, err := dao.QueryTickets("", []string{"status:OPEN"}, limit)
		if err != nil {
			t.Fatalf("QueryTickets(limit=%d): %v", limit, err)
		}
		if len(tickets) != 2 || tickets[0].Id != t3.Id || tickets[1].Id != t1.Id {
			t.Errorf("QueryTickets(limit=%d) = %+v, want [%d %d]", limit, tickets, t3.Id, t1.Id)
		}
	}
}

func TestCommentsAndHistory(t *testing.T) {
	dao := newTestDao(t)
	ticket := addTestTicket(t, dao, "チケット", "本文", "")

	comments, err := dao.QueryComments(ticket.Id)
	if err != nil {
		t.Fatalf("QueryComments: %v", err)
	}
	if len(comments) != 0 {
		t.Errorf("QueryComments on empty = %v", comments)
	}

	c1 := &Comment{TicketId: ticket.Id, Content: "最初のコメント", CreatedBy: "alice"}
	if err := dao.AddComment(c1); err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	if c1.Id <= 0 {
		t.Fatalf("AddComment did not set id: %d", c1.Id)
	}
	time.Sleep(10 * time.Millisecond)
	c2 := &Comment{TicketId: ticket.Id, Content: "次のコメント", CreatedBy: "bob"}
	if err := dao.AddComment(c2); err != nil {
		t.Fatalf("AddComment: %v", err)
	}

	comments, err = dao.QueryComments(ticket.Id)
	if err != nil {
		t.Fatalf("QueryComments: %v", err)
	}
	if len(comments) != 2 || comments[0].Id != c1.Id || comments[1].Id != c2.Id {
		t.Errorf("QueryComments = %+v, want [%d %d] in created order", comments, c1.Id, c2.Id)
	}

	got, err := dao.GetComment(c1.Id)
	if err != nil {
		t.Fatalf("GetComment: %v", err)
	}
	if got == nil || got.Content != "最初のコメント" || got.CreatedBy != "alice" {
		t.Errorf("GetComment = %+v", got)
	}
	missing, err := dao.GetComment(9999)
	if err != nil {
		t.Fatalf("GetComment(missing): %v", err)
	}
	if missing != nil {
		t.Errorf("GetComment(missing) = %+v, want nil", missing)
	}

	got.Content = "編集後のコメント"
	if err := dao.EditComment(got); err != nil {
		t.Fatalf("EditComment: %v", err)
	}
	edited, _ := dao.GetComment(c1.Id)
	if edited.Content != "編集後のコメント" {
		t.Errorf("GetComment after edit = %+v", edited)
	}
	if n := countRows(t, dao, `SELECT COUNT(*) FROM comment_histories WHERE comment_id = ?`, c1.Id); n != 2 {
		t.Errorf("comment_histories = %d, want 2", n)
	}
}

func TestCommentsFullText(t *testing.T) {
	dao := newTestDao(t)
	ticket := addTestTicket(t, dao, "チケット", "本文", "")

	comment := &Comment{TicketId: ticket.Id, Content: "再現手順を確認した", CreatedBy: "alice"}
	if err := dao.AddComment(comment); err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	if got := queryTicketIds(t, dao, "再現手順", nil); !slices.Equal(got, []int64{ticket.Id}) {
		t.Errorf("QueryTickets(comment text) = %v, want [%d]", got, ticket.Id)
	}

	// コメント編集でFTSが再構築される
	comment.Content = "原因を特定した"
	if err := dao.EditComment(comment); err != nil {
		t.Fatalf("EditComment: %v", err)
	}
	if got := queryTicketIds(t, dao, "再現手順", nil); len(got) != 0 {
		t.Errorf("QueryTickets(old comment text) = %v, want empty", got)
	}
	if got := queryTicketIds(t, dao, "原因", nil); !slices.Equal(got, []int64{ticket.Id}) {
		t.Errorf("QueryTickets(new comment text) = %v, want [%d]", got, ticket.Id)
	}
}

// v3時点のDB（tag_catalogにsort_orderカラムがない）からの移行。
// カラムが追加され、既存タグを保ったまま（シードを再投入せず）起動でき、
// プリセットのstatusタグにはシードと同じ並び順が設定される（status:CLOSEはv6でCLOSEDへ改名される）
func TestMigrateAddsSortOrderColumn(t *testing.T) {
	t.Chdir(t.TempDir())
	db, err := sql.Open("sqlite", _DB_FILE)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	for _, q := range []string{
		`CREATE TABLE tag_catalog (
			id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
			tag VARCHAR(255) NOT NULL UNIQUE,
			note VARCHAR(255),
			color VARCHAR(40),
			is_group INTEGER NOT NULL DEFAULT 0,
			is_range INTEGER NOT NULL DEFAULT 0
		)`,
		// v3時点のシード相当（アルファベット順で返っていた。CLOSEは当時の名前）と独自タグ
		`INSERT INTO tag_catalog (tag, is_group) VALUES
			('status:OPEN', 1), ('status:WIP', 1), ('status:DONE', 1), ('status:CLOSE', 1), ('mytag', 0)`,
		`PRAGMA user_version = 3`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	dao, err := NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)

	tags, err := dao.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	names := []string{}
	for _, tag := range tags {
		names = append(names, tag.Tag)
	}
	// statusはシード順、独自タグ（グループでないタグ）はsort_order 0のままグループの後に並ぶ
	want := []string{"status:OPEN", "status:WIP", "status:DONE", "status:CLOSED", "mytag"}
	if !slices.Equal(names, want) {
		t.Errorf("tags after migration = %v, want %v", names, want)
	}
	if tags[0].SortOrder != 1 || tags[4].SortOrder != 0 {
		t.Errorf("sort_order after migration = %+v", tags)
	}
}

// v5時点のDB（プリセットが旧名status:CLOSE）からの移行。
// タグカタログと使用中チケットのタグ表記がstatus:CLOSEDへ書き換えられる
func TestMigrateRenamesCloseTag(t *testing.T) {
	t.Chdir(t.TempDir())
	dao, err := NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	// チケット追加でstatus:CLOSEがカタログへ自動登録されるので、シードのstatus:CLOSEDを消してv5時点の状態へ巻き戻す
	ticket := addTestTicket(t, dao, "完了済み", "内容", "status:CLOSE type:BUG")
	for _, q := range []string{
		`DELETE FROM tag_catalog WHERE tag = 'status:CLOSED'`,
		`PRAGMA user_version = 5`,
	} {
		if _, err := dao.db.Exec(q); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}
	dao.Close()

	dao, err = NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)

	tags, err := dao.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	for _, tag := range tags {
		if tag.Tag == "status:CLOSE" {
			t.Errorf("tag_catalog still has status:CLOSE after migration")
		}
	}
	got, err := dao.GetTicket(ticket.Id)
	if err != nil {
		t.Fatalf("GetTicket: %v", err)
	}
	if want := "status:CLOSED type:BUG"; got.Tags != want {
		t.Errorf("ticket tags after migration = %q, want %q", got.Tags, want)
	}
	if ids := queryTicketIds(t, dao, "", []string{"status:CLOSED"}); !slices.Equal(ids, []int64{ticket.Id}) {
		t.Errorf("QueryTickets(status:CLOSED) = %v, want [%d]", ids, ticket.Id)
	}
}

// v6時点のDB（FTSのrowidがチケットIDと未対応）からの移行。
// FTSが再構築されてrowid = チケットIDになり、rowidベースの検索・更新が機能する
func TestMigrateRebuildsFtsRowid(t *testing.T) {
	t.Chdir(t.TempDir())
	dao, err := NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	ticket := addTestTicket(t, dao, "移行対象", "本文の初版", "status:OPEN")
	comment := &Comment{TicketId: ticket.Id, Content: "コメントも索引される", CreatedBy: "alice"}
	if err := dao.AddComment(comment); err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	// 旧DB相当: FTS行のrowidをチケットIDとずらしてv6へ巻き戻す
	for _, q := range []string{
		`DELETE FROM tickets_fts`,
		`INSERT INTO tickets_fts (rowid, ticket_id, title, content, tags, comments) VALUES (100, ` + strconv.FormatInt(ticket.Id, 10) + `, 'x', 'x', 'x', 'x')`,
		`PRAGMA user_version = 6`,
	} {
		if _, err := dao.db.Exec(q); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}
	dao.Close()

	dao, err = NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)

	// rowidがチケットIDで再構築され、本文・コメントとも検索できる
	if n := countRows(t, dao, `SELECT COUNT(*) FROM tickets_fts WHERE rowid = ?`, ticket.Id); n != 1 {
		t.Errorf("tickets_fts rows with rowid = ticket id: %d, want 1", n)
	}
	if n := countRows(t, dao, `SELECT COUNT(*) FROM tickets_fts`); n != 1 {
		t.Errorf("tickets_fts rows = %d, want 1", n)
	}
	if ids := queryTicketIds(t, dao, "初版", nil); !slices.Equal(ids, []int64{ticket.Id}) {
		t.Errorf("QueryTickets(content) = %v, want [%d]", ids, ticket.Id)
	}
	if ids := queryTicketIds(t, dao, "索引", nil); !slices.Equal(ids, []int64{ticket.Id}) {
		t.Errorf("QueryTickets(comment) = %v, want [%d]", ids, ticket.Id)
	}

	// rowidベースの更新（チケット編集・コメント編集）もFTSへ反映される
	got, err := dao.GetTicket(ticket.Id)
	if err != nil {
		t.Fatalf("GetTicket: %v", err)
	}
	got.Content = "編集後の本文"
	if err := dao.EditTicket(got); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}
	if ids := queryTicketIds(t, dao, "編集後", nil); !slices.Equal(ids, []int64{ticket.Id}) {
		t.Errorf("QueryTickets(after edit) = %v, want [%d]", ids, ticket.Id)
	}
	if ids := queryTicketIds(t, dao, "初版", nil); len(ids) != 0 {
		t.Errorf("QueryTickets(old content) = %v, want empty", ids)
	}
}

func TestTagCatalog(t *testing.T) {
	dao := newTestDao(t)

	// 初期データが投入されている
	tags, err := dao.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	seeded := len(tags)
	if seeded == 0 {
		t.Fatal("QueryTags returned no seeded tags")
	}
	if !slices.ContainsFunc(tags, func(tag Tag) bool { return tag.Tag == "status:OPEN" && tag.IsGroup }) {
		t.Errorf("seeded tags missing status:OPEN group: %+v", tags)
	}

	note := "優先度"
	tag := &Tag{Tag: "priority:HIGH", Note: &note, IsGroup: true}
	if err := dao.AddTag(tag); err != nil {
		t.Fatalf("AddTag: %v", err)
	}
	if tag.Id <= 0 {
		t.Fatalf("AddTag did not set id: %d", tag.Id)
	}

	got, err := dao.GetTag(tag.Id)
	if err != nil {
		t.Fatalf("GetTag: %v", err)
	}
	if got == nil || got.Tag != "priority:HIGH" || got.Note == nil || *got.Note != "優先度" || !got.IsGroup {
		t.Errorf("GetTag = %+v", got)
	}

	got.Tag = "priority:LOW"
	if err := dao.EditTag(got); err != nil {
		t.Fatalf("EditTag: %v", err)
	}
	edited, _ := dao.GetTag(tag.Id)
	if edited.Tag != "priority:LOW" {
		t.Errorf("GetTag after edit = %+v", edited)
	}

	ok, err := dao.DeleteTag(tag.Id)
	if err != nil {
		t.Fatalf("DeleteTag: %v", err)
	}
	if !ok {
		t.Errorf("DeleteTag = false, want true")
	}
	// 存在しないIDの削除はfalseを返す
	ok, err = dao.DeleteTag(9999)
	if err != nil {
		t.Fatalf("DeleteTag(missing): %v", err)
	}
	if ok {
		t.Errorf("DeleteTag(missing) = true, want false")
	}
	deleted, err := dao.GetTag(tag.Id)
	if err != nil {
		t.Fatalf("GetTag after delete: %v", err)
	}
	if deleted != nil {
		t.Errorf("GetTag after delete = %+v, want nil", deleted)
	}
	tags, _ = dao.QueryTags()
	if len(tags) != seeded {
		t.Errorf("QueryTags after delete = %d, want %d", len(tags), seeded)
	}
}

func TestRenameTag(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "対象1", "本文", "feature:SEARCH status:OPEN")
	t2 := addTestTicket(t, dao, "対象2", "本文", "feature:SEARCH docs/design")
	t3 := addTestTicket(t, dao, "対象外", "本文", "status:OPEN")

	tags, err := dao.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	tag := findTag(tags, "feature:SEARCH")
	if tag == nil {
		t.Fatal("feature:SEARCH not registered")
	}
	tag.Tag = "feature:FTS"
	updated, err := dao.RenameTag(tag, "alice", "sub-1")
	if err != nil {
		t.Fatalf("RenameTag: %v", err)
	}
	if updated != 2 {
		t.Errorf("RenameTag updated = %d, want 2", updated)
	}

	// カタログのタグ名が変更される
	got, err := dao.GetTag(tag.Id)
	if err != nil {
		t.Fatalf("GetTag: %v", err)
	}
	if got.Tag != "feature:FTS" {
		t.Errorf("GetTag after rename = %+v", got)
	}

	// 使用中チケットのタグが書き換わり、通常の編集と同じく更新者・履歴が記録される
	got1, _ := dao.GetTicket(t1.Id)
	if got1.Tags != "feature:FTS status:OPEN" {
		t.Errorf("ticket1 tags = %q, want %q", got1.Tags, "feature:FTS status:OPEN")
	}
	if got1.UpdatedBy != "alice" || got1.UpdatedSub != "sub-1" {
		t.Errorf("ticket1 updated_by = %q, updated_sub = %q, want alice/sub-1", got1.UpdatedBy, got1.UpdatedSub)
	}
	if !got1.UpdatedAt.After(t1.UpdatedAt) {
		t.Errorf("ticket1 updated_at = %v, want after %v", got1.UpdatedAt, t1.UpdatedAt)
	}
	if n := countRows(t, dao, `SELECT COUNT(*) FROM ticket_histories WHERE ticket_id = ?`, t1.Id); n != 2 {
		t.Errorf("ticket1 histories = %d, want 2", n)
	}
	got2, _ := dao.GetTicket(t2.Id)
	if got2.Tags != "feature:FTS docs/design" {
		t.Errorf("ticket2 tags = %q", got2.Tags)
	}

	// 使用していないチケットは変更されない
	got3, _ := dao.GetTicket(t3.Id)
	if got3.Tags != "status:OPEN" || !got3.UpdatedAt.Equal(t3.UpdatedAt) {
		t.Errorf("ticket3 should be untouched: %+v", got3)
	}
	if n := countRows(t, dao, `SELECT COUNT(*) FROM ticket_histories WHERE ticket_id = ?`, t3.Id); n != 1 {
		t.Errorf("ticket3 histories = %d, want 1", n)
	}

	// FTSも更新され、新しいタグ名で全文検索できる（旧タグ名ではヒットしない）
	ids := queryTicketIds(t, dao, "feature:FTS", nil)
	if !slices.Contains(ids, t1.Id) || !slices.Contains(ids, t2.Id) {
		t.Errorf("fulltext search by new name = %v, want [%d %d]", ids, t1.Id, t2.Id)
	}
	if ids := queryTicketIds(t, dao, "SEARCH", nil); len(ids) != 0 {
		t.Errorf("fulltext search by old name = %v, want empty", ids)
	}

	// 同名への変更はチケットを書き換えない
	updated, err = dao.RenameTag(tag, "bob", "")
	if err != nil {
		t.Fatalf("RenameTag(same name): %v", err)
	}
	if updated != 0 {
		t.Errorf("RenameTag(same name) updated = %d, want 0", updated)
	}
}

func TestRenameTagGroupEntry(t *testing.T) {
	dao := newTestDao(t)

	ticket := addTestTicket(t, dao, "期限つき", "本文", "due-date@:2026-07-10 status:OPEN")

	tags, _ := dao.QueryTags()
	tag := findTag(tags, "due-date@:")
	if tag == nil {
		t.Fatal("due-date@: not found in seeded catalog")
	}
	tag.Tag = "deadline@:"
	updated, err := dao.RenameTag(tag, "alice", "")
	if err != nil {
		t.Fatalf("RenameTag: %v", err)
	}
	if updated != 1 {
		t.Errorf("RenameTag updated = %d, want 1", updated)
	}

	// 値なしのグループエントリは前方一致で値つきのタグごと書き換わる
	got, _ := dao.GetTicket(ticket.Id)
	if got.Tags != "deadline@:2026-07-10 status:OPEN" {
		t.Errorf("ticket tags = %q", got.Tags)
	}
	// 新しいグループ名で範囲検索できる
	if ids := queryTicketIds(t, dao, "", []string{"deadline@:>=2026-07-01"}); !slices.Contains(ids, ticket.Id) {
		t.Errorf("range search by new group = %v, want contains %d", ids, ticket.Id)
	}
}

func TestReplaceTagTokens(t *testing.T) {
	tests := []struct {
		tags, oldName, newName string
		want                   string
		changed                bool
	}{
		{"foo bar", "foo", "baz", "baz bar", true},
		{"status:OPEN foo", "status:OPEN", "status:NEW", "status:NEW foo", true},
		// 階層タグの子孫は別タグのため置き換えない
		{"docs/design docs", "docs", "documents", "docs/design documents", true},
		// 値なしのグループエントリは前方一致で置き換える
		{"due-date@:2026-01-01 foo", "due-date@:", "deadline@:", "deadline@:2026-01-01 foo", true},
		// 置き換えの結果重複したタグはひとつにまとめる
		{"foo bar", "foo", "bar", "bar", true},
		{"foo bar", "qux", "quux", "foo bar", false},
	}
	for _, tt := range tests {
		got, changed := replaceTagTokens(tt.tags, tt.oldName, tt.newName)
		if got != tt.want || changed != tt.changed {
			t.Errorf("replaceTagTokens(%q, %q, %q) = %q, %v, want %q, %v",
				tt.tags, tt.oldName, tt.newName, got, changed, tt.want, tt.changed)
		}
	}
}

func TestTemplates(t *testing.T) {
	dao := newTestDao(t)

	// 初期状態は空
	templates, err := dao.QueryTemplates()
	if err != nil {
		t.Fatalf("QueryTemplates: %v", err)
	}
	if len(templates) != 0 {
		t.Errorf("QueryTemplates on empty = %+v", templates)
	}

	tpl := &Template{Name: "バグ報告", Title: "【バグ】", Content: "## 再現手順\n\n## 期待する結果\n", Tags: "type:BUG status:OPEN"}
	if err := dao.AddTemplate(tpl); err != nil {
		t.Fatalf("AddTemplate: %v", err)
	}
	if tpl.Id <= 0 {
		t.Fatalf("AddTemplate did not set id: %d", tpl.Id)
	}
	if tpl.CreatedAt.IsZero() || tpl.UpdatedAt.IsZero() {
		t.Errorf("AddTemplate did not set timestamps: %+v", tpl)
	}

	got, err := dao.GetTemplate(tpl.Id)
	if err != nil {
		t.Fatalf("GetTemplate: %v", err)
	}
	if got == nil || got.Name != "バグ報告" || got.Title != "【バグ】" || got.Content != tpl.Content || got.Tags != "type:BUG status:OPEN" {
		t.Errorf("GetTemplate = %+v", got)
	}
	missing, err := dao.GetTemplate(9999)
	if err != nil {
		t.Fatalf("GetTemplate(missing): %v", err)
	}
	if missing != nil {
		t.Errorf("GetTemplate(missing) = %+v, want nil", missing)
	}

	// 一覧は名前順に返る
	second := &Template{Name: "a-作業依頼"}
	if err := dao.AddTemplate(second); err != nil {
		t.Fatalf("AddTemplate: %v", err)
	}
	templates, err = dao.QueryTemplates()
	if err != nil {
		t.Fatalf("QueryTemplates: %v", err)
	}
	if len(templates) != 2 || templates[0].Id != second.Id || templates[1].Id != tpl.Id {
		t.Errorf("QueryTemplates = %+v, want name order [%d %d]", templates, second.Id, tpl.Id)
	}

	// 編集で内容が更新され、created_atは維持される
	time.Sleep(10 * time.Millisecond)
	got.Name = "不具合報告"
	got.Tags = "type:BUG"
	if err := dao.EditTemplate(got); err != nil {
		t.Fatalf("EditTemplate: %v", err)
	}
	edited, _ := dao.GetTemplate(tpl.Id)
	if edited.Name != "不具合報告" || edited.Tags != "type:BUG" {
		t.Errorf("GetTemplate after edit = %+v", edited)
	}
	if !edited.CreatedAt.Equal(tpl.CreatedAt) {
		t.Errorf("created_at = %v, want %v (must keep original)", edited.CreatedAt, tpl.CreatedAt)
	}
	if !edited.UpdatedAt.After(edited.CreatedAt) {
		t.Errorf("updated_at %v should be after created_at %v", edited.UpdatedAt, edited.CreatedAt)
	}

	// 削除。存在しないIDはfalseを返す
	ok, err := dao.DeleteTemplate(tpl.Id)
	if err != nil {
		t.Fatalf("DeleteTemplate: %v", err)
	}
	if !ok {
		t.Errorf("DeleteTemplate = false, want true")
	}
	ok, err = dao.DeleteTemplate(tpl.Id)
	if err != nil {
		t.Fatalf("DeleteTemplate(missing): %v", err)
	}
	if ok {
		t.Errorf("DeleteTemplate(missing) = true, want false")
	}
	deleted, err := dao.GetTemplate(tpl.Id)
	if err != nil {
		t.Fatalf("GetTemplate after delete: %v", err)
	}
	if deleted != nil {
		t.Errorf("GetTemplate after delete = %+v, want nil", deleted)
	}
}

func findTag(tags []Tag, name string) *Tag {
	for i := range tags {
		if tags[i].Tag == name {
			return &tags[i]
		}
	}
	return nil
}

func TestTicketRegistersUnknownTags(t *testing.T) {
	dao := newTestDao(t)

	// 作成時: 未定義タグがカタログへ自動登録される（定義済みのstatus:OPENはそのまま）
	ticket := addTestTicket(t, dao, "タグ自動登録", "本文", "status:OPEN status:PENDING feature:SEARCH docs/design due-date@:2026-07-10 point#:3")
	tags, err := dao.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	if tag := findTag(tags, "feature:SEARCH"); tag == nil || !tag.IsGroup || tag.IsRange {
		t.Errorf("feature:SEARCH = %+v, want group tag", tag)
	}
	// 既存グループへの自動登録はグループ末尾（最大sort_order + 1）に並ぶ
	if tag := findTag(tags, "status:PENDING"); tag == nil || tag.SortOrder != 5 {
		t.Errorf("status:PENDING = %+v, want sort_order 5", tag)
	}
	if tag := findTag(tags, "docs/design"); tag == nil || tag.IsGroup || tag.IsRange {
		t.Errorf("docs/design = %+v, want plain tag", tag)
	}
	// 日時・数値タグは値ごとではなくグループとして登録される
	if tag := findTag(tags, "point#:"); tag == nil || !tag.IsGroup || !tag.IsRange {
		t.Errorf("point#: = %+v, want range group tag", tag)
	}
	if findTag(tags, "point#:3") != nil || findTag(tags, "due-date@:2026-07-10") != nil {
		t.Errorf("range tag values should not be registered: %+v", tags)
	}
	// 定義済みの due-date@: が重複登録されない
	count := 0
	for _, tag := range tags {
		if tag.Tag == "due-date@:" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("due-date@: registered %d times, want 1", count)
	}

	// 編集時も同様に自動登録される
	ticket.Tags = "status:WIP priority:HIGH another-tag"
	if err := dao.EditTicket(ticket); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}
	tags, _ = dao.QueryTags()
	if findTag(tags, "priority:HIGH") == nil {
		t.Errorf("priority:HIGH not registered on edit: %+v", tags)
	}
	// 値なしのグループエントリ同士はグループの後にまとまり、その後にグループでないタグが登録順（タグ名順ではなく）で並ぶ
	n := len(tags)
	if tags[n-4].Tag != "due-date@:" || tags[n-3].Tag != "point#:" {
		t.Errorf("value-less group entries should be listed after groups in registration order: %+v", tags)
	}
	if tags[n-2].Tag != "docs/design" || tags[n-1].Tag != "another-tag" {
		t.Errorf("plain tags should be listed last in registration order: %+v", tags)
	}
}

// エクスポート→インポートのラウンドトリップ。JSONを介して別DBへ取り込んでも
// チケット・コメント・タグ・タイムスタンプが維持され、履歴・FTS・タグカタログも整合する
func TestExportImportRoundTrip(t *testing.T) {
	src := newTestDao(t)

	t1 := addTestTicket(t, src, "移行元チケット", "本文でラウンドトリップを確認する", "status:OPEN feature:EXPORT")
	c1 := &Comment{TicketId: t1.Id, Content: "最初のコメント", CreatedBy: "alice", UpdatedBy: "alice"}
	if err := src.AddComment(c1); err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	c2 := &Comment{TicketId: t1.Id, Content: "次のコメント", CreatedBy: "bob", UpdatedBy: "bob"}
	if err := src.AddComment(c2); err != nil {
		t.Fatalf("AddComment: %v", err)
	}
	t2 := addTestTicket(t, src, "コメントなし", "本文2", "")

	// 全件エクスポート（updated_at降順、コメントは作成順）
	exported, err := src.ExportTickets("", nil)
	if err != nil {
		t.Fatalf("ExportTickets: %v", err)
	}
	if len(exported) != 2 || exported[0].Id != t2.Id || exported[1].Id != t1.Id {
		t.Fatalf("ExportTickets = %+v, want [%d %d]", exported, t2.Id, t1.Id)
	}
	if len(exported[1].Comments) != 2 || exported[1].Comments[0].Content != "最初のコメント" || exported[1].Comments[1].Content != "次のコメント" {
		t.Errorf("exported comments = %+v", exported[1].Comments)
	}
	if len(exported[0].Comments) != 0 {
		t.Errorf("exported[0].Comments = %+v, want empty", exported[0].Comments)
	}

	// 検索条件（QueryTicketsと同じ）で絞り込める
	filtered, err := src.ExportTickets("", []string{"status:OPEN"})
	if err != nil {
		t.Fatalf("ExportTickets(tags): %v", err)
	}
	if len(filtered) != 1 || filtered[0].Id != t1.Id {
		t.Errorf("ExportTickets(tags) = %+v, want [%d]", filtered, t1.Id)
	}

	// API転送を模してJSONを経由させる
	b, err := json.Marshal(exported)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	decoded := []TicketExport{}
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	dst := newTestDao(t)
	if err := dst.ImportTickets(decoded); err != nil {
		t.Fatalf("ImportTickets: %v", err)
	}

	// 内容・作成者・タイムスタンプが引き継がれる（updated_at降順の並びも変わらない）
	tickets, err := dst.QueryTickets("", nil, 0)
	if err != nil {
		t.Fatalf("QueryTickets: %v", err)
	}
	if len(tickets) != 2 || tickets[0].Title != "コメントなし" || tickets[1].Title != "移行元チケット" {
		t.Fatalf("imported tickets = %+v", tickets)
	}
	got := tickets[1]
	want, _ := src.GetTicket(t1.Id)
	if got.Content != want.Content || got.Tags != want.Tags || got.CreatedBy != want.CreatedBy || got.UpdatedBy != want.UpdatedBy {
		t.Errorf("imported ticket = %+v, want %+v", got, want)
	}
	if !got.CreatedAt.Equal(want.CreatedAt) || !got.UpdatedAt.Equal(want.UpdatedAt) {
		t.Errorf("imported timestamps = %v/%v, want %v/%v", got.CreatedAt, got.UpdatedAt, want.CreatedAt, want.UpdatedAt)
	}

	// コメントも新しいチケットIDに付け替えて取り込まれる
	comments, err := dst.QueryComments(got.Id)
	if err != nil {
		t.Fatalf("QueryComments: %v", err)
	}
	if len(comments) != 2 || comments[0].Content != "最初のコメント" || comments[0].CreatedBy != "alice" || comments[1].Content != "次のコメント" {
		t.Errorf("imported comments = %+v", comments)
	}
	if !comments[0].CreatedAt.Equal(c1.CreatedAt) {
		t.Errorf("imported comment created_at = %v, want %v", comments[0].CreatedAt, c1.CreatedAt)
	}

	// 通常の作成経路と同じく履歴が1版記録され、FTS・タグカタログにも登録される
	if n := countRows(t, dst, `SELECT COUNT(*) FROM ticket_histories WHERE ticket_id = ?`, got.Id); n != 1 {
		t.Errorf("imported ticket histories = %d, want 1", n)
	}
	if n := countRows(t, dst, `SELECT COUNT(*) FROM comment_histories WHERE comment_id = ?`, comments[0].Id); n != 1 {
		t.Errorf("imported comment histories = %d, want 1", n)
	}
	if ids := queryTicketIds(t, dst, "ラウンドトリップ", nil); !slices.Equal(ids, []int64{got.Id}) {
		t.Errorf("fulltext search by content = %v, want [%d]", ids, got.Id)
	}
	if ids := queryTicketIds(t, dst, "最初のコメント", nil); !slices.Equal(ids, []int64{got.Id}) {
		t.Errorf("fulltext search by comment = %v, want [%d]", ids, got.Id)
	}
	dstTags, err := dst.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	if findTag(dstTags, "feature:EXPORT") == nil {
		t.Errorf("feature:EXPORT not registered on import: %+v", dstTags)
	}

	// 同じDBへ取り込んだ場合はIDが衝突せず新規IDで採番される
	if err := src.ImportTickets(decoded); err != nil {
		t.Fatalf("ImportTickets(same db): %v", err)
	}
	srcTickets, err := src.QueryTickets("", nil, 0)
	if err != nil {
		t.Fatalf("QueryTickets: %v", err)
	}
	if len(srcTickets) != 4 {
		t.Fatalf("tickets after re-import = %d, want 4", len(srcTickets))
	}
	for _, ticket := range srcTickets {
		if ticket.Id != t1.Id && ticket.Id != t2.Id && ticket.Id <= t2.Id {
			t.Errorf("re-imported ticket should get a new id: %+v", ticket)
		}
	}
}

func TestAddAndGetFile(t *testing.T) {
	dao := newTestDao(t)

	file := &File{Name: "app.log", Mime: "text/plain", Data: []byte("2026-07-06 ERROR boom")}
	if err := dao.AddFile(file); err != nil {
		t.Fatalf("AddFile: %v", err)
	}
	if file.Id <= 0 || file.CreatedAt.IsZero() {
		t.Errorf("file after add = %+v", file)
	}

	got, err := dao.GetFile(file.Id)
	if err != nil {
		t.Fatalf("GetFile: %v", err)
	}
	if got == nil || got.Name != "app.log" || got.Mime != "text/plain" || string(got.Data) != "2026-07-06 ERROR boom" {
		t.Errorf("GetFile = %+v", got)
	}

	// 存在しないIDはエラーではなくnilを返す
	missing, err := dao.GetFile(9999)
	if err != nil || missing != nil {
		t.Errorf("GetFile(missing) = %+v, %v", missing, err)
	}
}

func TestMigrateImagesToFiles(t *testing.T) {
	t.Chdir(t.TempDir())
	db, err := sql.Open("sqlite", _DB_FILE)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	for _, q := range []string{
		// v4時点のimagesテーブルと既存データ
		`CREATE TABLE images (
			id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
			mime VARCHAR(100) NOT NULL,
			data BLOB NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`INSERT INTO images (id, mime, data, created_at) VALUES (3, 'image/png', x'89504e47', '2026-01-01 00:00:00')`,
		`PRAGMA user_version = 4`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	dao, err := NewDao()
	if err != nil {
		t.Fatalf("NewDao: %v", err)
	}
	t.Cleanup(dao.Close)

	// IDを引き継いでfilesへ移行される
	file, err := dao.GetFile(3)
	if err != nil {
		t.Fatalf("GetFile: %v", err)
	}
	if file == nil || file.Name != "" || file.Mime != "image/png" || len(file.Data) != 4 {
		t.Errorf("migrated file = %+v", file)
	}
	if n := countRows(t, dao, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'images'`); n != 0 {
		t.Errorf("images table still exists: %d", n)
	}
}
