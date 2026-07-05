# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。

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