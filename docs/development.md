# 開発ガイド

## 前提
* Go 1.26以上（cgo有効。go-sqlite3のビルドに必要）
* Node.js 24以上（LTS）

## ディレクトリ構成
```
back/            バックエンド（Go / net/http）
  main.go        エントリポイント（-addr, -static フラグ）
  server.go      APIルーティング・ハンドラ
  data/          DAO・SQL定義・FTSトークナイズ・日時/数値タグの範囲条件
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

# バックエンドをビルドして起動（FTS5を有効にするため -tags sqlite_fts5 が必須）
cd ../back
go build -tags sqlite_fts5 -o biletojy .
./biletojy            # http://localhost:8040
```
* `-addr` で待ち受けアドレス、`-static` でフロント配信ディレクトリを変更できる
* データベース `biletojy.db` はカレントディレクトリに自動作成され、初回にプリセットのタググループが投入される（[テーブル定義書](database.md)参照）

## 開発時
```sh
# ターミナル1: バックエンド（:8040）
cd back
go run -tags sqlite_fts5 .

# ターミナル2: フロント（:5173、/api は :8040 へプロキシ）
cd front
npm run dev
```

## テスト
```sh
just test             # バックエンドのテスト一式

# 手動で実行する場合
cd back
go test -tags sqlite_fts5 ./...
```
* テストは一時ディレクトリにDBを作成するため、`back/biletojy.db` は汚れない
* 対象はDAO・トークナイザ・日時/数値タグの範囲条件（`back/data/*_test.go`）とAPIハンドラ（`back/server_test.go`）。フロントにテストはない

## 関連ドキュメント
* [API仕様](api.md)
* [テーブル定義書](database.md)
* [UIデザインシステム](design-system.md)
