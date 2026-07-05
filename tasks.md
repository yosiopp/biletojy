# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。

## IAP連携によるユーザ識別子（sub）の記録
前段にIAP（Google Cloud IAP等の認証プロキシ）を配置した場合に、認証済みユーザの識別子（sub）をチケット・コメントへ補足情報として記録できるようにしてください。
`created_by` は従来どおりクライアント申告値（localStorage）を維持します。

1. 起動フラグ `-user-header` を追加してください（例: `-user-header X-Goog-Authenticated-User-Id`）。
   未指定時は現行動作のまま（subは空文字で記録）。ミドルウェアでリクエストヘッダから識別子を取得して context に保持し、
   Cloud IAP の `accounts.google.com:` のようなプレフィックスは `:` 以降を採用してください。
2. スキーマ変更（`PRAGMA user_version = 2` へのマイグレーション。既存DBには `ALTER TABLE ... ADD COLUMN`）:
   - `tickets` / `comments` に `created_sub`, `updated_by`, `updated_sub` を追加
   - `ticket_histories` の `created_by` は「その版を作成した人（編集者）」を記録する意味に変更し、`created_sub` を追加
   - `comment_histories` に `created_by`, `created_sub` を追加
3. API:
   - 作成時（POST）: `created_sub` / `updated_sub` はヘッダ値からサーバ側で設定する（ボディでの指定は無視）
   - 編集時（PUT）: ボディで `updated_by`（クライアント申告値）を受け取り、ヘッダ由来の `updated_sub` とともに保存する。
     履歴テーブルには編集者の `created_by` / `created_sub` を記録する（タスク「履歴の閲覧・差分表示」で編集者表示に利用できる）
   - レスポンスに `created_sub`, `updated_by`, `updated_sub` を含める
4. フロントエンド: 編集APIの呼び出しで `updated_by: currentUser()` を送信してください。
   チケット詳細画面の作成者名・コメント投稿者名の要素に `title` 属性として sub を付与してください（画面上に sub は表示しない）。
5. ヘッダを信頼できる前提条件（IAPを迂回したバックエンドへの直接アクセスをネットワーク層で遮断すること）を docs/development.md に明記し、
   docs/api.md / docs/database.md も更新してください。
   テストは「ヘッダ付きリクエストで sub が記録される」「ボディの sub 指定が無視される」「フラグ未指定時は現行動作」を server_test.go に追加してください。

## 履歴の閲覧・差分表示
チケット詳細画面から `ticket_histories` / `comment_histories` の履歴を閲覧できるようにしてください。
バージョン間の差分表示と、選択した版の内容に戻す機能を追加してください。
必要なAPI（例: `GET /api/tickets/{id}/histories`）も追加してください。

## 保存済み検索（ビュー）
よく使う検索条件（`q` + `tags` の組み合わせ）に名前を付けて保存し、チケット一覧画面から切り替えられるようにしてください。
保存先は localStorage としてください。

## エクスポート/インポート
チケット（コメント含む）を markdown または JSON でエクスポートできるようにしてください。
エクスポートしたデータをインポートする機能も追加してください。

## 配布対応（GitHub Releases + Docker イメージ）
GitHub Releases でのシングルバイナリ配布と、GHCR での Docker イメージ配布に対応してください。

1. `go:embed` で `front/dist` をバイナリに埋め込む（`-static` フラグは開発用オーバーライドとして残す）
2. cgo を無くすため SQLite ドライバを `modernc.org/sqlite`（pure Go、FTS5 標準対応）へ移行する（`just test` が通ることを確認）
3. GoReleaser + タグ（`v*`）push トリガーの GitHub Actions で Linux（amd64/arm64）・macOS・Windows のバイナリを Releases へ自動添付する
4. Dockerfile を追加し、同じワークフローで `ghcr.io/yosiopp/biletojy` へイメージを push する（DB はボリュームマウントで永続化する構成とし、README に起動手順を記載）