# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

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
