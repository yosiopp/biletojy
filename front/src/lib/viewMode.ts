// チケット一覧の表示モード。URLの view パラメータで保持する（リストは省略してパラメータ無し）。
// 表示対象（ツリーのルート階層タグ等）は by パラメータで指定する。
// 保存済み検索条件の「ビュー」（ViewSelect / lib/views.ts）とは別概念なので、UI上は「表示モード」と呼ぶ
import { t } from '../i18n';

export type ViewMode = 'list' | 'tree' | 'board';

export const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'list', label: t('viewMode.list') },
  { value: 'tree', label: t('viewMode.tree') },
  { value: 'board', label: t('viewMode.board') },
];

// URLや保存済みビューの view 値を解釈する。未知の値はリスト扱い
export function parseViewMode(raw: string | null | undefined): ViewMode {
  return VIEW_MODES.some((m) => m.value === raw) ? (raw as ViewMode) : 'list';
}

export function viewModeLabel(mode: ViewMode): string {
  return VIEW_MODES.find((m) => m.value === mode)?.label ?? mode;
}
