# API仕様

ベースパスは `/api`。リクエスト/レスポンスともJSON。エラー時は `{"error": "メッセージ"}` を返す。
認証/認可は持たない。`created_by` が空の場合は `anonymous` が設定される。
リクエストボディは1MiBまでで、超えた場合は `413 Request Entity Too Large` を返す。

## エンドポイント一覧
| メソッド/パス | 内容 |
| --- | --- |
| `GET /api/tickets?q=&tags=` | チケット検索 |
| `POST /api/tickets` | チケット作成 |
| `GET /api/tickets/{id}` | チケット取得 |
| `PUT /api/tickets/{id}` | チケット編集 |
| `GET /api/tickets/{id}/backlinks` | バックリンク一覧 |
| `GET /api/tickets/{id}/comments` | コメント一覧 |
| `POST /api/tickets/{id}/comments` | コメント追加 |
| `PUT /api/comments/{id}` | コメント編集 |
| `GET /api/tags` | タグカタログ一覧 |
| `POST /api/tags` | タグ作成 |
| `PUT /api/tags/{id}` | タグ編集 |
| `DELETE /api/tags/{id}` | タグ削除 |

## チケット検索（GET /api/tickets）
クエリパラメータ:
* `q` — 全文検索キーワード。SQLite FTS5 + bi-gramトークナイズで、タイトル・本文・コメント・タグを横断して日本語も検索できる
* `tags` — タグ条件のカンマ区切り。すべての条件を満たすチケットに絞り込む（AND条件）
  * 完全一致に加え、階層タグ（`/` 区切り）は前方一致で子孫タグにもマッチする
  * 先頭 `-` で除外（NOT）を指定できる。例: `-status:CLOSE` でCLOSE以外に絞り込む
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
  created_by: string
  created_at: string
  updated_at: string
}
```
* 作成は `201 Created`、編集は `200 OK` を返す
* 編集時に `created_by`, `created_at` はサーバー側で元の値が維持される
* 編集のたびに履歴テーブル（`ticket_histories`）へ保存される

## コメント
```
Comment {
  id: number
  ticket_id: number
  content: string      // 必須。markdown, mermaid記法
  created_by: string
  created_at: string
  updated_at: string
}
```
* 編集のたびに履歴テーブル（`comment_histories`）へ保存される

## タグカタログ
```
Tag {
  id: number
  tag: string          // 必須。例: "status:OPEN", "due-date@:", "estimate#:"
  note: string | null  // 説明
  color: string | null // 例: "#e11d48"
  is_group: boolean    // ":" を含むタググループ（サーバー側でタグ名から導出）
  is_range: boolean    // グループ名末尾が "@" の日時タグまたは "#" の数値タグ（同上）
}
```
* タグ名は検索構文のメタ文字と衝突するため、`,`・`|`・空白（全角含む）を含む名前と、先頭が `-` の名前は使えない。
  違反した場合は `400 Bad Request` を返す
* 既存と同名のタグを作成・変更しようとした場合は `409 Conflict` を返す
* `is_group` / `is_range` はタグ名から自動導出されるため、リクエストで指定しても上書きされる
* 削除は `204 No Content` を返す。存在しないタグの削除は `404 Not Found` を返す
