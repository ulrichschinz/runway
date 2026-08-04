// ESLint flat configuration for the frontend unit.
//
// Deliberately modest to start, matching the backend's ruff selection: the point of the
// first lint pass is a gate that is green and enforced, not the largest rule set that
// can be switched on. Widening is a later, separately reviewable change.

import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      // An unused binding is either dead code or a typo. Allow a leading underscore for
      // the deliberate case.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    // Vite and Tailwind configuration files run in Node, not the browser.
    files: ['*.config.js', 'postcss.config.js', 'tailwind.config.js', 'vite.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
