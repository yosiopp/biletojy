# 実施予定のタスク一覧
実施したタスクは tasks.md から削除した上でコミットしてください。
コミット単位はタスクごとにしてください。

## デザインシステムから外れているUIを修正する
[デザインシステム](docs/design-system.md) の定義時に見つかった逸脱を修正してください。

* 無彩色パレットは neutral に統一する（`gray` / `slate` は使わない）
  * `front/src/pages/TicketList.tsx` — 一覧ヘッダ行の `text-gray-500` → `text-neutral-500`
  * `front/src/pages/TagList.tsx` — 一覧ヘッダ行の `text-gray-500` → `text-neutral-500`
  * `front/src/components/TicketRow.tsx` — 行ホバーの `hover:bg-slate-100` → `hover:bg-neutral-100`
  * `front/src/pages/TagList.tsx` — 行ホバーの `hover:bg-slate-50` → `hover:bg-neutral-100`（強さも行ホバーの規定に合わせる）
* 角丸は `rounded-sm` スケールに統一する
  * `front/src/pages/TicketForm.tsx` — 編集/プレビュー切り替えボタンの `rounded-l` / `rounded-r` → `rounded-l-sm` / `rounded-r-sm`
