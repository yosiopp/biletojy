# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

## 一貫性・バグ予防（優先度高）

### 日時タグ値の正規表現をフロントとバックで揃える
バックエンドの日時値判定（`back/data/rangecond.go:19` の `dateValuePattern`）は `^...$` の完全一致だが、フロントの `DATE_RANGE_VALUE`（`front/src/lib/tags.ts:110` 付近）と `dueState`（同 207 付近）は末尾アンカーがない。`due-date@:2026-01-01x` のような不正値がフロントだけ期限切れ表示・補正対象になり、バックエンドの範囲検索やソート（`front/src/lib/sort.ts` は `$` あり）と食い違う。フロント側の2つの正規表現に終端アンカーを追加して揃える（`dueState` は時刻部分が任意なので `(?:...)?$` の形）。

### TicketForm の編集ロードに staleGuard を適用する
他画面（TicketList / TicketDetail / TicketHistory / TicketRefTextarea）で徹底されている古いレスポンス破棄パターンが、`front/src/pages/TicketForm.tsx:44-56` の `getTicket` ロードだけ未適用。編集画面間を素早く遷移すると古い内容がフォームと `initial`（dirty判定基準）に載る。同じパターンで `staleGuard()` を適用する。

### タグ入力欄に未確定テキストがある状態での保存に警告する
チケット編集画面のタグ入力欄は Enter/Tab 等で確定するまでタグにならないが、未確定テキスト（`front/src/components/TagInput.tsx:35` の内部 state `text`。日時/数値タグ入力中の `rangeValue` も同様）が残ったまま保存ボタンを押すと、入力途中のタグが黙って失われる。TagInput から未確定テキストの有無を親へ伝えられるようにし（例: `onTextChange` を追加、または ref 経由で公開）、`front/src/pages/TicketForm.tsx:101` の `submit` で未確定テキストがある場合は `ConfirmDialog`（`front/src/components/ConfirmDialog.tsx`）で警告ダイアログを表示して、キャンセル時は保存を中断する。JSの `confirm` は使わない（下記「`window.confirm` を dialog 要素ベースの ConfirmDialog に統一する」参照）。

### `window.confirm` を dialog 要素ベースの ConfirmDialog に統一する
確認ダイアログの実装が2系統ある。TagList / TemplateList は dialog 要素ベースの `ConfirmDialog`（`front/src/components/ConfirmDialog.tsx`、`Dialog.tsx` 経由で `showModal`）を使うが、以下4箇所はJSネイティブの `confirm` を使っており、見た目・フォーカス挙動・ダークモード対応が不統一。

- `front/src/components/CommentHistory.tsx:24` — コメントを過去版に戻す確認
- `front/src/pages/TicketHistory.tsx:49` — チケットを過去版に戻す確認
- `front/src/pages/TicketForm.tsx:68` — テンプレート適用時の入力内容置き換え確認
- `front/src/pages/TicketForm.tsx:84` — `useBlocker` によるページ離脱確認

TagList / TemplateList と同じパターン（確認対象を state に保持 → `ConfirmDialog` を条件レンダー → onConfirm で実行）へ置き換える。同期的な `confirm` の戻り値に依存した制御フロー（テンプレート適用・`useBlocker` の proceed/reset）は state ベースに組み替える必要がある。`useBlocker` は確認中 `blocked` 状態を維持するため、`blocker.state === 'blocked'` の間 ConfirmDialog を表示し、確定で `proceed()`・キャンセル（onClose）で `reset()` を呼べばよい。なお `beforeunload`（`front/src/pages/TicketForm.tsx:92-99`）のリロード/タブ閉じ警告はブラウザネイティブ以外で代替不可能なため対象外。`alert` / `prompt` の使用箇所はない。

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

### TicketList のソートをメモ化する
`front/src/pages/TicketList.tsx:197,201,206` で `sortTickets(tickets, sort)` をJSX内で直接呼んでおり、再レンダーのたびに全件ソート＋新配列生成が走る。毎回新しい参照になるため TicketTree（`buildTree`/`flatten`）と TicketBoard（`columns`）の useMemo も無効化されている。`useMemo` で一度ソートし、3表示モードへ同じ参照を渡す。

### tagColor のカタログ探索をMap化する
`front/src/lib/tags.ts:66-75` の `tagColor` がタグ1個ごとに `catalog.find` を最大2回実行し、一覧レンダーが O(行数×タグ数×カタログ数) になる。タグ名→色の `Map` を `useMemo` で一度構築して引く形に変更（呼び出し側: TicketRow / TicketTree / TicketBoard など）。

### タグカタログのフェッチを共有キャッシュ化する
`front/src/lib/useCatalog.ts` がマウントごとに `/api/tags` を呼ぶため、一覧→詳細→編集の遷移で同じデータを取り直す。モジュールレベルで初回Promiseを共有するキャッシュにし、タグ編集（TagList）での変更時に無効化する。

### タグ使用数の件数専用エンドポイントを追加する
`front/src/pages/TagList.tsx:58-67` の `countUsage` が、削除・改名の確認のためだけに本文込みの全チケットJSONを取得している。`GET /api/tags/{id}/usage` のような件数専用API（サーバー側は `rewriteTicketTags` と同様のLIKE＋トークン判定でCOUNT）を追加してフロントを置き換える。docs/api.md の更新も。

## 要判断（修正 or 仕様として明記）

### design-system 逸脱2件の解消
- `front/src/components/Header.tsx:7` — アクティブなナビリンクに `font-bold`（規定では太字はmarkdown表示内のみ）
- `front/src/components/ViewSelect.tsx:108` — 保存済みビューのチップに `rounded-lg`（規定ではタグチップ限定）

コードを規定に合わせるか、docs/design-system.md に例外として明記するかを決めて対応する。

## 軽微

- `back/data/dao.go` — `rows.Close()` の扱いが3通り混在（`rewriteTicketTags` / `rebuildFts` はdefer＋明示の二重、`queryCommentsByTickets` はdeferなし手動）。チャンク処理を小関数に切り出して `defer rows.Close()` に統一
- `front/src/components/TicketBoard.tsx:71-73` — カード移動時の挿入位置 `index` がfilter前の `tags` 配列基準。filter後の `next` 配列で `findIndex` する方が正確（同一グループのタグが複数付いた不正データ時のみずれる）
- `front/src/pages/TicketList.tsx:48` — `tagsParam.split(',').filter(...)` が28行目の `tags` 導出と重複。統一する
- `back/server.go:488,518`（PUT /api/tags/{id} と /rename）— レスポンスがリクエストボディ由来の `data.Tag` をそのまま返すため、ボディで `sort_order` を省略するとDB上の実値と食い違う `sort_order: 0` が返る。DBから読み直して返すか、docs/api.md に挙動を明記する
- `back/data/dao.go:417-443`（`registerUnknownTags`）— タグ1個ごとに集計付きINSERTを実行。先に `SELECT tag FROM tag_catalog` を1回引いて差分だけINSERTすれば定数回になる
