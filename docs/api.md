# API仕様

ベースパスは `/api`。リクエスト/レスポンスともJSON。エラー時は `{"error": "メッセージ"}` を返す。
認証/認可は持たない。`created_by` / `updated_by` はクライアント申告値で、空の場合は `anonymous` が設定される。
リクエストボディは1MiBまで（添付ファイルのアップロードとインポートは10MiBまで）で、超えた場合は `413 Request Entity Too Large` を返す。

CSRF対策として、書き込み系リクエストには以下の制約がある（[開発ガイド](development.md)参照）:
* JSONボディを受けるAPIは `Content-Type: application/json` が必須（`application/json; charset=utf-8` のようなパラメータ付きは可）。
  それ以外は `415 Unsupported Media Type` を返す。ファイルアップロード（`POST /api/files`）はJSONではないため対象外
* `GET` / `HEAD` / `OPTIONS` 以外のメソッドで、ブラウザが自動付与する `Sec-Fetch-Site` ヘッダが `cross-site` の場合は
  `403 Forbidden` を返す。curl等のブラウザ外クライアントはこのヘッダを送らないため、直接リクエストは影響を受けない

起動フラグ `-user-header` で認証プロキシ（IAP）由来のヘッダを指定すると、認証済みユーザの識別子（sub）を
チケット・コメントの `created_sub` / `updated_sub` へ補足情報として記録する（[開発ガイド](development.md)参照）。
subはサーバー側でヘッダ値から設定され、リクエストボディでの指定は無視される。未指定時は空文字が記録される。

## エンドポイント一覧
| メソッド/パス | 内容 |
| --- | --- |
| `GET /api/tickets?q=&tags=&limit=` | チケット検索 |
| `POST /api/tickets` | チケット作成 |
| `GET /api/tickets/{id}` | チケット取得 |
| `PUT /api/tickets/{id}` | チケット編集 |
| `GET /api/tickets/{id}/histories` | チケット履歴一覧 |
| `GET /api/tickets/{id}/backlinks` | バックリンク一覧 |
| `GET /api/tickets/{id}/comments` | コメント一覧 |
| `POST /api/tickets/{id}/comments` | コメント追加 |
| `PUT /api/comments/{id}` | コメント編集 |
| `GET /api/comments/{id}/histories` | コメント履歴一覧 |
| `GET /api/export?q=&tags=&format=` | チケットのエクスポート（JSON / markdown） |
| `POST /api/import` | エクスポートデータのインポート |
| `POST /api/files` | 添付ファイルアップロード |
| `GET /api/files/{id}` | 添付ファイル配信 |
| `GET /api/templates` | テンプレート一覧 |
| `POST /api/templates` | テンプレート作成 |
| `PUT /api/templates/{id}` | テンプレート編集 |
| `DELETE /api/templates/{id}` | テンプレート削除 |
| `GET /api/tags` | タグカタログ一覧 |
| `POST /api/tags` | タグ作成 |
| `PUT /api/tags/{id}` | タグ編集 |
| `PUT /api/tags/{id}/rename` | タグ名の変更（使用中チケットの一括書き換え） |
| `PUT /api/tags/order` | タグの並び替え |
| `DELETE /api/tags/{id}` | タグ削除 |

## チケット検索（GET /api/tickets）
結果は更新日時の降順で返す。

クエリパラメータ:
* `q` — 全文検索キーワード。SQLite FTS5 + bi-gramトークナイズで、タイトル・本文・コメント・タグを横断して日本語も検索できる
* `tags` — タグ条件のカンマ区切り。すべての条件を満たすチケットに絞り込む（AND条件）
  * 完全一致に加え、階層タグ（`/` 区切り）は前方一致で子孫タグにもマッチする
  * 先頭 `-` で除外（NOT）を指定できる。例: `-status:CLOSED` でCLOSED以外に絞り込む
  * `|` 区切りでOR条件を指定できる。例: `status:OPEN|status:WIP` でOPENまたはWIPに絞り込む。
    先頭 `-` と組み合わせた場合（例: `-status:OPEN|status:WIP`）はOR全体の除外になる
  * 日時タグ（グループ名末尾 `@`）は比較演算子（`>`, `<`, `>=`, `<=`, `=`）で範囲指定できる  
    例: `due-date@:>=2026-01-01` で期限が2026-01-01以降のチケットを検索できる。
    日付のみと時刻付き（`2026-01-01T10:00` 形式）が混在する場合は、短い方の精度に切り詰めて比較する
    * 演算子なしで日付形式の値を指定した場合（例: `due-date@:2026-01-01`）は `=` と同じ扱いになり、
      時刻付きの値（`due-date@:2026-01-01T10:00`）にも日付の精度でマッチする
    * 日付形式でない値（例: `due-date@:TBD`）は範囲条件の比較対象にならず、通常のタグ完全一致として扱われる
  * 数値タグ（グループ名末尾 `#`）も同様に比較演算子で範囲指定できる  
    例: `estimate#:>=2` で見積りが2以上のチケットを検索できる。
    値は数値として比較する（整数・小数・負数に対応。`estimate#:>=9` は `estimate#:10` にマッチする）
    * 演算子なしで数値形式の値を指定した場合（例: `estimate#:2`）は `=` と同じ扱いになり、
      `estimate#:2.0` のような表記違いにもマッチする
    * 数値形式でない値（例: `estimate#:TBD`）は範囲条件の比較対象にならず、通常のタグ完全一致として扱われる
