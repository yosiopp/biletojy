# memo
## プリセットのタググループ
tag_catalogテーブルに格納されているレコードはタグ一覧に出力される。  
初期状態でいくつかのタググループをプリセットしておく。  
プリセットのタググループも削除可能とする。

* `status`　状態
  * `status:OPEN`　未処理
  * `status:WIP`　処理中
  * `status:DONE`　処理済
  * `status:CLOSE`　完了
* `type`　種別
  * `type:ISSUE`　課題
  * `type:TASK`　タスク
  * `type:BUG`　バグ
  * `type:QUESTION`　質問
  * `type:NOTE`　メモ
* `due-date@`　期限

## tickets_ftsテーブルのトークナイズ処理
### title
1. 複数スペース、改行コードの統合
2. bi-gram

### content
1. markdown装飾記号の除去
2. 複数スペース、改行コードの統合
3. bi-gram

### comments
1. commentsテーブルから関連コメント本文を全て取得して結合
2. markdown装飾記号の除去
2. 複数スペース、改行コードの統合
3. bi-gram

### tags
* そのままスペース区切りで格納する
