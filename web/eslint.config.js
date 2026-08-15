import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Lint rules for the frontend.
 *
 * Deliberately close to the recommended sets rather than a house style: the value here is the
 * rules that catch real mistakes - above all `react-hooks/exhaustive-deps`, which is what the
 * `eslint-disable` comments scattered through this codebase were written against. A suppression
 * that no linter ever evaluates documents a decision nobody is checking.
 *
 * Formatting is deliberately NOT enforced here; there is no Prettier config and no reformatting
 * pass, so a contributor's diff stays about what they changed.
 */
export default tseslint.config(
  { ignores: ['dist', 'public', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Unused arguments prefixed with _ are a deliberate signature, not an oversight.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The widget registry is genuinely heterogeneous; `any` there is contained and documented.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: { globals: globals.node },
  }
)
