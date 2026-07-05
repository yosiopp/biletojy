package data

import (
	"slices"
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

func TestQueryTicketsByRangeCond(t *testing.T) {
	dao := newTestDao(t)

	t1 := addTestTicket(t, dao, "期限近い", "内容1", "status:OPEN due-date@:2026-01-10")
	t2 := addTestTicket(t, dao, "期限遠い", "内容2", "status:OPEN due-date@:2026-02-10")
	addTestTicket(t, dao, "期限なし", "内容3", "status:OPEN")

	tests := []struct {
		tags []string
		want []int64
	}{
		{[]string{"due-date@:>=2026-02-01"}, []int64{t2.Id}},
		{[]string{"due-date@:<2026-02-01"}, []int64{t1.Id}},
		{[]string{"due-date@:=2026-01-10"}, []int64{t1.Id}},
		{[]string{"due-date@:<=2026-02-10"}, []int64{t2.Id, t1.Id}},
		{[]string{"due-date@:>2026-03-01"}, []int64{}},
		{[]string{"due-date@:>=2026-01-01", "status:OPEN"}, []int64{t2.Id, t1.Id}}, // 通常タグとの組み合わせ
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

	if err := dao.DeleteTag(tag.Id); err != nil {
		t.Fatalf("DeleteTag: %v", err)
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
