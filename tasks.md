# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

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

### タグ使用数の件数専用エンドポイントを追加する
`front/src/pages/TagList.tsx:58-67` の `countUsage` が、削除・改名の確認のためだけに本文込みの全チケットJSONを取得している。`GET /api/tags/{id}/usage` のような件数専用API（サーバー側は `rewriteTicketTags` と同様のLIKE＋トークン判定でCOUNT）を追加してフロントを置き換える。docs/api.md の更新も。
