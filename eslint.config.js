import velis from 'eslint-config-velis';

export default [
  ...velis,
  {
    ignores: [
      '.venv/*',
      'dist/*',
      'coverage/*',
      'node_modules/*',
      'docs/.vitepress/cache/*',
      'docs/.vitepress/dist/*',
      'app/dist/*',
      'test-results/*',
      'playwright-report/*',
    ],
  },
  {
    // Node scripts.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    files: ['docs/.vitepress/config.ts'],
    languageOptions: { parserOptions: { project: './docs/.vitepress/tsconfig.json' } },
  },
  {
    files: ['app/**/*.{ts,vue}'],
    languageOptions: { parserOptions: { project: './app/tsconfig.json' } },
    settings: { 'import-x/resolver': { typescript: { project: './app/tsconfig.json' } } },
  },
  {
    files: ['e2e/**/*.ts'],
    languageOptions: { parserOptions: { project: './e2e/tsconfig.json' } },
    settings: { 'import-x/resolver': { typescript: { project: './e2e/tsconfig.json' } } },
  },
];
