// チケット編集フォームの表示モード。編集 / 両方（左右分割）/ プレビューの3状態。
// localStorage の biletojy.editorMode に保存し、次回の作成・編集時に前回のモードを復元する。
export type EditorMode = 'edit' | 'split' | 'preview';

const KEY = 'biletojy.editorMode';

export const EDITOR_MODES: { value: EditorMode; label: string }[] = [
  { value: 'edit', label: '編集' },
  // 「両方」は左右分割。モバイル（sm未満）ではボタンを隠す
  { value: 'split', label: '両方' },
  { value: 'preview', label: 'プレビュー' },
];

// 保存値を解釈する。未知の値は 'edit' 扱い（lib/viewMode.ts の parseViewMode と同じ流儀）
export function parseEditorMode(raw: string | null | undefined): EditorMode {
  return EDITOR_MODES.some((m) => m.value === raw) ? (raw as EditorMode) : 'edit';
}

export function loadEditorMode(): EditorMode {
  return parseEditorMode(localStorage.getItem(KEY));
}

export function saveEditorMode(mode: EditorMode) {
  localStorage.setItem(KEY, mode);
}
