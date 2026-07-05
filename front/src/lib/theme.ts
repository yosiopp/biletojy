// 表示テーマ（ライト/ダーク）の管理。
// localStorageのbiletojy.themeに 'light' | 'dark' を保存し、未設定はOS設定（prefers-color-scheme）に追随する。
// html要素の .dark クラスで切り替える（Tailwindのdarkバリアント。index.cssの@custom-variant参照）。
// 初期描画のちらつきを避けるため、初回のクラス付与はindex.htmlのインラインスクリプトでも同じ判定を行う
export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'biletojy.theme';

// テーマの切り替え時に発火するイベント（mermaidの再描画などが購読する）
export const THEME_CHANGED_EVENT = 'biletojy:theme-changed';

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function loadThemeMode(): ThemeMode {
  const value = localStorage.getItem(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

// 現在ダークテーマで表示中か（systemモードの解決結果を含む）
export function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}

export function setThemeMode(mode: ThemeMode) {
  if (mode === 'system') {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, mode);
  }
  applyTheme(mode);
}

// systemモードの間はOS設定の変更に追随する
media.addEventListener('change', () => {
  if (loadThemeMode() === 'system') applyTheme('system');
});
