import { ja } from './ja';

// 英語辞書。Record<keyof typeof ja, string> の型により ja.ts とのキーの過不足をコンパイルエラーで検出する。
// TODO: 現状は ja の値をそのまま流用している（フェーズ3で英訳のリテラルに置き換える）
export const en: Record<keyof typeof ja, string> = { ...ja };
