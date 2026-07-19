# UIデザインシステム

biletojyのフロントエンドUIの設計ルール。Tailwind CSS（v4）のユーティリティクラスを直接使い、
独自コンポーネントライブラリやCSS変数は導入しない。ここに定義するクラスの組み合わせを「トークン」として扱う。

## 原則
* 装飾は最小限。罫線（`border`）と余白で構造を示し、色は意味のある箇所（アクション・状態・タグ）にだけ使う
* 色パレットは **neutral**（無彩色）と **blue**（アクション）を基本とし、状態色として red / amber を使う。
  `gray` / `slate` / `zinc` など他の無彩色系パレットは使わない
* 操作はキーボードでも完結できるようにする（ショートカット、`Enter`確定、`Esc`で閉じる、↑↓移動）
* モバイル（`sm`未満）ではテーブル風レイアウトをカード型に組み替える

## カラー
| 役割 | クラス |
| --- | --- |
| 本文テキスト | 既定色（black） |
| 補足・メタ情報（日時、作成者、ラベル） | `text-neutral-500` |
| さらに弱い補助（プレースホルダ的表示、閉じるアイコン） | `text-neutral-400`（hoverで `text-neutral-700`） |
| 罫線 | `border`（既定色 = `neutral-200` 相当） |
| プライマリアクション | `bg-blue-600 text-white hover:bg-blue-700` |
| リンク・テキストボタン | `text-blue-700 hover:underline` |
| 破壊的アクション（テキストボタン） | `text-red-600 hover:underline` |
| エラーメッセージ | `text-red-600` |
| 行ホバー | `hover:bg-neutral-100` |
| 淡い背景（フォームパネル、kbd） | `bg-neutral-50` |
| チップ・押下状態の背景 | `bg-neutral-100` / `bg-neutral-200` |
| 期限超過タグ | `bg-red-50 border-red-500 text-red-700` |
| 期限間近タグ（3日以内） | `bg-amber-50 border-amber-500 text-amber-800` |
| タグの個別色 | カタログの色から `backgroundColor: {color}20` + `borderColor: {color}` |

## ダークモード
ダークモードはOS設定（`prefers-color-scheme`）追随を基本とし、ヘッダーの「表示テーマ」セレクト
（自動 / ライト / ダーク。ネイティブ`select`なのでキーボードで操作できる）で明示的に切り替えられる。

* 選択は `localStorage` の `biletojy.theme`（`'light'` / `'dark'`。自動＝未設定）に保存する
* `html` 要素への `.dark` クラス付与で切り替える。Tailwind v4 の `@custom-variant dark` を
  `index.css` に定義しており、`dark:` バリアントがこのクラスに反応する
* 初期描画のちらつき（FOUC）を避けるため、初回のクラス付与は `index.html` のインラインスクリプトで行う。
  トグルとOS設定変更への追随は `src/lib/theme.ts` が担い、切り替え時に `biletojy:theme-changed`
  イベントを発火する（mermaidはこれを購読して `dark` / `default` テーマで再描画する）
* `:root` / `:root.dark` に `color-scheme` を指定し、ネイティブUI（日付ピッカー、`select`、
  スクロールバー等）の配色もテーマに合わせる

### トークン対応表
ダークモードの色は場当たりで選ばず、次の対応で light のトークンに `dark:` を併記する。

