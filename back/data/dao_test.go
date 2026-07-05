package data

import (
	"database/sql"
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
	tickets, err := dao.QueryTickets(q, tags)
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

	tickets, err := dao.QueryTickets("", nil)
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
	t3 := addTestTicket(t, dao, "完了済み", "内容3", "status:CLOSE type:BUG")
	t4 := addTestTicket(t, dao, "期限あり", "内容4", "status:WIP due-date@:2026-02-01")

	tests := []struct {
		tags []string
		want []int64
	}{
		{[]string{"-status:CLOSE"}, []int64{t4.Id, t2.Id, t1.Id}},                 // NOT
		{[]string{"-docs"}, []int64{t4.Id, t3.Id, t1.Id}},                         // 階層の前方一致のNOT
		{[]string{"status:OPEN|status:WIP"}, []int64{t4.Id, t2.Id, t1.Id}},        // OR
		{[]string{"status:OPEN|docs/design"}, []int64{t2.Id, t1.Id}},              // グループを跨ぐOR
		{[]string{"-status:OPEN|status:WIP"}, []int64{t3.Id}},                     // NOTはOR全体に掛かる
		{[]string{"type:BUG", "-status:CLOSE"}, []int64{t1.Id}},                   // ANDとの組み合わせ
		{[]string{"-status:CLOSE", "-status:WIP"}, []int64{t1.Id}},                // NOT同士のAND
		{[]string{"status:OPEN|status:CLOSE", "type:BUG"}, []int64{t3.Id, t1.Id}}, // ORとANDの組み合わせ
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
	if got := queryTicketIds(t, dao, "バグ", []string{"-status:CLOSE"}); !slices.Equal(got, []int64{t1.Id}) {
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
// プリセットのstatusタグにはシードと同じ並び順が設定される
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
		// v3時点のシード相当（アルファベット順で返っていた）と独自タグ
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
	// statusはシード順、独自タグはsort_order 0のまま残る
	want := []string{"mytag", "status:OPEN", "status:WIP", "status:DONE", "status:CLOSE"}
	if !slices.Equal(names, want) {
		t.Errorf("tags after migration = %v, want %v", names, want)
	}
	if tags[0].SortOrder != 0 || tags[1].SortOrder != 1 {
		t.Errorf("sort_order after migration = %+v", tags)
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
	ticket := addTestTicket(t, dao, "タグ自動登録", "本文", "status:OPEN feature:SEARCH docs/design due-date@:2026-07-10 point#:3")
	tags, err := dao.QueryTags()
	if err != nil {
		t.Fatalf("QueryTags: %v", err)
	}
	if tag := findTag(tags, "feature:SEARCH"); tag == nil || !tag.IsGroup || tag.IsRange {
		t.Errorf("feature:SEARCH = %+v, want group tag", tag)
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
	ticket.Tags = "status:WIP priority:HIGH"
	if err := dao.EditTicket(ticket); err != nil {
		t.Fatalf("EditTicket: %v", err)
	}
	tags, _ = dao.QueryTags()
	if findTag(tags, "priority:HIGH") == nil {
		t.Errorf("priority:HIGH not registered on edit: %+v", tags)
	}
}
