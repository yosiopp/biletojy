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

	CREATE TABLE IF NOT EXISTS images (
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		mime VARCHAR(100) NOT NULL,
		data BLOB NOT NULL,
		created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

	// 初期データ投入（タグカタログ）
	_SQL_COUNT_TAG_CATALOG = `SELECT COUNT(*) FROM tag_catalog`
	_SQL_INIT_TAG_CATALOG  = `INSERT INTO tag_catalog (tag, note, color, is_group, is_range, sort_order) VALUES
		('status:OPEN', '未処理', '#e11d48', 1, 0, 1),
		('status:WIP', '処理中', '#f59e0b', 1, 0, 2),
		('status:DONE', '処理済', '#10b981', 1, 0, 3),
		('status:CLOSE', '完了', '#64748b', 1, 0, 4),
		('type:ISSUE', '課題', '#3b82f6', 1, 0, 1),
		('type:TASK', 'タスク', '#8b5cf6', 1, 0, 2),
		('type:BUG', 'バグ', '#ef4444', 1, 0, 3),
		('type:QUESTION', '質問', '#06b6d4', 1, 0, 4),
		('type:NOTE', 'メモ', '#a3a3a3', 1, 0, 5),
		('due-date@:', '期限', NULL, 1, 1, 0);`

	// タグカタログ。一覧はタググループ（"status:" 等の接頭辞）を接頭辞順でまとめ、
	// グループでないタグは全グループの後にまとめる。それぞれの中はsort_order順（同値はタグ名順）で返す。
	// instrは1始まりのため、グループ判定（先頭以外の ":"）はGo側のIndex > 0に合わせて > 1 とする
	_SQL_QUERY_TAGS = `SELECT id, tag, note, color, is_group, is_range, sort_order FROM tag_catalog
		ORDER BY is_group DESC,
			CASE WHEN instr(tag, ':') > 1 THEN substr(tag, 1, instr(tag, ':')) ELSE '' END ASC,
			sort_order ASC, tag ASC`
	_SQL_GET_TAG       = `SELECT id, tag, note, color, is_group, is_range, sort_order FROM tag_catalog WHERE id = ?`
	_SQL_ADD_TAG       = `INSERT INTO tag_catalog (tag, note, color, is_group, is_range) VALUES (?, ?, ?, ?, ?)`
	_SQL_EDIT_TAG      = `UPDATE tag_catalog SET tag = ?, note = ?, color = ?, is_group = ?, is_range = ? WHERE id = ?`
	_SQL_DELETE_TAG    = `DELETE FROM tag_catalog WHERE id = ?`
	_SQL_SET_TAG_ORDER = `UPDATE tag_catalog SET sort_order = ? WHERE id = ?`
	// チケット保存時のカタログ未定義タグの自動登録（定義済みなら何もしない）。
	// 一覧で末尾に並ぶよう、同一グループ（_SQL_QUERY_TAGSのグループ判定と同じ。
	// グループでないタグ同士はまとめてひとつの並びとして扱う）の最大sort_order + 1を設定する
	_SQL_ADD_UNKNOWN_TAG = `INSERT INTO tag_catalog (tag, is_group, is_range, sort_order)
		SELECT ?1, ?2, ?3, COALESCE(MAX(sort_order), 0) + 1 FROM tag_catalog
		WHERE CASE WHEN instr(tag, ':') > 1 THEN substr(tag, 1, instr(tag, ':')) ELSE '' END
			= CASE WHEN instr(?1, ':') > 1 THEN substr(?1, 1, instr(?1, ':')) ELSE '' END
		ON CONFLICT (tag) DO NOTHING`

	// チケット取得
	_SQL_GET_TICKET = `SELECT id, title, content, COALESCE(tags, ''), created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM tickets WHERE id = ?`

	// チケット追加
	_SQL_ADD_TICKET         = `INSERT INTO tickets (title, content, tags, created_by, created_sub, updated_by, updated_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	_SQL_ADD_TICKET_HISTORY = `INSERT INTO ticket_histories (ticket_id, title, content, tags, created_by, created_sub, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
	_SQL_ADD_TICKET_FTS     = `INSERT INTO tickets_fts (ticket_id, title, content, tags, comments) VALUES (?, ?, ?, ?, ?)`

	// チケット編集
	_SQL_EDIT_TICKET     = `UPDATE tickets SET title = ?, content = ?, tags = ?, updated_by = ?, updated_sub = ?, updated_at = ? WHERE id = ?`
	_SQL_EDIT_TICKET_FTS = `UPDATE tickets_fts SET title = ?, content = ?, tags = ? WHERE ticket_id = ?`

	// コメント
	_SQL_GET_COMMENT    = `SELECT id, ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM comments WHERE id = ?`
	_SQL_QUERY_COMMENTS = `SELECT id, ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at FROM comments WHERE ticket_id = ? ORDER BY created_at ASC`
	// FTS再構築用（コメント本文のみ。並び順は_SQL_QUERY_COMMENTSと揃える）
	_SQL_QUERY_COMMENT_CONTENTS = `SELECT content FROM comments WHERE ticket_id = ? ORDER BY created_at ASC`
	_SQL_ADD_COMMENT            = `INSERT INTO comments (ticket_id, content, created_by, created_sub, updated_by, updated_sub, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	_SQL_ADD_COMMENT_HISTORY    = `INSERT INTO comment_histories (comment_id, content, created_by, created_sub, created_at) VALUES (?, ?, ?, ?, ?)`
	_SQL_EDIT_COMMENT           = `UPDATE comments SET content = ?, updated_by = ?, updated_sub = ?, updated_at = ? WHERE id = ?`
	_SQL_EDIT_COMMENT_FTS       = `UPDATE tickets_fts SET comments = ? WHERE ticket_id = ?`

	// 履歴（古い版から順に返す。idは挿入順のためソートキーに使える）
	_SQL_QUERY_TICKET_HISTORIES  = `SELECT id, ticket_id, title, content, COALESCE(tags, ''), created_by, created_sub, created_at FROM ticket_histories WHERE ticket_id = ? ORDER BY id ASC`
	_SQL_QUERY_COMMENT_HISTORIES = `SELECT id, comment_id, content, created_by, created_sub, created_at FROM comment_histories WHERE comment_id = ? ORDER BY id ASC`

	// 画像
	_SQL_ADD_IMAGE = `INSERT INTO images (mime, data, created_at) VALUES (?, ?, ?)`
	_SQL_GET_IMAGE = `SELECT id, mime, data, created_at FROM images WHERE id = ?`

	// チケット検索
	_SQL_QUERY_TICKETS_BASE = `SELECT t.id, t.title, t.content, COALESCE(t.tags, ''), t.created_by, t.created_sub, t.updated_by, t.updated_sub, t.created_at, t.updated_at FROM tickets t`
	_SQL_QUERY_TICKETS_FTS  = ` JOIN tickets_fts ON t.id = tickets_fts.ticket_id`

	// バックリンク検索。LIKEで候補を絞り、桁違いのIDへの誤マッチ除外はGo側で行う
	_SQL_QUERY_BACKLINKS = `SELECT t.id, t.title, t.content, COALESCE(t.tags, ''), t.created_by, t.created_sub, t.updated_by, t.updated_sub, t.created_at, t.updated_at,
		COALESCE((SELECT GROUP_CONCAT(c.content, ' ') FROM comments c WHERE c.ticket_id = t.id), '')
		FROM tickets t
		WHERE t.id <> ? AND (t.content LIKE ? OR EXISTS (SELECT 1 FROM comments c WHERE c.ticket_id = t.id AND c.content LIKE ?))
		ORDER BY t.updated_at DESC`

	// マイグレーション（v2: FTSインデックス再構築、v3: subカラム追加、v4: sort_orderカラム追加）
	_SCHEMA_VERSION            = 4
	_SQL_GET_USER_VERSION      = `PRAGMA user_version`
	_SQL_SET_USER_VERSION      = `PRAGMA user_version = 4`
	_SQL_DELETE_ALL_TICKET_FTS = `DELETE FROM tickets_fts`
	_SQL_QUERY_TICKETS_FOR_FTS = `SELECT id, title, content, COALESCE(tags, '') FROM tickets`
	// カラムの有無で既存DB（ALTERが必要）か新規DB（_SQL_INITで作成済み）かを判定する
	_SQL_COUNT_SUB_COLUMN        = `SELECT COUNT(*) FROM pragma_table_info('tickets') WHERE name = 'created_sub'`
	_SQL_COUNT_SORT_ORDER_COLUMN = `SELECT COUNT(*) FROM pragma_table_info('tag_catalog') WHERE name = 'sort_order'`
	_SQL_ADD_SORT_ORDER_COLUMN   = `ALTER TABLE tag_catalog ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`
	// シード済みの既存DBにも_SQL_INIT_TAG_CATALOGと同じstatusの並び順を設定する
	_SQL_BACKFILL_STATUS_ORDER = `UPDATE tag_catalog SET sort_order = CASE tag
		WHEN 'status:OPEN' THEN 1
		WHEN 'status:WIP' THEN 2
		WHEN 'status:DONE' THEN 3
		WHEN 'status:CLOSE' THEN 4
		END
		WHERE tag IN ('status:OPEN', 'status:WIP', 'status:DONE', 'status:CLOSE')`
)

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
