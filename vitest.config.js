import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/tests/**', 'src/main.js', 'node_modules/**']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
