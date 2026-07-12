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
  src/pages/     画面（チケット一覧/詳細/作成編集/履歴、タグ一覧、テンプレート一覧）
  src/components/ 共通コンポーネント
  src/lib/       タグ・日付などのユーティリティ
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

## セキュリティ対策
APIの直接リクエスト（curl・スクリプト・サーバー間連携）は許可しつつ、悪意あるWebページが訪問者のブラウザを踏み台にして
書き込みAPIを叩くクロスサイト攻撃（CSRF）を防ぐため、`back/server.go` で以下を実装している。

* **クロスサイト書き込みの拒否**: `GET` / `HEAD` / `OPTIONS` 以外のメソッドで `Sec-Fetch-Site: cross-site` の
  リクエストを `403` で拒否する（`withCrossSiteBlock`）。このヘッダはブラウザだけが自動付与しページ側から偽装できないため、
  ヘッダを送らないブラウザ外の直接リクエストはそのまま通過する。読み取り系はCORS未設定により他オリジンのJSから
  レスポンスを読めないため検査せず、他サイトからのリンク遷移も妨げない
* **Content-Typeの必須化**: JSONボディを受けるAPIは `Content-Type: application/json` 以外を `415` で拒否する（`readJsonLimit`）。
  HTMLのform要素からは `application/json` を送れないため、formベースのクロスサイト送信を排除する
* **CSP**: SPA配信（静的ファイルとindex.htmlフォールバック）に `Content-Security-Policy` を付与する（`contentSecurityPolicy`）。
  リソースの読み込み元を同一オリジンに制限し、index.htmlのテーマ初期化インラインスクリプトは起動時に計算した
  ハッシュで許可する。`style-src 'unsafe-inline'` はmermaidが生成するSVGのインラインスタイル用、
  `img-src` の `data:` / `https:` はmermaidの埋め込み画像とmarkdown本文の外部画像参照用。APIレスポンスには付与しない

CORSヘッダ（`Access-Control-*`）は意図的に設定していない。ブラウザの同一オリジンポリシーにより
他オリジンのJSからAPIレスポンスを読めない状態を維持する。

## 開発時
```sh
# ターミナル1: バックエンド（:8040）
cd back
go run .

# ターミナル2: フロント（:5173、/api は :8040 へプロキシ）
cd front
npm run dev
```

## クライアント側の保存データ（localStorage）
サーバーに保存されないユーザ単位の設定は、ブラウザの localStorage に以下のキーで保存される。

| キー | 内容 | 実装 |
|---|---|---|
| `biletojy.theme` | テーマ設定（`light` / `dark`。未設定時はOS設定に追従） | `front/index.html`, `front/src/lib/theme.ts` |
| `biletojy.user` | ユーザ名（チケット・コメントの `created_by` / `updated_by` に使う申告値） | `front/src/lib/tags.ts` |
| `biletojy.views` | 保存済みビュー（チケット一覧の検索条件 q + tags と表示モードに名前を付けたもの） | `front/src/lib/views.ts` |

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