* `limit` — 返す件数の上限（条件に一致した先頭からの件数）。0または未指定で全件。チケット参照の補完など先頭数件だけ必要な用途向け

## バックリンク（GET /api/tickets/{id}/backlinks）
本文またはコメント中に `#123` 形式で対象チケットを参照しているチケットの一覧（Ticketの配列）を、更新日時の降順で返す。
* 参照は後続が数字でない位置で判定する（`#12` の検索に `#123` はマッチしない）
* 自分自身の本文・コメントによる参照は含まれない

## チケット
```
Ticket {
  id: number
  title: string        // 必須
  content: string      // markdown, mermaid記法。#123 形式で他チケットを参照できる
  tags: string         // スペース区切り
  created_by: string   // 作成者（クライアント申告値）
  created_sub: string  // 作成者のsub（-user-header指定時にサーバー側で設定。ボディ指定は無視）
  updated_by: string   // 最終更新者（クライアント申告値。編集時にボディで受け取る）
  updated_sub: string  // 最終更新者のsub（同上）
  created_at: string
  updated_at: string
}
```
* 作成は `201 Created`、編集は `200 OK` を返す
* 作成時は `updated_by` / `updated_sub` に作成者の値が設定される
* 編集時に `created_by`, `created_sub`, `created_at` はサーバー側で元の値が維持される
* 編集のたびに履歴テーブル（`ticket_histories`）へ保存される。履歴の `created_by` / `created_sub` にはその版を作成した人（編集者）が記録される
* 作成・編集時に `tags` のうちタグカタログ未定義のタグは自動登録される
  * 日時・数値タグ（グループ名末尾 `@` / `#`）は値ごとではなくグループ（例: `due-date@:`）として登録される
  * 検索構文のメタ文字と衝突する名前（`,`・`|` を含む、先頭 `-`）は登録されない
  * `sort_order` には同一セクション（グループ / 値なしのグループエントリ全体 / グループでないタグ全体）内の
    最大値 + 1 が設定され、セクション末尾に登録順で並ぶ

## コメント
```
Comment {
  id: number
  ticket_id: number
  content: string      // 必須。markdown, mermaid記法
  created_by: string   // 投稿者（クライアント申告値）
  created_sub: string  // 投稿者のsub（-user-header指定時にサーバー側で設定。ボディ指定は無視）
  updated_by: string   // 最終更新者（クライアント申告値。編集時にボディで受け取る）
  updated_sub: string  // 最終更新者のsub（同上）
  created_at: string
  updated_at: string
}
```
* 作成時は `updated_by` / `updated_sub` に投稿者の値が設定される
* 編集時に `created_by`, `created_sub`, `created_at` はサーバー側で元の値が維持される
* 編集のたびに履歴テーブル（`comment_histories`）へ保存される。履歴の `created_by` / `created_sub` にはその版を作成した人（編集者）が記録される

## 履歴
チケット・コメントの作成・編集のたびに履歴テーブルへ保存された各版の内容を返す。
古い版から順（作成時の版 → 編集後の版）に返し、存在しないIDを指定した場合は空配列を返す。

選択した版へ戻す専用APIはなく、履歴の内容で編集API（`PUT /api/tickets/{id}` / `PUT /api/comments/{id}`）を
呼ぶことで新しい版として復元する（履歴が巻き戻ることはない）。

### チケット履歴（GET /api/tickets/{id}/histories）
```
TicketHistory {
  id: number           // 履歴ID
  ticket_id: number
  title: string
  content: string
  tags: string
  created_by: string   // その版を作成した人（作成時は作成者、編集時は編集者）
  created_sub: string  // その版を作成した人のsub
  created_at: string   // 履歴作成日時
}
```

