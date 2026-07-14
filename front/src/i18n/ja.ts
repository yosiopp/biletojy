// 正とする辞書。キーは「ページ/機能.意味」で構造化する。
// 値の {name} 形式のプレースホルダは t() の params で置換される
export const ja = {
  // ヘッダー: 言語切替
  'header.language': '言語',
  'header.languageTitle': '言語: {label}（自動はブラウザ設定に追随）',
  'header.langAuto': '自動',
} as const;
