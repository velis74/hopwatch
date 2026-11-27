import velis from 'eslint-config-velis';

export default [
  ...velis,
  {
    ignores: ['.venv/*', 'dist/*', 'coverage/*', 'node_modules/*', 'docs/.vitepress/cache/*', 'docs/.vitepress/dist/*'],
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
];
