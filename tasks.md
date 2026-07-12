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

## ヘッダー改善（「+ 新規チケット」のチケット一覧への移動とモバイルナビのハンバーガーメニュー化）
UIレビューで判明したモバイル表示の横はみ出し（375px幅で全ページ scrollWidth=550px。原因はヘッダー1行flexの右側要素）の解消と、作成ボタン配置の他画面との統一。
- 「+ 新規チケット」を Header.tsx からチケット一覧へ移動する
  - TicketList.tsx に他の一覧ページと同じタイトル行を追加（TagList.tsx の `<h2 className="text-xl flex-1">タグ一覧</h2>` + 右端ボタンと同パターン。`title="ctrl+n"` の Link to `/tickets/new`）
  - ctrl+n（components/Layout.tsx の SHORTCUTS）はグローバルのまま維持し、どの画面からも作成できる導線はショートカットとして残す
- モバイル（`sm` 未満）ではグローバルナビ（tickets / tags / templates / files）をヘッダーのハンバーガーボタンで開くポップアップメニューへ移動する。デスクトップ（`sm` 以上）は現状の横並びのまま（`hidden sm:flex` で出し分け）
  - drawerではなく ExportImport.tsx / ViewSelect.tsx と同型のメニューにする（`useMenuKeys` + `useOutsideClick` の流儀で、↑↓移動・Enter実行・Escapeで閉じる。`aria-haspopup` / `aria-label` 付与）。リンク選択で閉じる
  - エクスポート/インポート（ExportImport.tsx）は検索条件（q + tags）に依存するためチケット一覧に残す（ボタンのハンバーガーアイコン化は「アイコンボタン化」タスク側で行う）
  - テーマ選択・ユーザ名はナビ除去後なら375pxに収まる見込み（実測: ボタン除去で約126px、ナビで約264px削減）だが、収まらなければメニュー側へ移す
  - ハンバーガー開閉のアイコンは「アイコンボタン化」タスクの `menu` / `close` を使う（着手順によってはテキスト「≡」で仮置きし、アイコンタスク側で差し替え）
- 検証: `tools/capture-screens.mjs` でモバイル各ルートを再キャプチャし、`document.documentElement.scrollWidth === 375` になることを確認する。ハンバーガーメニューを開いた状態のキャプチャもスクリプトに追加する

## UIレビューの小粒改善（フロントのみ、コミットは項目ごと）
2026-07-12 のUIレビュー（`tools/capture-screens.mjs` で再現可能）での指摘。各項目は独立しており個別にコミットする。
- ヘルプ「?」ボタン（Layout.tsx の `fixed bottom-4 right-4`）が一覧最下部の行の「削除」等の操作リンクに重なる。main側に `pb-16` 程度の余白を足すか、ヘルプの配置を見直す
- 検索欄のプレースホルダー（TagFilter.tsx）が構文説明で長すぎモバイルで途切れる。「タグまたは全文検索」程度に短縮し、検索構文（-除外・|OR・日時/数値の比較演算子）はショートカットヘルプ（Layout.tsx）に検索構文セクションを追加して案内する
- チケット履歴（TicketHistory.tsx）が v1 のみのとき、旧/新ラジオと「選択した版の間に差分はありません」ではなく「変更履歴はまだありません」を表示する
- カンバン（TicketBoard.tsx）の「なし」列は空のとき非表示にする（ドラッグ中のドロップ先としてのみ表示）
- ツリー表示（TicketTree.tsx）で、グルーピングに使っている階層タグのチップが各行にも重複表示されるので行側から省く
- 保存済みビューの「ビュー」チップ（ViewSelect.tsx）はビュー未保存時に破線グレーで常時無効な部品に見える。未保存時は非表示にするか「現在の条件をビューとして保存」を明示する
- タグ一覧（TagList.tsx）にタグ名・説明での絞り込み入力を追加する（タグが増えたときの検索性）
- モバイル（`sm` 未満）のチケット一覧上部は検索+絞り込み+ビュー切替+並び替え+エクスポートで約300px消費するため、絞り込み行を折りたたみにする等で1画面目の情報量を増やす

