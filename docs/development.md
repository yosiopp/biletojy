# 開発ガイド

## 前提
* Go 1.26以上（SQLiteドライバはpure Goの `modernc.org/sqlite` のためcgo不要）
* Node.js 24以上（LTS）

## ディレクトリ構成
```
back/            バックエンド（Go / net/http）
  main.go        エントリポイント（-addr, -static, -user-header フラグ）
  server.go      APIルーティング・ハンドラ
  data/          DAO・SQL定義・FTSトークナイズ・日時/数値タグの範囲条件
  webui/         フロントのビルド成果物の埋め込み（go:embed。dist/はビルド時にコピー）
front/           フロントエンド（React + TypeScript + Vite + Tailwind CSS）
  src/pages/     画面（チケット一覧/詳細/作成編集、タグ一覧）
  src/components/ 共通コンポーネント
  src/lib/       タグ・日付のユーティリティ
  src/api/       APIクライアント
docs/            開発向けドキュメント
justfile         ビルド・起動タスク
```

## 本番構成（1プロセスでAPIとUIを配信）
[just](https://github.com/casey/just) がインストールされていれば1コマンドでビルドできる。

```sh
just build            # フロント → バックエンドを一括ビルド
just start            # ビルドして起動（http://localhost:8040）
```

手動で実行する場合:
```sh
# フロントをビルド
cd front
npm install
npm run build

# フロントのビルド成果物を埋め込み用にコピーし、バックエンドをビルド
cd ../back
rm -rf webui/dist
mkdir -p webui/dist
cp -R ../front/dist/. webui/dist/
touch webui/dist/.gitkeep
go build -o ../dist/biletojy .

# dist/ から起動（DBはカレントディレクトリに作られる）
cd ../dist
./biletojy            # http://localhost:8040
```
* フロントは `go:embed`（`back/webui/`）でバイナリに埋め込まれるため、バイナリ単体で配置できる
* `-addr` で待ち受けアドレスを変更できる。`-static` を指定すると埋め込みの代わりに指定ディレクトリを配信する（開発用オーバーライド）
* データベース `biletojy.db` はカレントディレクトリに自動作成され、初回にプリセットのタググループが投入される（[テーブル定義書](database.md)参照）

## IAP連携（-user-header）
前段にGoogle Cloud IAPなどの認証プロキシを配置している場合、`-user-header` で認証済みユーザの識別子（sub）が入るリクエストヘッダを指定できる。

```sh
./biletojy -user-header X-Goog-Authenticated-User-Id
```

* 指定したヘッダの値を、チケット・コメントの作成/編集時に `created_sub` / `updated_sub` として補足情報を記録する。
  Cloud IAP の `accounts.google.com:{sub}` のようなプレフィックスは `:` 以降を採用する
* `created_by` / `updated_by` は従来どおりクライアント申告値（localStorage）のままで、subはあくまで補足情報
* 未指定時は現行動作のまま（subは空文字で記録される）
* **前提条件: 指定したヘッダは信頼できる値として扱うため、IAPを迂回したバックエンドへの直接アクセスは
  ネットワーク層（ファイアウォール・VPCの内部ロードバランサ等）で必ず遮断すること。**
  遮断しない場合、クライアントが任意のヘッダを送って他人のsubを詐称できる

## 開発時
```sh
# ターミナル1: バックエンド（:8040）
cd back
go run .

# ターミナル2: フロント（:5173、/api は :8040 へプロキシ）
cd front
npm run dev
```

## リリース
`v` から始まるタグ（例: `v1.0.0`）をpushすると、GitHub Actions（`.github/workflows/release.yml`）がGoReleaser（`.goreleaser.yaml`）を実行し、
Linux（amd64/arm64）・macOS（amd64/arm64）・Windows（amd64）のバイナリをGitHub Releasesへ添付し、
マルチアーキ（amd64/arm64）のDockerイメージを `ghcr.io/yosiopp/biletojy`（`{バージョン}` と `latest` タグ）へpushする。

```sh
git tag v1.0.0
git push origin v1.0.0
```

ローカルで成果物を確認する場合はスナップショットビルドを使う（成果物は `.goreleaser-dist/`）。

```sh
goreleaser release --snapshot --clean --skip=publish
```

## テスト
```sh
just test             # バックエンドのテスト一式

# 手動で実行する場合
cd back
go test ./...
```
* テストは一時ディレクトリにDBを作成するため、`back/biletojy.db` は汚れない
* 対象はDAO・トークナイザ・日時/数値タグの範囲条件（`back/data/*_test.go`）とAPIハンドラ（`back/server_test.go`）。フロントにテストはない

## 関連ドキュメント
* [API仕様](api.md)
* [テーブル定義書](database.md)
* [UIデザインシステム](design-system.md)
