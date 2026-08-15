import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Derived rather than assumed: a bare `__dirname` only exists under the CJS-ish
// config loader, and Vite's native ESM loader — already warning, and slated to
// become the default — does not provide one. Same derivation vite.config.js uses.
const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/tests/**/*.test.{js,ts,jsx,tsx}'],
    // Several suites call `vi.resetModules()` in `beforeEach` and re-import a
    // multi-thousand-line module for every test. That is legitimately slow, and
    // against the 10s default it failed intermittently on whichever test the
    // machine happened to be busy during — a red suite that moved around and
    // pointed at innocent tests. Bounding the hook generously keeps a genuine
    // hang detectable without making load look like a bug.
    hookTimeout: 60_000,
    // Same reasoning for the tests themselves: the heavy suites re-import their
    // module under test per case, so a loaded machine pushes individual tests
    // past the 5s default. Every one of these suites is CPU-bound and offline —
    // none of them wait on a network — so a generous bound cannot mask a hang
    // that matters, it only stops load from being reported as failure.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/tests/**', 'src/main.js', 'node_modules/**'],
      // Set at the measured baseline, not at an aspiration: the point is to stop
      // coverage sliding backwards unnoticed. CI ran `test:coverage` and threw
      // the number away, so a change that deleted tests reported green. Raise
      // these deliberately; do not lower them to make a red run pass.
      //
      // Baselined against vitest 4's v8 provider, which does AST-aware branch
      // remapping and so reports far lower branch coverage than vitest 1 did
      // (79% → 32%) for exactly the same tests. That was a measurement change,
      // not a regression — do not read the old numbers as a target.
      thresholds: {
        statements: 38,
        branches: 30,
        functions: 31,
        lines: 38
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