| light | dark |
| --- | --- |
| 本文テキスト（既定色） | `dark:text-neutral-100`（`body` に一括指定） |
| ページ背景 `bg-white` | `dark:bg-neutral-900`（`body` に一括指定） |
| 浮動面の `bg-white`（ドロップダウン・モーダル・ポップアップ） | `dark:bg-neutral-800` |
| ページ上のチップの `bg-white`（未選択グループチップ等） | `dark:bg-neutral-900` |
| `text-neutral-500` | `dark:text-neutral-400` |
| `text-neutral-600` | `dark:text-neutral-300` |
| `text-neutral-400` | そのまま（両テーマで可読） |
| `hover:text-neutral-700` | `dark:hover:text-neutral-200` |
| `text-neutral-300`（無効状態） | `dark:text-neutral-600` |
| 罫線 `border`（既定色） | `neutral-700` 相当（`index.css` で一括反転。個別指定は不要） |
| `border-neutral-300` | `dark:border-neutral-600`（`divide-neutral-200` は `dark:divide-neutral-700`） |
| 淡い背景 `bg-neutral-50`（kbd等） | `dark:bg-neutral-700`（浮動面の上に載るため） |
| チップ背景 `bg-neutral-100` | `dark:bg-neutral-700` |
| 押下状態 `bg-neutral-200` | `dark:bg-neutral-600` |
| 行ホバー `hover:bg-neutral-100` | 面の一段明るい色: ページ上は `dark:hover:bg-neutral-800`、浮動面上は `dark:hover:bg-neutral-700` |
| `hover:bg-neutral-50`（未選択チップ） | `dark:hover:bg-neutral-800` |
| リンク・テキストボタン `text-blue-700` | `dark:text-blue-400` |
| プライマリ `bg-blue-600 hover:bg-blue-700` | そのまま（十分なコントラスト） |
| 選択肢アクティブ `bg-blue-100` / 選択中 `bg-blue-50` | `dark:bg-blue-900` / `dark:bg-blue-950` |
| `text-red-600`（エラー・破壊的） | `dark:text-red-400`（`bg-red-600` ボタンはそのまま） |
| `bg-red-50 text-red-700`（期限超過・差分削除行） | `dark:bg-red-950 dark:text-red-300` |
| `bg-amber-50 text-amber-800`（期限間近） | `dark:bg-amber-950 dark:text-amber-300` |
| `bg-blue-50 text-blue-700`（差分追加行） | `dark:bg-blue-950 dark:text-blue-400` |
| オーバーレイ・backdrop `bg-black/30` | `dark:bg-black/60` |
| タグの個別色（`{color}20` 背景） | そのまま（半透明なので両テーマで成立する） |

## タイポグラフィ
| 役割 | クラス |
| --- | --- |
| サイトタイトル（h1） | `text-2xl` |
| ページタイトル（h2） | `text-xl` |
| セクション見出し（h3） | `text-lg` |
| 本文 | 既定サイズ |
| 補足・メタ情報・小型ボタン | `text-sm` |
| 最小（kbd、チップ内の記号） | `text-xs` |
| コード・markdown入力欄 | `font-mono text-sm` |

見出しに `font-bold` は付けない（サイズだけで階層を示す）。markdown表示（`.markdown-body`）内のみ例外として太字を使う。

## 角丸
| 対象 | クラス |
| --- | --- |
| ボタン・入力欄・パネル・ドロップダウン | `rounded-sm`（部分角丸も `rounded-l-sm` / `rounded-r-sm`） |
| タグチップ | `rounded-lg` |
| 円形アイコンボタン（フローティングヘルプ、ヘッダ・ツールバーのアイコンのみボタン） | `rounded-full` |

## 余白
* ページ全体: `main` の `p-2`
* セクション間: `mb-2`（小）/ `mb-4`（中）/ `mb-6`（大）
* パネル内: `p-2`〜`p-4`
* リスト行: `py-2`、テーブル風ヘッダ行: `py-1`

## コンポーネント
### ボタン
| 種類 | クラス |
| --- | --- |
| プライマリ（送信） | `bg-blue-600 text-white rounded-sm px-4 py-1 hover:bg-blue-700` |
| プライマリ小（ヘッダ等のアクション） | `bg-blue-600 text-white rounded-sm px-3 py-1 text-sm hover:bg-blue-700` |
| セカンダリ（キャンセル・編集） | `border rounded-sm px-4 py-1 hover:bg-neutral-100`（小型は `px-3` / `px-2 py-0.5 text-sm`） |
| 破壊的プライマリ（削除の確定） | `bg-red-600 text-white rounded-sm px-4 py-1 hover:bg-red-700` |
| テキストボタン | `text-blue-700 hover:underline`（破壊的操作は `text-red-600`） |
| 無効状態 | `disabled:opacity-50` |

ショートカットがあるアクションには `title="ctrl+n"` のようにキーを表示する。

