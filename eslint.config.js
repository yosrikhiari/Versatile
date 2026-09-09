import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import prettierConfig from 'eslint-config-prettier'
import storybook from 'eslint-plugin-storybook'
import globals from 'globals'

// Flat config (ESLint 10 dropped eslintrc). Mirrors .eslintrc.cjs rule-for-rule:
// base globals + rules, vue recommended, prettier, storybook, then the
// per-group overrides below. A final prettier pass keeps formatting rules off
// everywhere, including inside the TS and stories blocks.
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.cjs',
      'eslint.config.js'
    ]
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.es2021 }
    }
  },
  ...pluginVue.configs['flat/recommended'],
  prettierConfig,
  ...storybook.configs['flat/recommended'],
  {
    // Project rules last: flat configs apply in array order, so this wins
    // over the plugin sets above (under eslintrc the base rules won by
    // position too — extends first, rules after).
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
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
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        // Let vue-eslint-parser delegate `<script lang="ts">` blocks to the
        // TS parser while keeping plain-JS `<script>` on the default parser.
        parser: { ts: tsParser },
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    rules: { 'no-undef': 'error' }
  },
  {
    // TypeScript sources: parse with @typescript-eslint so `.ts` files lint
    // instead of hard-erroring on `interface` / type annotations.
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // v8 dropped a few renamed rules from the recommended set while the
      // set still references them; keep only rules the plugin registers.
      ...Object.fromEntries(
        Object.entries(tsPlugin.configs?.recommended?.rules ?? {}).filter(([name]) =>
          Boolean(tsPlugin.rules?.[name.replace(/^@typescript-eslint\//, '')])
        )
      ),
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
  },
  prettierConfig
]
