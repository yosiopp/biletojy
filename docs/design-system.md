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
| さらに弱い補助（プレースホルダ的表示、閉じる×） | `text-neutral-400`（hoverで `text-neutral-700`） |
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
| フローティングヘルプボタン | `rounded-full`（唯一の例外） |

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
| テキストボタン | `text-blue-700 hover:underline`（破壊的操作は `text-red-600`） |
| 無効状態 | `disabled:opacity-50` |

ショートカットがあるアクションには `title="ctrl+n"` のようにキーを表示する。

### 入力欄
* テキスト入力: `border rounded-sm px-2 py-1`
* テキストエリア: `border rounded-sm w-full p-2`（markdownは `font-mono text-sm`）
* バリデーションエラー時: `border-red-500` を付け、フォーム上部に `text-red-600` のメッセージを表示してフォーカスを移す
* 候補提示はネイティブの `datalist` を使う

### タグチップ
* 基本形: `inline-flex items-center rounded-lg border py-0.5 px-2 mr-1 mb-1 whitespace-nowrap`
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
* オーバーレイ: `fixed inset-0 z-20 bg-black/30 flex items-center justify-center`（クリックで閉じる）
* 本体: `bg-white rounded-sm shadow-lg p-4` + `role="dialog"`、Escで閉じる

### 区切り
* 大きなセクションの区切り（本文とコメントの間など）: `<hr className="border-t-2 border-neutral-300" />`
* 同種アイテムの区切り: `divide-y divide-neutral-200` または各行の `border-b`

## z-index
| 値 | 用途 |
| --- | --- |
| `z-10` | ドロップダウン |
| `z-20` | モーダルオーバーレイ・フローティングボタン |
