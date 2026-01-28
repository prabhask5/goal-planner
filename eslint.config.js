import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    },
    rules: {
      // Svelte 5 uses let for $props() destructuring by convention
      'prefer-const': 'off'
    }
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      'prefer-const': 'error'
    }
  },
  {
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // General - allow console.log for debugging, only flag in production builds
      'no-console': 'off',
      'no-var': 'error',

      // Svelte - relax some rules for flexibility
      'svelte/no-at-html-tags': 'warn',
      'svelte/valid-compile': ['error', { ignoreWarnings: true }],
      'svelte/require-each-key': 'warn',
      'svelte/no-navigation-without-resolve': 'off',  // Too strict for app navigation patterns
      'svelte/prefer-svelte-reactivity': 'off',  // SvelteDate/SvelteSet/SvelteMap not always needed
      'svelte/no-unused-svelte-ignore': 'warn'  // Downgrade to warning
    }
  },
  {
    ignores: [
      '.svelte-kit/**',
      'build/**',
      'dist/**',
      'node_modules/**',
      'static/**',
      '*.config.js',
      '*.config.ts'
    ]
  }
];
