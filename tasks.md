# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

## 一貫性・バグ予防（優先度高）

### 日時タグ値の正規表現をフロントとバックで揃える
バックエンドの日時値判定（`back/data/rangecond.go:19` の `dateValuePattern`）は `^...$` の完全一致だが、フロントの `DATE_RANGE_VALUE`（`front/src/lib/tags.ts:110` 付近）と `dueState`（同 207 付近）は末尾アンカーがない。`due-date@:2026-01-01x` のような不正値がフロントだけ期限切れ表示・補正対象になり、バックエンドの範囲検索やソート（`front/src/lib/sort.ts` は `$` あり）と食い違う。フロント側の2つの正規表現に終端アンカーを追加して揃える（`dueState` は時刻部分が任意なので `(?:...)?$` の形）。

### チケット作成/編集/インポート時にタグを検証する
タグカタログAPI（`back/server.go` の `saveTag` → `data.TagNameError`）は `,` `|` 先頭 `-` を400で拒否するが、POST/PUT tickets（`back/server.go:47-114`）とインポートは `tags` を無検証で保存する。メタ文字入りタグは検索構文と衝突して絞り込めなくなり、`registerUnknownTags`（`back/data/dao.go:424` 付近）も黙ってスキップする。書き込み時に `strings.Fields(tags)` の各トークンへタグAPIと同等の検証をかけて400を返す。既存データ互換のため読み取り側は寛容のまま。テストとdocs/api.mdの更新も。

### TicketForm の編集ロードに staleGuard を適用する
他画面（TicketList / TicketDetail / TicketHistory / TicketRefTextarea）で徹底されている古いレスポンス破棄パターンが、`front/src/pages/TicketForm.tsx:44-56` の `getTicket` ロードだけ未適用。編集画面間を素早く遷移すると古い内容がフォームと `initial`（dirty判定基準）に載る。同じパターンで `staleGuard()` を適用する。

## 効率性

### FTS更新をrowidベースにする（マイグレーションv7）
`tickets_fts` の `ticket_id` は UNINDEXED（`back/data/const.go:85`）なのに、更新SQLは `WHERE ticket_id = ?`（`_SQL_EDIT_TICKET_FTS` / `_SQL_EDIT_TICKET_FTS_TAGS` / `_SQL_EDIT_COMMENT_FTS`、const.go:143-157）。FTS5はMATCHとrowid以外を最適化できず、チケット編集・コメント追加/編集のたびに全行スキャンになる。`_SQL_ADD_TICKET_FTS` で rowid にチケットIDを入れ、更新と検索JOIN（`ON t.id = tickets_fts.ticket_id` → rowid）をrowidベースへ変更。既存DBは `rebuildFts` を流用したv7マイグレーションで再構築（docs/database.md のマイグレーション節も更新）。

### タグ検索の事前絞り込みとSQL LIMIT
`QueryTickets`（`back/data/dao.go:329-366`）はタグ条件を全てGo側で判定するため、`status:OPEN` だけの絞り込みでも本文込みの全件をスキャンする。改善：(1) 肯定条件（NOTでない条件）が1つでもあれば `tags LIKE '%…%'` またはFTSの `tags` カラムMATCHで候補を事前に絞り、厳密判定は従来通りGo側で行う2段構えにする（`rewriteTicketTags` と同じ発想）。(2) `limit > 0` かつタグ条件なしの場合はSQLに `LIMIT ?` を付けて `tickets_updated_idx` での早期打ち切りを確実にする。

### TicketList のソートをメモ化する
`front/src/pages/TicketList.tsx:197,201,206` で `sortTickets(tickets, sort)` をJSX内で直接呼んでおり、再レンダーのたびに全件ソート＋新配列生成が走る。毎回新しい参照になるため TicketTree（`buildTree`/`flatten`）と TicketBoard（`columns`）の useMemo も無効化されている。`useMemo` で一度ソートし、3表示モードへ同じ参照を渡す。

### tagColor のカタログ探索をMap化する
`front/src/lib/tags.ts:66-75` の `tagColor` がタグ1個ごとに `catalog.find` を最大2回実行し、一覧レンダーが O(行数×タグ数×カタログ数) になる。タグ名→色の `Map` を `useMemo` で一度構築して引く形に変更（呼び出し側: TicketRow / TicketTree / TicketBoard など）。

