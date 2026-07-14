# テーブル定義書

データベースはSQLite3（`biletojy.db`、起動時にカレントディレクトリへ自動作成）。
DDLは [back/data/const.go](../back/data/const.go) の `_SQL_INIT` に定義されている。

## tickets（チケット）
| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | チケットID |
| title | VARCHAR(255) | NOT NULL | タイトル |
| content | TEXT | NOT NULL | 本文（markdown, mermaid記法） |
| tags | TEXT | | タグ（スペース区切り） |
| created_by | VARCHAR(255) | NOT NULL | 作成者（クライアント申告値） |
| created_sub | VARCHAR(255) | NOT NULL DEFAULT '' | 作成者のsub（`-user-header` 指定時のみ記録） |
| updated_by | VARCHAR(255) | NOT NULL DEFAULT '' | 最終更新者（クライアント申告値） |
| updated_sub | VARCHAR(255) | NOT NULL DEFAULT '' | 最終更新者のsub（同上） |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

インデックス: `tickets_updated_idx (updated_at)` — 一覧・バックリンクの `updated_at DESC` ソート用。
旧インデックス `tickets_at_idx (created_at)` / `tickets_by_idx (created_by)` は使用するクエリがないため起動時に削除される。

## ticket_histories（チケット履歴）
チケットの作成・編集のたびにその時点の内容が保存される。

| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 履歴ID |
| ticket_id | INTEGER | NOT NULL | 対象チケットID |
| title | VARCHAR(255) | NOT NULL | タイトル |
| content | TEXT | NOT NULL | 本文 |
| tags | TEXT | | タグ |
| created_by | VARCHAR(255) | NOT NULL | その版を作成した人（作成時は作成者、編集時は編集者） |
| created_sub | VARCHAR(255) | NOT NULL DEFAULT '' | その版を作成した人のsub |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 履歴作成日時 |

インデックス: `ticket_histories_idx (ticket_id)` — 履歴一覧APIの絞り込み用。

## comments（コメント）
| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | コメントID |
| ticket_id | INTEGER | NOT NULL | 対象チケットID |
| content | TEXT | NOT NULL | 本文（markdown, mermaid記法） |
| created_by | VARCHAR(255) | NOT NULL | 投稿者（クライアント申告値） |
| created_sub | VARCHAR(255) | NOT NULL DEFAULT '' | 投稿者のsub（`-user-header` 指定時のみ記録） |
| updated_by | VARCHAR(255) | NOT NULL DEFAULT '' | 最終更新者（クライアント申告値） |
| updated_sub | VARCHAR(255) | NOT NULL DEFAULT '' | 最終更新者のsub（同上） |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

インデックス: `comments_idx (ticket_id, created_at)`

## comment_histories（コメント履歴）
コメントの作成・編集のたびにその時点の内容が保存される。

| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 履歴ID |
| comment_id | INTEGER | NOT NULL | 対象コメントID |
| content | TEXT | NOT NULL | 本文 |
| created_by | VARCHAR(255) | NOT NULL DEFAULT '' | その版を作成した人（作成時は投稿者、編集時は編集者） |
| created_sub | VARCHAR(255) | NOT NULL DEFAULT '' | その版を作成した人のsub |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 履歴作成日時 |

インデックス: `comment_histories_idx (comment_id)` — 履歴一覧APIの絞り込み用。

## tag_catalog（タグカタログ）
タグ一覧に出力されるタグの定義。タグ一覧からの登録のほか、チケット作成・編集時に未定義のタグが自動登録される
（日時・数値タグは値ごとではなくグループとして登録。詳細は [api.md](api.md) のチケットの項を参照）。

| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | タグID |
| tag | VARCHAR(255) | NOT NULL UNIQUE | タグ名（例: `status:OPEN`, `due-date@:`, `estimate#:`） |
| note | VARCHAR(255) | | 説明 |
| color | VARCHAR(40) | | 表示色（例: `#e11d48`） |
| is_group | INTEGER | NOT NULL DEFAULT 0 | `:` を含むタググループなら1 |
| is_range | INTEGER | NOT NULL DEFAULT 0 | グループ名末尾が `@` の日時タグまたは `#` の数値タグなら1 |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | セクション内の表示順（並び替えAPIで1始まりの連番を設定。値なしのグループエントリ同士・グループでないタグ同士は、それぞれまとめてひとつの並びとして扱う） |

### プリセットのタググループ
初回起動時（`tag_catalog` が空のとき）に以下が投入される。`status` / `type` の各タグには記載順の `sort_order`（1始まりの連番）が付き、値なしのグループエントリ（`due-date@:` 等）は sort_order 未指定のため登録時にセクション末尾へ採番される（初回シードでは `sort_order = 1`）。プリセットのタググループも削除可能。

