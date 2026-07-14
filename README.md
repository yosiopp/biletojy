# biletojy
issue tracking system with tag

[English](README.en.md) | [日本語](README.md)

## コンセプト
* チケットの属性はタグとして表現される
* チケットにmarkdown, mermaid記法を採用する
* タグはグループを持つことができる
* タグは階層構造を持つことができる
* 認証/認可の機能を持たない
* データベースにはSQLite3を使用する
* 操作にショートカットキーが使える

## 機能概要
### チケット
* markdown, mermaid記法で本文・コメントを記述できる
* 編集エリアに画像をペーストすると保存され、markdownの画像リンクが挿入される
* チケット・コメントは編集のたびに履歴が保存され、版の一覧・差分の閲覧と選択した版への復元ができる
* 全文検索でタイトル・本文・コメント・タグを横断して日本語も検索できる
* チケット一覧はid・更新日時のほか、日時タグ・数値タグの値でソートできる
* タイトル・本文・タグの雛形をテンプレートとして登録し、チケット作成時に選択して適用できる

### タグ
* タグの中間に`:`を含めた場合、そのタグの左辺はタググループとなる
* 同じタググループの複数のタグは、タグ付けする際にプルダウンメニューのように振る舞う
* タググループを使用することで、ステータス、カテゴリー、マイルストーンなどの属性を表現できる
* タグには色を指定できる
* タグの中間に`/`を含めた場合、そのタグは階層構造を持つと見なされる
* 階層構造を持つタグは、検索時にプルダウンメニューのように振る舞う
* タググループの末尾を`@`にした場合、日時を表すタグとして扱う  
  例えば、タグ登録/タグ編集時に `due-date@:` と入力すると、日付ピッカーが表示され日時を選択できる
* 日時タグは検索時に比較演算子（`>`, `<`, `>=`, `<=`, `=`）で範囲指定できる  
  例えば、`due-date@:>=2026-01-01` で期限が2026-01-01以降のチケットを検索できる
* タググループの末尾を`#`にした場合、数値を表すタグとして扱う  
  例えば、タグ登録/タグ編集時に `estimate#:` と入力すると、数値の入力欄が表示される
* 数値タグも検索時に比較演算子で範囲指定できる。値は数値として比較される  
  例えば、`estimate#:>=2` で見積りが2以上のチケットを検索できる

### ショートカット
* `ctrl+n` チケット作成
* `ctrl+e` 表示中のチケット編集
* `ctrl+h` 表示中のチケットの履歴
* `ctrl+l` チケット一覧へ移動
* `ctrl+t` タグ一覧へ移動
* `ctrl+m` テンプレート一覧へ移動
* `ctrl+shift+n` タグ作成

## 起動方法
### バイナリ（GitHub Releases）
[Releases](https://github.com/yosiopp/biletojy/releases) からOS・アーキテクチャに合ったアーカイブをダウンロードして展開する。
フロントエンドはバイナリに埋め込まれているため単体で動作し、データベース `biletojy.db` はカレントディレクトリに自動作成される。

```sh
./biletojy            # http://localhost:8040
```

### Docker（GHCR）
データベースはコンテナ内の `/data` に作成されるため、ボリュームをマウントして永続化する。

```sh
docker run -d --name biletojy -p 8040:8040 -v biletojy-data:/data ghcr.io/yosiopp/biletojy:latest
```

#### 環境変数
フラグ（`-addr` など）を指定しない場合、以下の環境変数で起動設定を与えられる（優先順位: フラグ > 環境変数 > 既定値）。

| 環境変数 | 対応フラグ | 既定値 | 内容 |
|---|---|---|---|
| `BILETOJY_ADDR` | `-addr` | `:8040` | 待ち受けアドレス |
| `PORT` | — | — | `BILETOJY_ADDR`・`-addr` がいずれも未指定のとき `:$PORT` にフォールバックする（Cloud Run 等のポート契約用） |
| `BILETOJY_USER_HEADER` | `-user-header` | （空） | 認証済みユーザ識別子を持つ信頼ヘッダ名（[IAP連携](docs/development.md#iap連携-user-header)参照） |
| `BILETOJY_STATIC` | `-static` | （空） | 埋め込みの代わりに配信するフロントのディレクトリ（開発用オーバーライド） |
| `BILETOJY_DB` | `-db` | `./biletojy.db` | SQLite データベースファイルのパス |

#### docker-compose
```yaml
services:
  biletojy:
    image: ghcr.io/yosiopp/biletojy:latest
    ports:
      - "8040:8040"
    environment:
      BILETOJY_DB: /data/biletojy.db
      # BILETOJY_USER_HEADER: X-Goog-Authenticated-User-Id
    volumes:
      - biletojy-data:/data
    restart: unless-stopped

volumes:
  biletojy-data:
```

#### Cloud Run 等のサーバーレス環境での注意
Cloud Run のファイルシステムはインスタンス終了時に破棄される揮発性（インメモリ）で、複数インスタンスがストレージを共有しない。SQLite に単一ファイルで書き込む本アプリでは以下が必須。

* **永続ボリュームのマウントが必須**（Cloud Run volume mounts で Cloud Storage / ネットワークファイルシステムをマウントし、`BILETOJY_DB` をそのパスに向ける）。マウントしない場合、データはインスタンス終了時に失われる
* **インスタンス数は1を推奨**（最小・最大インスタンスをともに1に固定）。複数インスタンスが同一SQLiteファイルへ同時書き込みするとロック競合や破損の恐れがある
* リッスンポートは `PORT` 環境変数（Cloud Run が注入する）に従うため、`BILETOJY_ADDR` を指定しなければ自動で `:$PORT` を待ち受ける

### ソースからビルド
[just](https://github.com/casey/just) がインストールされていれば1コマンドでビルド・起動できる。

```sh
just start            # ビルドして起動（http://localhost:8040）
```

詳細な手順や開発時の構成は [開発ガイド](docs/development.md) を参照。

## ドキュメント
* [開発ガイド](docs/development.md)
* [API仕様](docs/api.md)
* [テーブル定義書](docs/database.md)
* [UIデザインシステム](docs/design-system.md)
