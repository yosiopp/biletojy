# biletojy
issue tracking system with tag

## コンセプト
* チケットの属性はタグとして表現される
* チケットにmarkdown, mermaid記法を採用する
* タグはグループを持つことができる
* タグは階層構造を持つことができる
* 認証/認可の機能を持たない
* データベースにはSQLite3を使用する
* 操作にショートカットキーが使える

## ショートカット
* `ctrl+n` チケット作成
* `ctrl+e` 表示中のチケット編集
* `ctrl+l` チケット一覧へ移動
* `ctrl+t` タグ一覧へ移動
* `ctrl+shift+n` タグ作成

## 起動方法
### 前提
* Go 1.22以上（cgo有効。go-sqlite3のビルドに必要）
* Node.js 18以上

### 本番構成（1プロセスでAPIとUIを配信）
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
* データベース `biletojy.db` はカレントディレクトリに自動作成され、初回にプリセットのタググループが投入される

### 開発時
```sh
# ターミナル1: バックエンド（:8040）
cd back
go run -tags sqlite_fts5 .

# ターミナル2: フロント（:5173、/api は :8040 へプロキシ）
cd front
npm run dev
```

## API
| メソッド/パス | 内容 |
| --- | --- |
| `GET /api/tickets?q=&tags=` | チケット検索（qは全文検索、tagsはカンマ区切り。階層タグは前方一致） |
| `POST /api/tickets` | チケット作成 |
| `GET /api/tickets/{id}` | チケット取得 |
| `PUT /api/tickets/{id}` | チケット編集 |
| `GET /api/tickets/{id}/comments` | コメント一覧 |
| `POST /api/tickets/{id}/comments` | コメント追加 |
| `PUT /api/comments/{id}` | コメント編集 |
| `GET /api/tags` | タグカタログ一覧 |
| `POST /api/tags` | タグ作成 |
| `PUT /api/tags/{id}` | タグ編集 |
| `DELETE /api/tags/{id}` | タグ削除 |

チケット・コメントは編集のたびに履歴テーブルへ保存される。全文検索はSQLite FTS5 + bi-gramトークナイズで、タイトル・本文・コメント・タグを横断して日本語も検索できる。

## タグ
* タグの中間に:を含めた場合、そのタグの左辺はタググループとなる
* 同じタググループの複数のタグは、タグ付けする際にプルダウンメニューのように振る舞う
* タググループを使用することで、ステータス、カテゴリー、マイルストーンなどの属性を表現できる
* タグには色を指定できる
* タグの中間に/を含めた場合、そのタグは階層構造を持つと見なされる
* 階層構造を持つタグは、検索時にプルダウンメニューのように振る舞う
* タググループも末尾を@にした場合、日時を表すタグとして扱う  
  例えば、タグ登録/タグ編集時に `due-date@:` と入力すると、日付ピッカーが表示され日時を選択できる