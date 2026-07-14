import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
    },
    rules: {
      // JSX内の生の日本語リテラル（ひらがな・カタカナ・漢字）を禁止する。
      // UI文言は i18n 辞書（ja.ts / en.ts）へキーを追加し t('key') で参照する。
      // JSXノードのみを対象にするため、ja.ts など .ts の辞書・データ定義には影響しない
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[぀-ヿ一-鿿]/]',
          message: 'JSXに日本語を直接書かず、i18n辞書（ja.ts / en.ts）へキーを追加して t() で参照してください',
        },
        {
          selector: 'JSXAttribute > Literal[value=/[぀-ヿ一-鿿]/]',
          message: 'JSX属性に日本語を直接書かず、i18n辞書（ja.ts / en.ts）へキーを追加して t() で参照してください',
        },
        {
          selector: 'JSXExpressionContainer Literal[value=/[぀-ヿ一-鿿]/]',
          message: 'JSX式に日本語リテラルを直接書かず、i18n辞書（ja.ts / en.ts）へキーを追加して t() で参照してください',
        },
        {
          selector: 'JSXExpressionContainer TemplateElement[value.cooked=/[぀-ヿ一-鿿]/]',
          message:
            'JSX式のテンプレートリテラルに日本語を直接書かず、i18n辞書（ja.ts / en.ts）へキーを追加して t() で参照してください',
        },
      ],
    },
  },
)