* `status` 状態 — `status:OPEN`（未処理）, `status:WIP`（処理中）, `status:DONE`（処理済）, `status:CLOSED`（完了）
* `type` 種別 — `type:ISSUE`（課題）, `type:TASK`（タスク）, `type:BUG`（バグ）, `type:QUESTION`（質問）, `type:NOTE`（メモ）
* `due-date@` 期限（日時タグ）

## templates（チケットテンプレート）
チケット作成時に選択して適用するタイトル・本文・タグの雛形。

| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | テンプレートID |
| name | VARCHAR(255) | NOT NULL | テンプレートの表示名（例: `バグ報告`） |
| title | VARCHAR(255) | NOT NULL DEFAULT '' | 適用するタイトルの雛形 |
| content | TEXT | NOT NULL DEFAULT '' | 適用する本文の雛形（markdown, mermaid記法） |
| tags | TEXT | NOT NULL DEFAULT '' | 適用するタグ（スペース区切り） |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | NOT NULL | 更新日時 |

## files（添付ファイル）
チケット・コメントの編集エリアにペースト・ドロップ・ファイル選択で添付されたファイル（画像を含む）。
本文からは `/api/files/{id}` のmarkdownリンクで参照される。

| カラム | 型 | 制約 | 内容 |
| --- | --- | --- | --- |
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | ファイルID |
| name | VARCHAR(255) | NOT NULL DEFAULT '' | ファイル名（アップロード時の `name` クエリパラメータ。旧 `images` からの移行分は空） |
| mime | VARCHAR(100) | NOT NULL | MIMEタイプ（`image/png`, `text/plain` 等） |
| data | BLOB | NOT NULL | ファイルバイナリ |
| created_at | TIMESTAMP | NOT NULL DEFAULT CURRENT_TIMESTAMP | 作成日時 |

## tickets_fts（全文検索 / FTS5仮想テーブル）
```sql
CREATE VIRTUAL TABLE tickets_fts USING fts5 (
  ticket_id UNINDEXED,
  title,
  content,
  tags,
  comments,
  tokenize="unicode61 remove_diacritics 2"
);
```

`rowid` にチケットIDを設定して登録し、チケット編集・コメント編集時の更新と検索時の `tickets` とのJOINは
`rowid` ベースで行う（FTS5はMATCHとrowid以外の絞り込みを最適化できないため。`ticket_id` カラムはUNINDEXEDのまま
同じ値を保持する）。

### トークナイズ処理
日本語検索に対応するため、格納時にGo側でbi-gramへ分かち書きする（[back/data/tokenize.go](../back/data/tokenize.go)）。

* **title** — 複数スペース・改行コードを統合 → bi-gram
* **content** — markdown装飾記号を除去 → 複数スペース・改行コードを統合 → bi-gram
* **comments** — `comments` テーブルから関連コメント本文を全て取得して結合 → markdown装飾記号を除去 → 複数スペース・改行コードを統合 → bi-gram
* **tags** — そのままスペース区切りで格納する

## マイグレーション
スキーマバージョンは `PRAGMA user_version` で管理する（現行は7）。
起動時にバージョンが古い場合、以下を実行して `user_version` を更新する。

* v7未満: FTSインデックスを全件再構築し、`rowid` へチケットIDを設定する
  （v2で行っていた旧トークナイズ形式からの再構築もこの全件再構築が兼ねる）
* v3未満: `tickets` / `comments` / `ticket_histories` / `comment_histories` へv3で追加されたカラム
  （`created_sub` / `updated_sub` のsub関連カラムに加え、tickets / comments の `updated_by`、
  comment_histories の `created_by`）を `ALTER TABLE ... ADD COLUMN` で追加する
  （新規DBはDDLで作成済みのため、カラムの有無で判定する）
* v4未満: `tag_catalog` へ `sort_order` カラムを `ALTER TABLE ... ADD COLUMN` で追加する（同上）。
  追加時、プリセットの `status` タグにはシードと同じ並び順（OPEN → WIP → DONE → CLOSE。CLOSEはv6で改名される前の名前）を設定する
* v5未満: 旧 `images` テーブルの内容をIDを引き継いで `files` テーブルへ移し（`name` は空）、
  `images` テーブルを削除する（新規DBには `images` が存在しないため、テーブルの有無で判定する）
* v6未満: プリセットの `status:CLOSE` タグを `status:CLOSED` へ改名し、使用中チケットのタグ表記とFTSも
  書き換える（チケットの更新者・更新日時・履歴は変更しない）
