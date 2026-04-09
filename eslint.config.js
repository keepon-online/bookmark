import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const sharedGlobals = {
  AbortController: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  chrome: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  Response: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  TextDecoder: 'readonly',
  window: 'readonly',
  defineBackground: 'readonly',
};

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.output/**',
      '.wxt/**',
      '.omx/**',
      'coverage/**',
      'src/test/**/*.js',
      'test_message.js',
    ],
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{ts,tsx}'],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: sharedGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