## タグ入力補完のカスタム化（ネイティブdatalistの置き換え）
- TicketForm の TagInput.tsx はネイティブ `<datalist>` による補完のため、絞り込みバー（TagGroupSelect）のカスタムプルダウンと見た目・挙動が不一致で、タグの色や説明（note）も候補に出せない。ブラウザ差（Safariのdatalistは挙動が弱い）もある
- TagGroupSelect 系と同じ流儀のカスタム候補リストへ置き換える。既存のTab補完（前方一致の確定部分まで補完）・Enter確定・コロン抜け補正の挙動は維持し、候補にタグ色チップと説明を表示する
- キーボード操作（上下移動・Enter確定・Escapeで閉じる）だけで完結すること

## アイコンボタン化（Material Symbols のSVGをCSSマスクで利用）
テキストラベルの繰り返し・記号文字で表現しているボタンをアイコンボタンへ置き換え、行の視覚ノイズとヘッダー・操作列の幅を減らす。
- 基盤
  - [Material Symbols](https://fonts.google.com/icons) から「Outlined・weight 400・optical size 20・fill 0」に統一してSVGをダウンロードし、`front/public/icons/` に配置する（スタイル軸の混在禁止）。Apache 2.0 のライセンス表記ファイルを同ディレクトリに同梱する
  - 共通 `Icon` コンポーネントを新設する。`<img src>` では文字色・ダークモード・hoverの色変化が効かないため、CSSマスク方式（`bg-current` + `mask-image: url(/icons/<name>.svg)`。Tailwind v4.3 のmaskユーティリティが使える）で描画し、`aria-hidden` を付ける
  - アイコンのみのボタンは `aria-label` と `title` を必須にし、モバイルのタップターゲットとして `p-2` 程度（実質40px四方）を確保する。このルールとスタイル軸の固定を docs/design-system.md に追記する
  - 「+ 新規チケット」「作成 / 更新 / キャンセル / コメント」などの主要アクションはテキストラベルを維持する（アイコン化しない）
- 置き換え対象
  - テーマ切替（Header.tsx）: ネイティブ `<select>` をアイコンボタン+ポップアップメニューに変更（`brightness_auto` / `light_mode` / `dark_mode`。`useMenuKeys` の流儀でキーボード操作可能に）。現在のモードをボタンのアイコンで示し、title に現在値を出す
  - エクスポート/インポート（ExportImport.tsx）: 位置はチケット一覧の現状のまま、テキストボタン「エクスポート/インポート ▾」を `more_vert`（縦三点）のアイコンボタンに置き換える（メニュー内容・検索条件連動・キーボード操作は不変）。ナビ用ハンバーガー（`menu`）はサイトナビ、`more_vert` はその場の操作メニュー、という使い分けにする
  - 一覧行の「編集 / 削除」テキストリンク（TagList.tsx / TemplateList.tsx / FileList.tsx、モバイルのカード表示含む）: `edit` / `delete`。削除は赤系のhover色 + ConfirmDialog（既存）を維持
  - チケット詳細（TicketDetail.tsx）の「履歴 / 編集」ボタン: `history` / `edit`（`title="ctrl+h"` / `"ctrl+e"` を維持）
  - ダイアログの閉じる「×」（Dialog.tsx 経由で全ダイアログ・ヘルプ共通）: `close`
  - 並び替えの「↓ 降順 / ↑ 昇順」ボタン（TicketList上部）: `arrow_downward` / `arrow_upward`
  - 「ファイルを添付」（AttachFileButton.tsx）: `attach_file` アイコン+テキスト併記（頻出だが初見性を優先しテキストは残す）
  - タグ一覧のドラッグハンドル（TagList.tsx）: `drag_indicator`
  - 保存済みビューメニュー内の削除（ViewSelect.tsx）: 行の削除と同じ `delete`
  - ハンバーガー開閉（「ヘッダー改善」タスクで導入）: `menu` / `close`
- 検証: `tools/capture-screens.mjs` を再実行し、ライト/ダーク両テーマでアイコンの色が文字色に追随していること、`?` ヘルプ含めキーボードだけで全操作が完結することを確認する
