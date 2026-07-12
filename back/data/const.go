package data

const (
	// 初期化 (DDL)
	_SQL_INIT = `CREATE TABLE IF NOT EXISTS tickets (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		title VARCHAR(255) NOT NULL,
		content TEXT NOT NULL,
		tags TEXT,
		created_by VARCHAR(255) NOT NULL,
		created_sub VARCHAR(255) NOT NULL DEFAULT '',
		updated_by VARCHAR(255) NOT NULL DEFAULT '',
		updated_sub VARCHAR(255) NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL
	);
	CREATE INDEX IF NOT EXISTS tickets_updated_idx ON tickets (updated_at);
	DROP INDEX IF EXISTS tickets_at_idx;
	DROP INDEX IF EXISTS tickets_by_idx;

	CREATE TABLE IF NOT EXISTS ticket_histories (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		ticket_id INTEGER NOT NULL,
		title VARCHAR(255) NOT NULL,
		content TEXT NOT NULL,
		tags TEXT,
		created_by VARCHAR(255) NOT NULL,
		created_sub VARCHAR(255) NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS ticket_histories_idx ON ticket_histories (ticket_id);

	CREATE TABLE IF NOT EXISTS comments (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		ticket_id INTEGER NOT NULL,
		content TEXT NOT NULL,
		created_by VARCHAR(255) NOT NULL,
		created_sub VARCHAR(255) NOT NULL DEFAULT '',
		updated_by VARCHAR(255) NOT NULL DEFAULT '',
		updated_sub VARCHAR(255) NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL
	);
	CREATE INDEX IF NOT EXISTS comments_idx ON comments (ticket_id, created_at);

	CREATE TABLE IF NOT EXISTS comment_histories (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		comment_id INTEGER NOT NULL,
		content TEXT NOT NULL,
		created_by VARCHAR(255) NOT NULL DEFAULT '',
		created_sub VARCHAR(255) NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS comment_histories_idx ON comment_histories (comment_id);

	CREATE TABLE IF NOT EXISTS tag_catalog (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		tag VARCHAR(255) NOT NULL UNIQUE,
		note VARCHAR(255),
		color VARCHAR(40),
		is_group INTEGER NOT NULL DEFAULT 0,
		is_range INTEGER NOT NULL DEFAULT 0,
		sort_order INTEGER NOT NULL DEFAULT 0
	);

	CREATE TABLE IF NOT EXISTS files (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		name VARCHAR(255) NOT NULL DEFAULT '',
		mime VARCHAR(100) NOT NULL,
		data BLOB NOT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS templates (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		name VARCHAR(255) NOT NULL,
		title VARCHAR(255) NOT NULL DEFAULT '',
		content TEXT NOT NULL DEFAULT '',
		tags TEXT NOT NULL DEFAULT '',
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP NOT NULL
	);

	CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5 (
		ticket_id UNINDEXED,
		title,
		content,
		tags,
		comments,
		tokenize="unicode61 remove_diacritics 2"
	);
	`

	// 初期データ投入（タグカタログ）。0件のとき DefaultTags（Goリテラル。シードとデフォルト復元の単一ソース）をシードする
	_SQL_COUNT_TAG_CATALOG = `SELECT COUNT(*) FROM tag_catalog`

	// タグカタログ。一覧は「値を持つタググループ（接頭辞順）→ 値なしのグループエントリ → グループでないタグ」の
	// 順にまとめ、それぞれの中はsort_order順（同値はタグ名順）で返す。値なしのグループエントリ（"due-date@:" 等）同士と
	// グループでないタグ同士は、それぞれまとめてひとつの並びとして扱う。
	// instrは1始まりのため、グループ判定（先頭以外の ":"）はGo側のIndex > 0に合わせて > 1 とする
	_SQL_QUERY_TAGS = `SELECT id, tag, note, color, is_group, is_range, sort_order FROM tag_catalog
		ORDER BY CASE WHEN instr(tag, ':') <= 1 THEN 2 WHEN instr(tag, ':') = length(tag) THEN 1 ELSE 0 END ASC,
			CASE WHEN instr(tag, ':') > 1 AND instr(tag, ':') < length(tag) THEN substr(tag, 1, instr(tag, ':')) ELSE '' END ASC,
			sort_order ASC, tag ASC`
	_SQL_GET_TAG         = `SELECT id, tag, note, color, is_group, is_range, sort_order FROM tag_catalog WHERE id = ?`
	_SQL_GET_TAG_NAME    = `SELECT tag FROM tag_catalog WHERE id = ?`
	_SQL_QUERY_TAG_NAMES = `SELECT tag FROM tag_catalog`
	// UI経由のタグ追加。一覧・絞り込みプルダウンでセクション末尾に並ぶよう、?6（Go側で導出したセクション区分）と
	// 同一セクションの最大sort_order + 1を設定する（_SQL_ADD_UNKNOWN_TAGと同方式）
	_SQL_ADD_TAG         = `INSERT INTO tag_catalog (tag, note, color, is_group, is_range, sort_order)
		SELECT ?1, ?2, ?3, ?4, ?5, COALESCE(MAX(sort_order), 0) + 1 FROM tag_catalog
		WHERE CASE WHEN instr(tag, ':') <= 1 THEN '' WHEN instr(tag, ':') = length(tag) THEN ':' ELSE substr(tag, 1, instr(tag, ':')) END = ?6`
	_SQL_EDIT_TAG        = `UPDATE tag_catalog SET tag = ?, note = ?, color = ?, is_group = ?, is_range = ? WHERE id = ?`
	_SQL_DELETE_TAG      = `DELETE FROM tag_catalog WHERE id = ?`
	_SQL_SET_TAG_ORDER   = `UPDATE tag_catalog SET sort_order = ? WHERE id = ?`
	// タグ名変更時の書き換え候補の絞り込み（LIKEは % _ を含むタグ名でも上位集合を返すため、
	// 実際の書き換え対象はGo側でトークン単位に判定する）
	_SQL_QUERY_TICKETS_BY_TAG = `SELECT id, title, content, COALESCE(tags, ''), created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM tickets WHERE tags LIKE ?`
	// タグ使用数の集計候補の絞り込み（同上、tagsカラムのみ。厳密な判定はGo側でトークン単位に行う）
	_SQL_QUERY_TICKET_TAGS_BY_TAG = `SELECT COALESCE(tags, '') FROM tickets WHERE tags LIKE ?`
	// チケット保存時のカタログ未定義タグの自動登録（定義済みなら何もしない）。
	// 一覧でセクション末尾に並ぶよう、?4（Go側で導出したセクション区分）と同一セクションの
	// 最大sort_order + 1を設定する
	_SQL_ADD_UNKNOWN_TAG = `INSERT INTO tag_catalog (tag, is_group, is_range, sort_order)
		SELECT ?1, ?2, ?3, COALESCE(MAX(sort_order), 0) + 1 FROM tag_catalog
		WHERE CASE WHEN instr(tag, ':') <= 1 THEN '' WHEN instr(tag, ':') = length(tag) THEN ':' ELSE substr(tag, 1, instr(tag, ':')) END = ?4
		ON CONFLICT (tag) DO NOTHING`
	// タグ定義の一括登録（初回シード・インポート・デフォルト復元で共用）。同名の既存タグは
	// ON CONFLICT DO NOTHING で変更せずスキップする。sort_orderを明示する版（export→importの往復再現用）と、
	// 未指定時に同一セクションの末尾へ採番する版（_SQL_ADD_UNKNOWN_TAGにnote/colorを加えた版）の2種
	_SQL_IMPORT_TAG = `INSERT INTO tag_catalog (tag, note, color, is_group, is_range, sort_order)
		VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (tag) DO NOTHING`
	_SQL_IMPORT_TAG_SECTION_END = `INSERT INTO tag_catalog (tag, note, color, is_group, is_range, sort_order)
		SELECT ?1, ?2, ?3, ?4, ?5, COALESCE(MAX(sort_order), 0) + 1 FROM tag_catalog
		WHERE CASE WHEN instr(tag, ':') <= 1 THEN '' WHEN instr(tag, ':') = length(tag) THEN ':' ELSE substr(tag, 1, instr(tag, ':')) END = ?6
		ON CONFLICT (tag) DO NOTHING`

	// チケット取得
	_SQL_GET_TICKET = `SELECT id, title, content, COALESCE(tags, ''), created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM tickets WHERE id = ?`
	// サブリソースの404判定用の存在確認（本文込みの行全体は取得しない）
	_SQL_TICKET_EXISTS  = `SELECT 1 FROM tickets WHERE id = ?`
	_SQL_COMMENT_EXISTS = `SELECT 1 FROM comments WHERE id = ?`

	// チケット追加。FTSはticket_idカラムがUNINDEXEDで絞り込みに使えないため、
	// rowidへチケットIDを入れて更新・JOINはrowidベース（FTS5が最適化できる形）で行う
	_SQL_ADD_TICKET         = `INSERT INTO tickets (title, content, tags, created_by, created_sub, updated_by, updated_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_SQL_ADD_TICKET_HISTORY = `INSERT INTO ticket_histories (ticket_id, title, content, tags, created_by, created_sub, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
	_SQL_ADD_TICKET_FTS     = `INSERT INTO tickets_fts (rowid, ticket_id, title, content, tags, comments) VALUES (?1, ?1, ?2, ?3, ?4, ?5)`

	// チケット編集
	_SQL_EDIT_TICKET          = `UPDATE tickets SET title = ?, content = ?, tags = ?, updated_by = ?, updated_sub = ?, updated_at = ? WHERE id = ?`
	_SQL_EDIT_TICKET_FTS      = `UPDATE tickets_fts SET title = ?, content = ?, tags = ? WHERE rowid = ?`
	_SQL_EDIT_TICKET_FTS_TAGS = `UPDATE tickets_fts SET tags = ? WHERE rowid = ?`

	// コメント
	_SQL_GET_COMMENT    = `SELECT id, ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM comments WHERE id = ?`
	_SQL_QUERY_COMMENTS = `SELECT id, ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM comments WHERE ticket_id = ? ORDER BY created_at ASC`
	// エクスポート用にコメントを複数チケット分まとめて取得する（%sは実行時にIDの数だけプレースホルダへ展開。
	// チケット内の並び順は_SQL_QUERY_COMMENTSと揃える）
	_SQL_QUERY_COMMENTS_BY_TICKETS = `SELECT id, ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM comments WHERE ticket_id IN (%s) ORDER BY created_at ASC`
	// FTS再構築用（コメント本文のみ。並び順は_SQL_QUERY_COMMENTSと揃える）
	_SQL_QUERY_COMMENT_CONTENTS = `SELECT content FROM comments WHERE ticket_id = ? ORDER BY created_at ASC`
	_SQL_ADD_COMMENT            = `INSERT INTO comments (ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	_SQL_ADD_COMMENT_HISTORY    = `INSERT INTO comment_histories (comment_id, content, created_by, created_sub, created_at) VALUES (?, ?, ?, ?, ?)`
	_SQL_EDIT_COMMENT           = `UPDATE comments SET content = ?, updated_by = ?, updated_sub = ?, updated_at = ? WHERE id = ?`
	_SQL_EDIT_COMMENT_FTS       = `UPDATE tickets_fts SET comments = ? WHERE rowid = ?`

	// 履歴（古い版から順に返す。idは挿入順のためソートキーに使える）
	_SQL_QUERY_TICKET_HISTORIES  = `SELECT id, ticket_id, title, content, COALESCE(tags, ''), created_by, created_sub, created_at FROM ticket_histories WHERE ticket_id = ? ORDER BY id ASC`
	_SQL_QUERY_COMMENT_HISTORIES = `SELECT id, comment_id, content, created_by, created_sub, created_at FROM comment_histories WHERE comment_id = ? ORDER BY id ASC`

	// 添付ファイル
	_SQL_ADD_FILE = `INSERT INTO files (name, mime, data, created_at) VALUES (?, ?, ?, ?)`
	_SQL_GET_FILE = `SELECT id, name, mime, data, created_at FROM files WHERE id = ?`
	// 一覧はBLOB本体を返さず、LENGTH(data)でサイズのみ取得する（新しい順）
	_SQL_QUERY_FILE_INFOS = `SELECT id, name, mime, LENGTH(data), created_at FROM files ORDER BY id DESC`
	_SQL_DELETE_FILE      = `DELETE FROM files WHERE id = ?`
	// ファイル参照（/api/files/{id} のmarkdownリンク）候補の本文の絞り込み。
	// LIKEは上位集合を返す（id=1 の検索が /api/files/12 にもマッチする）ため、ID単位の厳密判定はGo側で行う
	_SQL_QUERY_TICKET_FILE_REFS          = `SELECT content FROM tickets WHERE content LIKE ?`
	_SQL_QUERY_COMMENT_FILE_REFS         = `SELECT content FROM comments WHERE content LIKE ?`
	_SQL_QUERY_TICKET_HISTORY_FILE_REFS  = `SELECT content FROM ticket_histories WHERE content LIKE ?`
	_SQL_QUERY_COMMENT_HISTORY_FILE_REFS = `SELECT content FROM comment_histories WHERE content LIKE ?`

	// テンプレート（チケット作成時に適用するタイトル・本文・タグの雛形。一覧は名前順）
	_SQL_QUERY_TEMPLATES = `SELECT id, name, title, content, tags, created_at, updated_at FROM templates ORDER BY name ASC, id ASC`
	_SQL_GET_TEMPLATE    = `SELECT id, name, title, content, tags, created_at, updated_at FROM templates WHERE id = ?`
	_SQL_ADD_TEMPLATE    = `INSERT INTO templates (name, title, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
	_SQL_EDIT_TEMPLATE   = `UPDATE templates SET name = ?, title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?`
	_SQL_DELETE_TEMPLATE = `DELETE FROM templates WHERE id = ?`

	// チケット検索
	_SQL_QUERY_TICKETS_BASE = `SELECT t.id, t.title, t.content, COALESCE(t.tags, ''), t.created_by, t.created_sub, t.updated_by, t.updated_sub, t.created_at, t.updated_at FROM tickets t`
	_SQL_QUERY_TICKETS_FTS  = ` JOIN tickets_fts ON t.id = tickets_fts.rowid`

	// バックリンク検索。LIKEで候補を絞り、桁違いのIDへの誤マッチ除外はGo側で行う
	_SQL_QUERY_BACKLINKS = `SELECT t.id, t.title, t.content, COALESCE(t.tags, ''), t.created_by, t.created_sub, t.updated_by, t.updated_sub, t.created_at, t.updated_at,
		COALESCE((SELECT GROUP_CONCAT(c.content, ' ') FROM comments c WHERE c.ticket_id = t.id), '')
		FROM tickets t
		WHERE t.id <> ? AND (t.content LIKE ? OR EXISTS (SELECT 1 FROM comments c WHERE c.ticket_id = t.id AND c.content LIKE ?))
		ORDER BY t.updated_at DESC`

	// マイグレーション（v2: FTSインデックス再構築、v3: subカラム追加、v4: sort_orderカラム追加、
	// v5: imagesテーブルをfilesテーブルへ移行、v6: status:CLOSEをstatus:CLOSEDへ改名、
	// v7: FTSのrowidへチケットIDを設定するための再構築）
	_SCHEMA_VERSION            = 7
	_SQL_GET_USER_VERSION      = `PRAGMA user_version`
	_SQL_DELETE_ALL_TICKET_FTS = `DELETE FROM tickets_fts`
	_SQL_QUERY_TICKETS_FOR_FTS = `SELECT id, title, content, COALESCE(tags, '') FROM tickets`
	// カラムの有無で既存DB（ALTERが必要）か新規DB（_SQL_INITで作成済み）かを判定する
	_SQL_COUNT_SUB_COLUMN        = `SELECT COUNT(*) FROM pragma_table_info('tickets') WHERE name = 'created_sub'`
	_SQL_COUNT_SORT_ORDER_COLUMN = `SELECT COUNT(*) FROM pragma_table_info('tag_catalog') WHERE name = 'sort_order'`
	_SQL_ADD_SORT_ORDER_COLUMN   = `ALTER TABLE tag_catalog ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`
	// 旧imagesテーブル（v5でfilesへ一般化）の移行。IDを引き継いでfilesへ移す
	_SQL_COUNT_IMAGES_TABLE      = `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'images'`
	_SQL_MIGRATE_IMAGES_TO_FILES = `INSERT INTO files (id, name, mime, data, created_at) SELECT id, '', mime, data, created_at FROM images`
	_SQL_DROP_IMAGES_TABLE       = `DROP TABLE images`
	// シード済みの既存DBにもDefaultTagsと同じstatusの並び順を設定する。
	// v6の改名より前（対象DBはv4未満＝旧名のまま）に実行されるため 'status:CLOSE' を参照する
	_SQL_BACKFILL_STATUS_ORDER = `UPDATE tag_catalog SET sort_order = CASE tag
		WHEN 'status:OPEN' THEN 1
		WHEN 'status:WIP' THEN 2
		WHEN 'status:DONE' THEN 3
		WHEN 'status:CLOSE' THEN 4
		END
		WHERE tag IN ('status:OPEN', 'status:WIP', 'status:DONE', 'status:CLOSE')`
	// v6: プリセットのstatus:CLOSEタグをstatus:CLOSEDへ改名する。
	// 万一status:CLOSEDが既に存在する場合はUNIQUE制約違反で起動不能になるため改名しない
	_SQL_RENAME_CLOSE_TAG = `UPDATE tag_catalog SET tag = 'status:CLOSED'
		WHERE tag = 'status:CLOSE' AND NOT EXISTS (SELECT 1 FROM tag_catalog WHERE tag = 'status:CLOSED')`
	_SQL_MIGRATE_TICKET_TAGS = `UPDATE tickets SET tags = ? WHERE id = ?`
)

// strPtr は文字列リテラルへのポインタを返す（DefaultTagsのNote/Colorをまとめて書くための補助）
func strPtr(s string) *string { return &s }

// DefaultTags はタグカタログの初期定義。初回シード（NewDao）とデフォルト復元（RestoreDefaultTags）の
// 単一ソース。is_group / is_range はタグ名から TagAttrs で導出するため保持しない（export形状に合わせる）。
// sort_order は status / type グループの表示順を固定するために明示し、due-date@: は 0
// （未指定＝登録時に同一セクションの末尾へ採番）とする
var DefaultTags = []Tag{
	{Tag: "status:OPEN", Note: strPtr("未処理"), Color: strPtr("#e11d48"), SortOrder: 1},
	{Tag: "status:WIP", Note: strPtr("処理中"), Color: strPtr("#f59e0b"), SortOrder: 2},
	{Tag: "status:DONE", Note: strPtr("処理済"), Color: strPtr("#10b981"), SortOrder: 3},
	{Tag: "status:CLOSED", Note: strPtr("完了"), Color: strPtr("#64748b"), SortOrder: 4},
	{Tag: "type:ISSUE", Note: strPtr("課題"), Color: strPtr("#3b82f6"), SortOrder: 1},
	{Tag: "type:TASK", Note: strPtr("タスク"), Color: strPtr("#8b5cf6"), SortOrder: 2},
	{Tag: "type:BUG", Note: strPtr("バグ"), Color: strPtr("#ef4444"), SortOrder: 3},
	{Tag: "type:QUESTION", Note: strPtr("質問"), Color: strPtr("#06b6d4"), SortOrder: 4},
	{Tag: "type:NOTE", Note: strPtr("メモ"), Color: strPtr("#a3a3a3"), SortOrder: 5},
	{Tag: "due-date@:", Note: strPtr("期限"), SortOrder: 0},
}

// v3で追加されたカラムを既存DBへ足すALTER文
var _SQL_ADD_SUB_COLUMNS = []string{
	`ALTER TABLE tickets ADD COLUMN created_sub VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE tickets ADD COLUMN updated_by VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE tickets ADD COLUMN updated_sub VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE ticket_histories ADD COLUMN created_sub VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE comments ADD COLUMN created_sub VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE comments ADD COLUMN updated_by VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE comments ADD COLUMN updated_sub VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE comment_histories ADD COLUMN created_by VARCHAR(255) NOT NULL DEFAULT ''`,
	`ALTER TABLE comment_histories ADD COLUMN created_sub VARCHAR(255) NOT NULL DEFAULT ''`,
}
