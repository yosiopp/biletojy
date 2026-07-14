import { en } from './en';
import { ja } from './ja';

// UI表示言語の決定と文言取得 t() を提供する自前の軽量i18n。
// 言語切替はlocalStorageへ保存してlocation.reload()する方式のため、t()はただの同期関数となり、
// React外のモジュール（lib/viewMode.ts のラベル定数など）からもそのまま呼べる（Context/Providerは使わない）
export type Lang = 'en' | 'ja';
export type MessageKey = keyof typeof ja;

const KEY = 'biletojy.lang';

// 保存済みの言語設定。未設定・不正値は null（= ブラウザ設定から自動判定）
export function loadLangSetting(): Lang | null {
  const value = localStorage.getItem(KEY);
  return value === 'en' || value === 'ja' ? value : null;
}

// 言語切替。保存してリロードすることで全文言を切り替える。null は設定削除（自動判定に戻す）
export function setLangSetting(next: Lang | null) {
  if (next == null) {
    localStorage.removeItem(KEY);
  } else {
    localStorage.setItem(KEY, next);
  }
  location.reload();
}

// 優先順位: localStorage > navigator.languages を先頭から走査して ja* にマッチしたら ja > フォールバック en
function detectLang(): Lang {
  const saved = loadLangSetting();
  if (saved) return saved;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((l) => l?.toLowerCase().startsWith('ja')) ? 'ja' : 'en';
}

export const lang: Lang = detectLang();

// index.html の lang="en" 固定を実際の表示言語で上書きする
document.documentElement.lang = lang;

const dict: Record<MessageKey, string> = lang === 'ja' ? ja : en;

// 文言の取得。params を渡すと値中の {name} プレースホルダを置換する
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let text: string = dict[key];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
