# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

## 起動設定の環境変数対応（docker-compose / Cloud Run 向け）
- フラグのデフォルト値を環境変数から与える方式で対応する（優先順位: フラグ > 環境変数 > デフォルト。back/main.go のみの変更）
  - `-addr` ← `BILETOJY_ADDR`。両方未指定時は `PORT` があれば `:$PORT` にフォールバック（Cloud Run のポート契約に対応）、なければ `:8040`
  - `-user-header` ← `BILETOJY_USER_HEADER`
  - `-static` ← `BILETOJY_STATIC`
- DBパスも環境変数化する: `BILETOJY_DB`（デフォルトは現行の `./biletojy.db`）。`data.NewDao()` がパスを引数で受けるようシグネチャ変更が必要
- ドキュメント更新
  - README.md の Docker 節に環境変数一覧と docker-compose 例を追記
  - Cloud Run はファイルシステムが揮発性のため「ボリュームマウント必須・インスタンス数1推奨」の注意書きを README / docs/development.md に追記

## タグカタログのエクスポート/インポートとデフォルトタグの復元
- シードデータのGo構造体化: `_SQL_INIT_TAG_CATALOG`（back/data/const.go）のSQL文字列を `[]Tag` 相当のGoリテラルへ変更し、初回シードと復元機能の単一ソースにする（v6マイグレーションの `status:CLOSE` 参照はSQL側のため影響なし）
- DAO `ImportTags` を追加: トランザクションで一括登録。`TagNameError` で検証、`is_group` / `is_range` は `TagAttrs` で導出（既存 `saveTag` と同じ流儀）。sort_order 未指定時はセクション末尾（`_SQL_ADD_UNKNOWN_TAG` と同じ `MAX(sort_order) + 1` 方式）
- 新規API 3本（衝突時はどちらも既存タグを変更しない）
  - `GET /api/tags/export` — カタログ全件を `{tags: [{tag, note, color, sort_order}]}` でダウンロード（idは含めない）
  - `POST /api/tags/import` — 上記JSONを取り込み。同名の既存タグはスキップし `{imported, skipped}` を返す
  - `POST /api/tags/restore-defaults` — デフォルト定義の不足分のみ追加（既存カスタマイズを壊さない）。`{restored}` を返す
- チケットエクスポート/インポートのエンドポイントを `/api/tickets/export`・`/api/tickets/import` へ変更する（back/server.go のルーティングと front/src/api/client.ts の `exportUrl` / `importTickets`）
- フロントエンド: タグ一覧ページ（TagList.tsx）のヘッダへ ExportImport.tsx と同パターンのメニューを追加（エクスポート / インポート / デフォルトタグの復元。`useMenuKeys` によるキーボード操作・`invalidateCatalog` も同じ流儀）。復元とインポートは ConfirmDialog で確認を挟み、完了後に件数を表示
- docs/api.md を更新（新規3本の追記とチケットエクスポート/インポートのパス変更）

## チケット編集画面の分割表示モード（編集とプレビューを左右に並べる）
- TicketForm.tsx の `preview: boolean` を `mode: 'edit' | 'split' | 'preview'` に変更し、セグメントボタンを「編集 | 両方 | プレビュー」の3状態にする（「両方」は中央、角丸なし。JetBrains / HackMD と同型の排他的表示モード選択）
- 分割表示は `grid sm:grid-cols-2 gap-2` で左にTicketRefTextarea・右にプレビュー。両ペインとも同じ固定高（`h-96` 程度）でプレビュー側は `overflow-y-auto`
- プレビューへ渡す content は `useDeferredValue` を経由させる（Markdown.tsx の Mermaid が code 変更のたびに非同期レンダリングするため、キーストロークごとの発火を抑える）
- モバイル対応: 「両方」ボタンは `hidden sm:inline-block` で `sm` 未満は非表示。グリッドは `sm:grid-cols-2` なので分割中に狭めた場合は縦積みにフォールバック
- モード選択は localStorage で永続化し、次回のチケット作成・編集時に前回のモードを復元する。未知の値は 'edit' 扱いにするパース関数を通す（lib/viewMode.ts の parseViewMode と同じ流儀。保存キーは lib/theme.ts / lib/tags.ts の localStorage 利用と同様に定数化）
- スコープ外: スクロール同期、キーボードショートカットの追加