### タグカタログのフェッチを共有キャッシュ化する
`front/src/lib/useCatalog.ts` がマウントごとに `/api/tags` を呼ぶため、一覧→詳細→編集の遷移で同じデータを取り直す。モジュールレベルで初回Promiseを共有するキャッシュにし、タグ編集（TagList）での変更時に無効化する。

### タグ使用数の件数専用エンドポイントを追加する
`front/src/pages/TagList.tsx:58-67` の `countUsage` が、削除・改名の確認のためだけに本文込みの全チケットJSONを取得している。`GET /api/tags/{id}/usage` のような件数専用API（サーバー側は `rewriteTicketTags` と同様のLIKE＋トークン判定でCOUNT）を追加してフロントを置き換える。docs/api.md の更新も。

### matchAllTagConds のタグ分割を1回にする
`back/data/tagcond.go:57` / `back/data/rangecond.go:47` が条件・択ごとに同じチケットの `strings.Fields(t.Tags)` を繰り返す。`QueryTickets` のループで1回だけ分割し、`match([]string)` を受け取る形へ小改修。

## 要判断（修正 or 仕様として明記）

### design-system 逸脱2件の解消
- `front/src/components/Header.tsx:7` — アクティブなナビリンクに `font-bold`（規定では太字はmarkdown表示内のみ）
- `front/src/components/ViewSelect.tsx:108` — 保存済みビューのチップに `rounded-lg`（規定ではタグチップ限定）

コードを規定に合わせるか、docs/design-system.md に例外として明記するかを決めて対応する。

### 階層前方一致の適用範囲のフロント/バック差を解消
バックエンド（`back/data/tagcond.go:58`）は前方一致を全タグに適用（`status:OPEN` が `status:OPEN/x` にもマッチ）するが、フロントの階層概念（`front/src/lib/tags.ts:26` の `isHierarchy`）はグループなしタグ限定。URL直指定でのみ顕在化する。どちらを正とするか決め、実装を揃えるか docs/api.md に仕様として明記する。

### サブリソースGETの404判定を統一
存在しないチケットIDに対し `GET /api/tickets/{id}` とPOST系は404だが、`GET /api/tickets/{id}/comments` `/histories` `/backlinks` は200で `[]` を返す（`back/server.go:116-166`）。GET系にも `fetchOr404` を挟んで404に統一するか、「サブリソースGETは親の存在を確認しない」を docs/api.md に明記する。

## 軽微

- `back/data/const.go:187-189` — `_SCHEMA_VERSION` と `_SQL_SET_USER_VERSION` にバージョン番号が二重管理。`migrate` 側で `fmt.Sprintf("PRAGMA user_version = %d", _SCHEMA_VERSION)` を組み立てる形にする
- `back/data/dao.go` — `rows.Close()` の扱いが3通り混在（`rewriteTicketTags` / `rebuildFts` はdefer＋明示の二重、`queryCommentsByTickets` はdeferなし手動）。チャンク処理を小関数に切り出して `defer rows.Close()` に統一
- `front/src/components/TicketBoard.tsx:71-73` — カード移動時の挿入位置 `index` がfilter前の `tags` 配列基準。filter後の `next` 配列で `findIndex` する方が正確（同一グループのタグが複数付いた不正データ時のみずれる）
- `front/src/pages/TicketList.tsx:48` — `tagsParam.split(',').filter(...)` が28行目の `tags` 導出と重複。統一する
- `back/server.go:488,518`（PUT /api/tags/{id} と /rename）— レスポンスがリクエストボディ由来の `data.Tag` をそのまま返すため、ボディで `sort_order` を省略するとDB上の実値と食い違う `sort_order: 0` が返る。DBから読み直して返すか、docs/api.md に挙動を明記する
- `back/data/dao.go:417-443`（`registerUnknownTags`）— タグ1個ごとに集計付きINSERTを実行。先に `SELECT tag FROM tag_catalog` を1回引いて差分だけINSERTすれば定数回になる
