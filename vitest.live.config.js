import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Live runs: the real generation pipeline against a local Ollama, headless.
 *
 *   npx vitest run --config vitest.live.config.js
 *
 * These are not tests — they are hours-long runs that write their output under
 * `reports/live/`. Standalone rather than merged with vitest.config.js because
 * `mergeConfig` concatenates `include`, which would pull the whole unit suite
 * into every run. One file at a time: there is one GPU.
 */
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/tests/live/**/*.live.js'],
    testTimeout: 8 * 60 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
    fileParallelism: false,
    maxWorkers: 1
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') }
  }
})
