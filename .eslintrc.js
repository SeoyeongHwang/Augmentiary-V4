// .eslintrc.js
module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: __dirname,
      sourceType: 'module',
    },
    plugins: ['@typescript-eslint'],
    extends: [
      'next/core-web-vitals',
      'plugin:@typescript-eslint/recommended',
    ],
  }
  