### コメント履歴（GET /api/comments/{id}/histories）
```
CommentHistory {
  id: number           // 履歴ID
  comment_id: number
  content: string
  created_by: string   // その版を作成した人（作成時は投稿者、編集時は編集者）
  created_sub: string  // その版を作成した人のsub
  created_at: string   // 履歴作成日時
}
```

## エクスポート/インポート
チケット（コメント込み）のバックアップ・移行用。JSON形式が機械可読・再インポート用の正で、
markdown形式は人間可読の書き出し用（再インポートには使えない）。添付ファイルは含まれない。

### エクスポート（GET /api/export?q=&tags=&format=）
チケット検索（`GET /api/tickets`）と同じ `q` / `tags` で対象を絞り込める（省略時は全件、更新日時の降順）。
`format` は `json`（既定）または `markdown` で、それ以外の値は `400 Bad Request` を返す。
`Content-Disposition: attachment` 付きで `biletojy-export.json` / `biletojy-export.md` としてダウンロードさせる。

JSON形式（`application/json`）:
```
Export {
  exported_at: string        // エクスポート日時
  tickets: TicketExport[]
}

TicketExport {
  ...Ticket                  // チケットの全フィールド
  comments: Comment[]        // コメント（作成日時の昇順）
}
```

markdown形式（`text/markdown; charset=utf-8`）はチケットごとに見出し（`# #{id} {title}`）・
タグ・作成/更新情報・本文・コメントを並べ、チケット間を `---` で区切ったテキスト。

### インポート（POST /api/import）
JSONエクスポートと同じ形式の `tickets` 配列を受け取り、チケット・コメントをまとめて登録する
（全件成功か全件失敗のどちらかで、部分的に取り込まれることはない）。

```
{ "tickets": [TicketExport, ...] }
```

* `id` は元の値によらず新規に採番される（既存チケットの上書きや重複排除は行わない）
* 通常のチケット作成と同じ経路で処理され、履歴テーブルへの記録（インポート後の内容の1版のみ。
  エクスポート元の履歴は引き継がれない）・FTSインデックスへの登録・タグカタログ未定義タグの自動登録が行われる
* バックアップの復元用途のため、`created_by` / `updated_by` / `created_sub` / `updated_sub` と
  `created_at` / `updated_at` はデータの値をそのまま引き継ぐ（`-user-header` 由来のsubは適用しない）。
  `created_by` が空の場合は `anonymous`、`updated_by` が空の場合は `created_by` の値、
  タイムスタンプ未設定時はインポート時刻が設定される
* `tickets` が空、タイトルのないチケット、または本文のないコメントを含む場合は `400 Bad Request` を返す
* リクエストボディは10MiBまで受け付ける
* 成功時は `201 Created` で `{"imported": 件数}` を返す

## 添付ファイル
チケット・コメントの編集エリアへの貼り付け・ドロップ・ファイル選択での添付用（画像に限らずログ・PDF等の任意のファイル）。
本文には画像は `![名前](/api/files/{id})` のmarkdown画像リンク、それ以外は `[名前](/api/files/{id})` のダウンロードリンクとして挿入する。

### アップロード（POST /api/files?name=）
リクエストボディにファイルのバイナリをそのまま送り、`Content-Type` ヘッダでMIMEタイプを指定する（JSONではない）。

* クエリパラメータ `name` でファイル名を指定できる（省略可。配信時の `Content-Disposition` に使われる）
* MIMEタイプの制限はない。`Content-Type` ヘッダが空の場合は `application/octet-stream` として保存する
* ボディが空の場合は `400 Bad Request` を返す
* ボディは10MiBまでで、超えた場合は `413 Request Entity Too Large` を返す
* 成功時は `201 Created` で以下を返す

```
File {
  id: number
  name: string         // アップロード時のnameクエリパラメータ（未指定は空文字）
  mime: string         // アップロード時のContent-Type
  created_at: string
}
```

### 配信（GET /api/files/{id}）
アップロードしたバイナリを `Content-Type: {mime}` で返す。存在しない場合は `404 Not Found`（JSON）を返す。

ファイルは編集されないため、キャッシュ用に以下のレスポンスヘッダを付与する:
* `Cache-Control: public, max-age=31536000, immutable`
* `ETag`（ファイルID）と `Last-Modified`（作成日時）— `If-None-Match` / `If-Modified-Since` 付きの条件付きGETには `304 Not Modified` を返す

画像（`image/png`, `image/jpeg`, `image/gif`, `image/webp`）はこれまで通りインライン表示で配信する。
それ以外のMIMEタイプはHTML等をブラウザ内で実行させないため、以下を付与してダウンロードとして配信する:
* `Content-Disposition: attachment`（`name` 指定時は `filename` 付き。非ASCIIのファイル名はRFC 2231の `filename*` 形式）
* `X-Content-Type-Options: nosniff`

