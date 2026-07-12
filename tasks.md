# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

## 一貫性・バグ予防（優先度高）

### チケット作成/編集/インポート時にタグを検証する
タグカタログAPI（`back/server.go` の `saveTag` → `data.TagNameError`）は `,` `|` 先頭 `-` を400で拒否するが、POST/PUT tickets（`back/server.go:47-114`）とインポートは `tags` を無検証で保存する。メタ文字入りタグは検索構文と衝突して絞り込めなくなり、`registerUnknownTags`（`back/data/dao.go:424` 付近）も黙ってスキップする。書き込み時に `strings.Fields(tags)` の各トークンへタグAPIと同等の検証をかけて400を返す。既存データ互換のため読み取り側は寛容のまま。テストとdocs/api.mdの更新も。

## 機能追加

### ファイル一覧画面を追加する
添付ファイルはアップロード（`POST /api/files`）と配信（`GET /api/files/{id}`）しかできず、蓄積したファイルの把握・削除手段がない。ヘッダに files メニューを追加し、ファイル一覧画面を実装する。

バックエンド（現状 `back/server.go:311,338` の2エンドポイントのみ。追加が必要）:
- `GET /api/files` — 一覧API。id / name / mime / サイズ / created_at / チケットからの参照有無を返す。`files` テーブル（`back/data/const.go:66`）に size カラムはないので `LENGTH(data)` で取得し、BLOB本体は返さない
- `DELETE /api/files/{id}` — 削除API。存在しないIDは404
- 参照有無の判定 — ファイルは本文・コメントに `/api/files/{id}` のmarkdownリンクとして埋め込まれる（`front/src/components/AttachFileButton.tsx`）。`tickets.content` / `comments.content` に加え、要件により `ticket_histories` / `comment_histories` も対象。SQLの `LIKE '%/api/files/' || id || '%'` だけでは id=1 が `/api/files/12` に誤マッチするため、LIKEで候補を絞った上でGo側で直後が非数字であることを確認する（`rewriteTicketTags` と同じ2段構え）。一覧レスポンスに「現役（チケット/コメント）からの参照」「履歴のみからの参照」を区別できる形で含める
- テストと docs/api.md の更新も

フロントエンド:
- `pages/FileList.tsx` を新設し、`App.tsx` にルート `/files` を追加。`Header.tsx` のナビ（tickets / tags / templates の並び）に files を追加
- 一覧にはファイルid・ファイル名・MIME-Type・サイズ・追加日時・参照有無を表示し、ファイル名（または id）を `/api/files/{id}` へのリンクにする（`api.fileUrl`、`front/src/api/client.ts:135`）
- 削除ボタンを設け、チケット・コメント（履歴含む）からの参照がある場合は「チケットからの参照が切れる」旨を `ConfirmDialog`（danger）で警告してから削除する。参照がない場合は通常の削除確認でよい（TagList / TemplateList の削除と同じパターン）
- 画面からのアップロード — 既存の `api.uploadFile`（`front/src/api/client.ts:130`）を流用したアップロードボタンを設置し、完了後に一覧を再取得する
- ショートカットキーで遷移できるようにし（例: ctrl+shift+l。既存割当は `Layout.tsx` の `SHORTCUTS` を確認して衝突を避ける）、ヘルプと CLAUDE.md のショートカット一覧も更新する
- docs/design-system.md に従い、モバイル（sm未満）ではカード型レイアウトに組み替える

## 効率性

### FTS更新をrowidベースにする（マイグレーションv7）
`tickets_fts` の `ticket_id` は UNINDEXED（`back/data/const.go:85`）なのに、更新SQLは `WHERE ticket_id = ?`（`_SQL_EDIT_TICKET_FTS` / `_SQL_EDIT_TICKET_FTS_TAGS` / `_SQL_EDIT_COMMENT_FTS`、const.go:143-157）。FTS5はMATCHとrowid以外を最適化できず、チケット編集・コメント追加/編集のたびに全行スキャンになる。`_SQL_ADD_TICKET_FTS` で rowid にチケットIDを入れ、更新と検索JOIN（`ON t.id = tickets_fts.ticket_id` → rowid）をrowidベースへ変更。既存DBは `rebuildFts` を流用したv7マイグレーションで再構築（docs/database.md のマイグレーション節も更新）。

