# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

biletojy — タグでチケットの属性を表現するissue tracking system。Go（net/http + SQLite3）のバックエンドと React + TypeScript + Vite + Tailwind CSS v4 のフロントエンドの2部構成。認証/認可は意図的に持たない。ドキュメントは日本語で書かれており、コミットメッセージも日本語。

## コマンド

```sh
just build                # フロント → バックエンドを一括ビルド
just start                # ビルドして本番構成で起動（http://localhost:8040、1プロセスでAPIとUIを配信）

# 開発時（2プロセス）
cd back && go run .                      # API :8040
cd front && npm run dev                  # UI :5173（/api は :8040 へプロキシ）

# テスト（バックエンドのみ。フロントにテストはない）
just test                                # または cd back && go test ./...
cd back && go test ./data -run TestName  # 単一テスト

# リント（フロント。警告0が必須）
cd front && npm run lint

# フロントの型チェック込みビルド
cd front && npm run build                # tsc -b && vite build
```

データベース `biletojy.db` はサーバー起動時のカレントディレクトリに自動作成・シードされる。動作確認で `back/biletojy.db` を汚さない手順は `.claude/skills/verify` を参照（別ディレクトリ・別ポートで起動する）。

## アーキテクチャ

### タグが中核のドメイン概念
タグ名の記法に意味があり、バックエンド（検索条件の解釈）とフロントエンド（`front/src/lib/tags.ts`：解析・コロン抜け補正・Tab補完などの入力支援、TagInput/TagFilter のUI挙動）の両方に実装が跨る。タグ仕様を変更する場合は両側の修正が必要。

* `group:value` — `:` の左辺はタググループ（ステータス等の排他的属性。UIではプルダウン風）
* `a/b/c` — `/` は階層構造。検索時は前方一致で子孫にもマッチ
* `name@:` — グループ名末尾 `@` は日時タグ。検索時に比較演算子（`>=` 等）で範囲指定できる（`back/data/rangecond.go`）
* `name#:` — グループ名末尾 `#` は数値タグ。日時タグと同様に比較演算子で範囲指定できる（値は数値として比較）

### バックエンド（back/）
* `main.go` — エントリポイント（`-addr` / `-static` / `-user-header` フラグ）
* `webui/` — `go:embed` でフロントのビルド成果物をバイナリへ埋め込む（`dist/` はビルド時に `front/dist` からコピー。`-static` は開発用オーバーライド）
* `server.go` — 全APIルーティング・ハンドラ（Go 1.22のメソッド付きパターンで `http.ServeMux` に直接登録）。SPAフォールバック配信もここ
* `data/` — DAO層。`dao.go` に全SQL操作、`const.go` にDDL（`_SQL_INIT`）とシードデータ、`tokenize.go` に日本語全文検索用のbi-gramトークナイザ

SQLiteドライバは `modernc.org/sqlite`（pure Go、cgo不要、FTS5標準対応）。全文検索はSQLite FTS5 + Go側でのbi-gramトークナイズ。FTSテーブルへは登録・検索の両方でトークナイズ済みテキストを渡す。コメント編集時は `refreshCommentsFts` でチケット単位に再構築される。チケット・コメントの編集は毎回履歴テーブル（`ticket_histories` / `comment_histories`）へ保存される。

### フロントエンド（front/src/）
* ルーティングは `App.tsx`（react-router）。ページは `pages/`（TicketList / TicketDetail / TicketForm / TicketHistory / TagList / TemplateList / FileList）
* チケット一覧はリスト / ツリー（階層タグで入れ子表示）/ カンバン（タググループ基準）の3表示モード（`lib/viewMode.ts`、`components/TicketTree.tsx` / `TicketBoard.tsx`）。並び替え・表示モードはクライアント側で処理し、URLクエリ（`sort` / `view` / `by`）で保持する
* 検索条件＋表示モードは「保存済みビュー」として localStorage に保存できる（`lib/views.ts`、`components/ViewSelect.tsx`）
* APIクライアントは `api/client.ts` に集約
* 本文・コメントは markdown + mermaid（`components/Markdown.tsx`）。エクスポート/インポートUI（`components/ExportImport.tsx`）とファイル添付（`components/AttachFileButton.tsx`）あり
* ショートカットキー対応が要件（ctrl+n 作成、ctrl+shift+n タグ作成、ctrl+e 編集、ctrl+h 履歴、ctrl+l 一覧、ctrl+shift+l ファイル一覧、ctrl+t タグ一覧、ctrl+m テンプレート一覧、? ヘルプ。`components/Layout.tsx` の `SHORTCUTS` が正）。キーボードだけで操作が完結すること

## UIデザインシステム

UIを追加・変更する際は [docs/design-system.md](docs/design-system.md) に必ず従う。要点:
* 色は neutral + blue 基本、状態色に red / amber のみ。`gray` / `slate` / `zinc` は使わない
* 角丸は `rounded-sm`（タグチップのみ `rounded-lg`）
* 見出しに `font-bold` を付けない（サイズだけで階層を示す）
* 独自コンポーネントライブラリ・CSS変数は導入せず、Tailwindユーティリティの組み合わせをトークンとして扱う
* モバイル（`sm`未満）ではテーブル風レイアウトをカード型に組み替える

## Git

* コミットメッセージは簡潔に（既存コミットと同様、日本語の一行サマリ）
* 「Co-Authored-By」などAI利用を示すフッターや署名は付けない

## 関連ドキュメント

* [docs/development.md](docs/development.md) — 開発ガイド
* [docs/api.md](docs/api.md) — API仕様（エンドポイント・スキーマ・検索クエリの仕様）
* [docs/database.md](docs/database.md) — テーブル定義書
* [docs/design-system.md](docs/design-system.md) — UIデザインシステム

API・テーブル・タグ仕様を変更したら、対応するdocsも更新すること。
