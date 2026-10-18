import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', '.data/', '.generated/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
  },
  {
    files: ['vite.config.js', 'playwright.config.js', 'eslint.config.js', 'api/**/*.js', 'scripts/**/*.js', 'src/server/**/*.js', 'tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
