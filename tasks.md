# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。
関連の少ないタスクは、それぞれサブエージェント（Agentツール）に委譲してコンテキストを節約してください。
- 調査・分析タスクは並列実行して構いません。
- ファイルを変更するタスクを並列実行する場合は worktree で分離してください。

## フロントエンドの多言語化（en / ja、ブラウザ言語の優先度で自動選択）
- フェーズ1（i18n基盤 `front/src/i18n/` と言語切替UI）とフェーズ2（全UI文言のキー化・ja.ts への抽出）は実施済み
- フェーズ3 — 英訳: en.ts を埋める。現状は `{ ...ja }` の流用なので、`Record<keyof typeof ja, string>` を満たす明示的なリテラルに書き換える（型エラーで漏れが出ない）
- フェーズ4 — 仕上げ: docs/development.md にi18nの追加ルールを記載。任意で「JSX内の生の日本語リテラル」を検出する簡易lint（正規表現ベース）をCIに追加して再発防止
- 対象外・注意点
  - タグカタログの表示名・説明（`未処理` 等）とチケット本文・コメントはDBのユーザーデータなので対象外（back/data/const.go のシードも現状維持）
  - APIエラーはGoの `err` 文字列がそのまま返る現状のまま（フロント側の枠組み文言はキー化済み）
  - 言語名ラベル（Header.tsx の `日本語` / `English`）は翻訳せずその言語のまま表示する

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
