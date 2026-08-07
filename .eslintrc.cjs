module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true
  },
  extends: ['plugin:vue/vue3-recommended', 'prettier', 'plugin:storybook/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    // Let vue-eslint-parser delegate `<script lang="ts">` blocks to the TS parser
    // while keeping plain-JS `<script>` on the default parser (M-6.3).
    parser: {
      ts: '@typescript-eslint/parser',
      '<template>': 'espree'
    }
  },
  rules: {
    'vue/multi-word-component-names': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
  },
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.cjs'],
  overrides: [
    {
      // `no-undef` is off everywhere else: the base config does not extend
      // eslint:recommended, and on `.ts` it only produces noise because tsc
      // already checks this and understands DOM/lib types eslint cannot see.
      //
      // Vue SFCs had neither guard. A composable used without its import is a
      // clean parse and a clean lint, and only fails as a ReferenceError when
      // the component mounts — which is how `useVolumeStore` shipped into
      // StoryNetwork and `computed` into ModeButton.
      files: ['**/*.vue'],
      rules: { 'no-undef': 'error' }
    },
    {
      // TypeScript sources: parse with @typescript-eslint so `.ts` files lint
      // instead of hard-erroring on `interface` / type annotations (M-6.3).
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-unused-vars': 'off'
      }
    },
    {
      files: ['src/services/**/*.{js,ts}'],
      rules: {
        'no-restricted-imports': [
          'warn',
          {
            patterns: [
              {
                group: [
                  '../stores',
                  '../stores/*',
                  '../../stores/*',
                  '../../../stores/*',
                  '@/stores/*'
                ],
                message:
                  'Services must not import from stores. Inject dependencies or pass data as parameters.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['src/stores/**/*.{js,ts}'],
      rules: {
        'no-restricted-imports': [
          'warn',
          {
            patterns: [
              {
                group: ['../composables/*', '../../composables/*', '@/composables/*'],
                message:
                  'Stores must not import from composables. Extract shared logic into services or utils.'
              }
            ]
          }
        ]
      }
    }
  ]
}