### タグ検索の事前絞り込みとSQL LIMIT
`QueryTickets`（`back/data/dao.go:329-366`）はタグ条件を全てGo側で判定するため、`status:OPEN` だけの絞り込みでも本文込みの全件をスキャンする。改善：(1) 肯定条件（NOTでない条件）が1つでもあれば `tags LIKE '%…%'` またはFTSの `tags` カラムMATCHで候補を事前に絞り、厳密判定は従来通りGo側で行う2段構えにする（`rewriteTicketTags` と同じ発想）。(2) `limit > 0` かつタグ条件なしの場合はSQLに `LIMIT ?` を付けて `tickets_updated_idx` での早期打ち切りを確実にする。

### タグ使用数の件数専用エンドポイントを追加する
`front/src/pages/TagList.tsx:58-67` の `countUsage` が、削除・改名の確認のためだけに本文込みの全チケットJSONを取得している。`GET /api/tags/{id}/usage` のような件数専用API（サーバー側は `rewriteTicketTags` と同様のLIKE＋トークン判定でCOUNT）を追加してフロントを置き換える。docs/api.md の更新も。

### matchAllTagConds のタグ分割を1回にする
`back/data/tagcond.go:57` / `back/data/rangecond.go:47` が条件・択ごとに同じチケットの `strings.Fields(t.Tags)` を繰り返す。`QueryTickets` のループで1回だけ分割し、`match([]string)` を受け取る形へ小改修。

## 要判断（修正 or 仕様として明記）

### 階層前方一致の適用範囲のフロント/バック差を解消
バックエンド（`back/data/tagcond.go:58`）は前方一致を全タグに適用（`status:OPEN` が `status:OPEN/x` にもマッチ）するが、フロントの階層概念（`front/src/lib/tags.ts:26` の `isHierarchy`）はグループなしタグ限定。URL直指定でのみ顕在化する。どちらを正とするか決め、実装を揃えるか docs/api.md に仕様として明記する。

### サブリソースGETの404判定を統一
存在しないチケットIDに対し `GET /api/tickets/{id}` とPOST系は404だが、`GET /api/tickets/{id}/comments` `/histories` `/backlinks` は200で `[]` を返す（`back/server.go:116-166`）。GET系にも `fetchOr404` を挟んで404に統一するか、「サブリソースGETは親の存在を確認しない」を docs/api.md に明記する。

## 軽微

- `back/data/const.go:187-189` — `_SCHEMA_VERSION` と `_SQL_SET_USER_VERSION` にバージョン番号が二重管理。`migrate` 側で `fmt.Sprintf("PRAGMA user_version = %d", _SCHEMA_VERSION)` を組み立てる形にする
- `back/data/dao.go` — `rows.Close()` の扱いが3通り混在（`rewriteTicketTags` / `rebuildFts` はdefer＋明示の二重、`queryCommentsByTickets` はdeferなし手動）。チャンク処理を小関数に切り出して `defer rows.Close()` に統一
- `back/server.go:488,518`（PUT /api/tags/{id} と /rename）— レスポンスがリクエストボディ由来の `data.Tag` をそのまま返すため、ボディで `sort_order` を省略するとDB上の実値と食い違う `sort_order: 0` が返る。DBから読み直して返すか、docs/api.md に挙動を明記する
- `back/data/dao.go:417-443`（`registerUnknownTags`）— タグ1個ごとに集計付きINSERTを実行。先に `SELECT tag FROM tag_catalog` を1回引いて差分だけINSERTすれば定数回になる