## フロントエンドの多言語化（en / ja、ブラウザ言語の優先度で自動選択）
- 方針: ライブラリは導入せず自前の軽量i18nモジュールで実装する（2言語・300文言弱の規模で複数形等の高度な機能が不要なため。依存最小のプロジェクト方針にも合わせる）
- フェーズ1 — 基盤: `front/src/i18n/` を新設
  - `ja.ts` — 正とする辞書（キーは「ページ/機能.意味」で構造化、`as const`）。`{count}` 形式のプレースホルダ置換に対応した `t(key, params?)` を提供
  - `en.ts` — `Record<keyof typeof ja, string>` で型により過不足をコンパイルエラーにする
  - `index.ts` — 言語決定（優先順位: `localStorage.lang` > `navigator.languages` を先頭から走査し `ja*` にマッチしたら ja > フォールバック en）。起動時に `document.documentElement.lang` を上書き（index.html の `lang="en"` 固定の解消）
  - 言語切替UIをヘッダーに追加（lib/theme.ts のテーマ切替と同パターン）。切替時は localStorage に保存して `location.reload()`。reload方式により `t()` はただの同期関数となり、React外のモジュール（lib/viewMode.ts / lib/sort.ts のラベル定数など）からもそのまま呼べる。Context/Provider は導入しない
- フェーズ2 — 文言の抽出: `components/` → `pages/` → `lib/` の順にUI文言（約210行・約25ファイル。TagList / TemplateList / TicketHistory が多い）をキー化して ja.ts へ移動。この時点では ja のみで動作は完全に不変
- フェーズ3 — 英訳: en.ts を埋める（型エラーで漏れが出ない）
- フェーズ4 — 仕上げ: docs/development.md にi18nの追加ルールを記載。任意で「JSX内の生の日本語リテラル」を検出する簡易lint（正規表現ベース）をCIに追加して再発防止
- 対象外・注意点
  - タグカタログの表示名・説明（`未処理` 等）とチケット本文・コメントはDBのユーザーデータなので対象外（back/data/const.go のシードも現状維持）
  - lib/date.ts は既に `yyyy-mm-dd HH:MM` 固定でロケール非依存のため変更不要
  - APIエラーはGoの `err` 文字列がそのまま返る現状のままとし、フロント側のエラー表示の枠組み文言（「〜に失敗しました」等）のみ翻訳
  - ショートカットヘルプ（components/Layout.tsx の `SHORTCUTS`）は説明文のみ翻訳
  - lib/tags.ts / api/client.ts の日本語はほぼコメントのみで翻訳不要

## READMEの多言語化（README.en.md の追加）
- デフォルト言語は日本語のため README.md は日本語のまま維持し、英語版 `README.en.md` をルートに追加する（GitHubはブラウザ言語によるREADMEの自動切替をサポートしないため、言語別ファイル+相互リンク方式）
- 両ファイルの冒頭に `[English](README.en.md) | [日本語](README.md)` の切替リンクを置く
- README.en.md は現行 README.md（76行）の全節を英訳する。タグ記法の例（`due-date@:` 等）やコマンドはそのまま
- 二重管理の同期ルールとして「README.md を更新したら README.en.md も更新する」旨を CLAUDE.md に追記する

## OpenAPI対応
- OpenAPI 3.1 仕様書 `docs/openapi.yaml` を新規作成する（外部I/Fドキュメント。独自クライアント・関連ツール作成者向け）
  - docs/api.md と back/server.go を突き合わせて全27エンドポイントを手書きで書き起こす（実装コードは変更しない）
  - back/server_test.go に pb33f/libopenapi-validator を組み込み、httptest の実レスポンスを openapi.yaml に対して検証してドリフトを防止する（本番コードへの影響ゼロ）
  - CLAUDE.md の「API変更時に更新するdocs」に openapi.yaml を追記する