### アイコン
アイコンは [Material Symbols](https://fonts.google.com/icons)（**Outlined / weight 400 / optical size 20 / grade 0 / fill 0** に固定。
スタイル軸の混在は禁止）を `front/public/icons/<name>.svg` として配置し、共通コンポーネント `components/Icon.tsx` で描画する。

* `<img src>` では文字色・ダークモード・hover の色変化が効かないため、**CSSマスク方式**で描く。
  `bg-current`（背景色 = `currentColor`）＋ `mask-image: url(/icons/<name>.svg)` でアイコン形状に切り抜くことで、
  文字色・`dark:`・`hover:` の色変化にアイコンが追随する。既定サイズは `size-5`（20px。optical 20 に一致）
* `name` は `IconName`（union 型）で縛り、存在しないアイコン名をコンパイルエラーにする。
  アイコン自体は装飾要素として `aria-hidden` を付け、`role` は付けない（意味はボタン側で与える）
* **アイコンのみのボタン**は `aria-label` と `title` を必須にし、モバイルのタップターゲットとして `p-2`（実質40px四方）を確保する。
  テキストを併記するボタン（「ファイルを添付」など）はこの限りではない。
  例外: ヘッダ・ツールバーの円形アイコンボタン（`rounded-full`）は周囲の行の高さに合わせるため、
  ヘッダは `p-1.5`、一覧の行の高さに揃える場合は `p-0.5` まで縮めてよい
* ショートカットのあるボタンは `title` にキー（`ctrl+h` 等）を出し、意味は `aria-label` で与える
* 一覧行のアイコンアクション（編集・削除）は既定 `text-neutral-500`、hover で 編集=`text-blue-700` / 削除=`text-red-600`
  （破壊的操作は赤）とし、色を hover で示して行の視覚ノイズを抑える
* 並び替えハンドル（`drag_indicator`）など密なリスト内の補助操作は、キーボード代替（↑↓）がある前提でコンパクトに置いてよい（`p-2` は不要）

### 入力欄
* テキスト入力: `border rounded-sm px-2 py-1`
* テキストエリア: `border rounded-sm w-full p-2`（markdownは `font-mono text-sm`）
* バリデーションエラー時: `border-red-500` を付け、フォーム上部に `text-red-600` のメッセージを表示してフォーカスを移す
* 候補提示はネイティブの `datalist` を使う

### タグチップ
* 基本形: `inline-flex items-center rounded-lg border py-0.5 px-2 whitespace-nowrap`
* チップ自体に外側の margin は付けない。チップ間の間隔は親コンテナの `flex flex-wrap gap-1` で取る
  （margin だと `items-center` の行内でチップが margin 分だけ中心からズレるため）
* グループ付きは `group | name` の2区画（区切りは `border-r border-neutral-300`、グループ名は `text-sm opacity-70`）
* 削除可能なチップは末尾に `×`（`text-neutral-400 hover:text-neutral-700`）
* 未選択のグループチップ: `bg-white border-dashed border-neutral-300 text-neutral-500 hover:bg-neutral-50`

### リスト（テーブル風）
* ヘッダ行: `flex text-neutral-500 border-b`（`py-1`）
* データ行: `border-b hover:bg-neutral-100`、行全体をクリック/リンク対象にする
* モバイルでは `hidden sm:flex` / `sm:` プレフィックスでカード型に組み替える
* 空状態・読み込み中: `text-neutral-500 p-4`。空状態には次のアクションへの導線（リンク）を添える

### ドロップダウン
* `absolute z-10 ... bg-white border rounded-sm shadow-md`
* 選択肢: アクティブ `bg-blue-100`、選択中 `bg-blue-50`、hover `hover:bg-neutral-100`
* `role="listbox"` / `role="option"` と `aria-*` を付与し、↑↓・Enter・Escで操作できるようにする

### モーダル
* `<dialog>` 要素 + `showModal()` を使う（共通コンポーネント `components/Dialog.tsx`）
* 本体: `bg-white rounded-sm shadow-lg p-4`、背景: `backdrop:bg-black/30`
* Esc・背景クリックで閉じる（`<dialog>` はtop-layerに表示されるためz-index指定は不要）

### 区切り
* 大きなセクションの区切り（本文とコメントの間など）: `<hr className="border-t-2 border-neutral-300" />`
* 同種アイテムの区切り: `divide-y divide-neutral-200` または各行の `border-b`

## z-index
| 値 | 用途 |
| --- | --- |
| `z-10` | ドロップダウン |
| `z-20` | フローティングボタン（モーダルは `<dialog>` のtop-layer表示のため不要） |