## テンプレート
チケット作成時に選択して適用するタイトル・本文・タグの雛形（バグ報告などの定型入力の支援用）。
テンプレートを適用してもチケットとの関連は記録されず、作成されるチケットは通常のチケットと同じ扱い。

```
Template {
  id: number
  name: string         // 必須。テンプレートの表示名（例: "バグ報告"）
  title: string        // 適用するタイトルの雛形
  content: string      // 適用する本文の雛形（markdown, mermaid記法）
  tags: string         // 適用するタグ（スペース区切り）
  created_at: string
  updated_at: string
}
```
* 一覧は `name` 昇順（同名は登録順）で返す
* 作成は `201 Created`、編集は `200 OK` を返す。`name` が空の場合は `400 Bad Request` を返す
* 編集時に `created_at` はサーバー側で元の値が維持される。存在しないIDの編集は `404 Not Found` を返す
* 削除は `204 No Content` を返す。存在しないテンプレートの削除は `404 Not Found` を返す
* テンプレートの `tags` はタグカタログへの自動登録を行わない（テンプレートを適用したチケットの作成時に登録される）

## タグカタログ
```
Tag {
  id: number
  tag: string          // 必須。例: "status:OPEN", "due-date@:", "estimate#:"
  note: string | null  // 説明
  color: string | null // 例: "#e11d48"
  is_group: boolean    // ":" を含むタググループ（サーバー側でタグ名から導出）
  is_range: boolean    // グループ名末尾が "@" の日時タグまたは "#" の数値タグ（同上）
  sort_order: number   // グループ内の表示順（並び替えAPIで設定。既定は0）
}
```
* タグ名は検索構文のメタ文字と衝突するため、`,`・`|`・空白（全角含む）を含む名前と、先頭が `-` の名前は使えない。
  違反した場合は `400 Bad Request` を返す
* 既存と同名のタグを作成・変更しようとした場合は `409 Conflict` を返す
* `is_group` / `is_range` はタグ名から自動導出されるため、リクエストで指定しても上書きされる
* `sort_order` は作成・編集では変更されない（並び替えAPIでのみ設定される）
* 一覧は「値を持つタググループ（`status:` などの接頭辞順）→ 値なしのグループエントリ（`due-date@:` など）→
  グループでないタグ」の順にまとめて返す。それぞれの中は `sort_order` 昇順（同値はタグ名昇順）。
  タググループのプルダウンの選択肢はこの順に並ぶ
* 削除は `204 No Content` を返す。存在しないタグの削除は `404 Not Found` を返す

### タグ名の変更（PUT /api/tags/{id}/rename）
タグ編集（`PUT /api/tags/{id}`）と同様にカタログを更新することに加え、そのタグを使用している
全チケットのタグ表記も一括で書き換える。チケット側のタグ名も追従させたい名前変更にはこちらを使う。

```
{ "tag": "feature:FTS", "note": "検索機能", "color": "#3b82f6", "updated_by": "alice" }
```
* 成功時は `200 OK` で編集後の `Tag` を返す。タグ名のバリデーションと同名タグの `409 Conflict` はタグ編集と同じ
* チケットの書き換えはタグ単位の完全一致で行う
  * 値なしのグループエントリ（`due-date@:` など末尾 `:`）は前方一致で値つきのタグごと書き換える（`due-date@:` → `deadline@:` で `due-date@:2026-01-01` は `deadline@:2026-01-01` になる）
  * 階層タグの子孫は別タグのため書き換えない（`docs` の変更で `docs/design` は変わらない）
  * 書き換えの結果、チケット内で既存のタグと重複した場合はひとつにまとめる
* 書き換えたチケットは通常の編集と同じ扱いで、`updated_by`（ボディの値。空なら `anonymous`）・
  `updated_sub`（`-user-header` 由来）・`updated_at` が設定され、履歴テーブルとFTSインデックスも更新される
* 名前が変わらない場合はカタログのみ更新し、チケットは書き換えない

### 並び替え（PUT /api/tags/order）
タグIDの配列を並べたい順で送ると、各タグの `sort_order` へ先頭から1始まりの連番を設定する。
同じセクション（同一グループ、値なしのグループエントリ全体、グループでないタグ全体のいずれか）の
タグIDをまとめて送り、セクション内の並び替えに使う。

```
{ "ids": [4, 3, 2, 1] }
```
* 成功時は `204 No Content` を返す
* `ids` が空または未指定の場合は `400 Bad Request` を返す
