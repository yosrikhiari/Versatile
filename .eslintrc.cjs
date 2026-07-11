module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true
  },
  extends: ['plugin:vue/vue3-recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'vue/multi-word-component-names': 'off',
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
  },
  ignorePatterns: ['dist', 'node_modules', '*.config.js', '*.config.cjs'],
  overrides: [
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
