# verify — biletojyの動作確認レシピ

フロント(React/Vite) + バック(Go/SQLite)のチケット管理アプリを実際に起動してUI変更を確認する手順。

## ビルドと起動

```bash
just build   # front/dist を生成し dist/biletojy をビルド（-tags sqlite_fts5 必須）

# ユーザーのDB(dist/biletojy.db)を汚さないよう、別ディレクトリ・別ポートで起動する
# DBはカレントディレクトリの ./biletojy.db に作られ、初回起動でstatus/type/due-date@タグがシードされる
mkdir -p <scratchpad>/verify-run && cd <scratchpad>/verify-run
<repo>/dist/biletojy -addr :18040   # バックグラウンド起動（フロントは埋め込み済み。-static <dir> で差し替え可）
```

## データ投入

```bash
curl -X POST localhost:18040/api/tags -H 'Content-Type: application/json' -d '{"tag":"priority:high"}'
curl -X POST localhost:18040/api/tickets -H 'Content-Type: application/json' \
  -d '{"title":"検証用","content":"...","tags":"status:OPEN memo"}'
```

タグ重複作成は500を返す（既存シードと衝突しても無視してよい）。

## UIドライブ

Playwrightブラウザは `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` にキャッシュ済み。scratchpadで `npm i playwright-core` して `executablePath` に上記を渡せば追加ダウンロード不要。

主要ルート: `/tickets`（一覧+絞り込み）、`/tickets/new`・`/tickets/:id/edit`（TagInput）、`/tickets/:id`（詳細）、`/tags`（タグ管理）。

## 後片付け

起動したサーバープロセスをkillする。
