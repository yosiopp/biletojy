# API仕様

ベースパスは `/api`。リクエスト/レスポンスともJSON。エラー時は `{"error": "メッセージ"}` を返す。
認証/認可は持たない。`created_by` が空の場合は `anonymous` が設定される。

## エンドポイント一覧
| メソッド/パス | 内容 |
| --- | --- |
| `GET /api/tickets?q=&tags=` | チケット検索 |
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

## チケット検索（GET /api/tickets）
クエリパラメータ:
* `q` — 全文検索キーワード。SQLite FTS5 + bi-gramトークナイズで、タイトル・本文・コメント・タグを横断して日本語も検索できる
* `tags` — タグのカンマ区切り。すべてのタグを含むチケットに絞り込む（AND条件）
  * 完全一致に加え、階層タグ（`/` 区切り）は前方一致で子孫タグにもマッチする
  * 日時タグ（グループ名末尾 `@`）は比較演算子（`>`, `<`, `>=`, `<=`, `=`）で範囲指定できる  
    例: `due-date@:>=2026-01-01` で期限が2026-01-01以降のチケットを検索できる。
    日付のみと時刻付き（`2026-01-01T10:00` 形式）が混在する場合は、短い方の精度に切り詰めて比較する

## チケット
```
Ticket {
  id: number
  title: string        // 必須
  content: string      // markdown, mermaid記法
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
  tag: string          // 必須。例: "status:OPEN", "due-date@:"
  note: string         // 説明
  color: string        // 例: "#e11d48"
  is_group: boolean    // ":" を含むタググループ（サーバー側でタグ名から導出）
  is_range: boolean    // グループ名末尾が "@" の日時タグ（同上）
}
```
* `is_group` / `is_range` はタグ名から自動導出されるため、リクエストで指定しても上書きされる
* 削除は `204 No Content` を返す
