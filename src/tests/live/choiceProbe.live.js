/**
 * Live smoke test: the judge's choice probabilities through the app's own path
 * (aiChoiceProbabilities -> ollama.choiceProbabilities, §33). Run after an
 * Ollama upgrade: the continuity confirmers depend on `logprobs`, and when it
 * cannot be read they silently count as "no".
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/choiceProbe.live.js
 */
import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { STORAGE_KEYS } from '@/config/storageKeys'

it('reads choice probabilities through the app path', async () => {
  setActivePinia(createPinia())
  const HOST = 'http://localhost:11434'
  localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
  localStorage.setItem(
    STORAGE_KEYS.SETTINGS,
    JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: 'qwen3:8b' })
  )
  const { setRolePlacement } = await import('@/config/roles')
  setRolePlacement('critic', { model: 'qwen3:8b', device: 'gpu', numCtx: 8192, keepAlive: '30m' })
  const { aiChoiceProbabilities } = await import('@/composables/useAiService')
  const t0 = Date.now()
  const p = await Promise.race([
    aiChoiceProbabilities(
      'Is fire hot?\nA) yes\nB) no\n\nAnswer with one letter only.',
      'Answer.',
      ['A', 'B'],
      { role: 'critic' }
    ),
    new Promise((r) => setTimeout(() => r('TIMEOUT'), 90000))
  ])
  expect(p).not.toBe('TIMEOUT')
  expect(p).not.toBeNull()
  expect(p.A).toBeGreaterThan(0.9)
  expect(Date.now() - t0).toBeLessThan(90000)
}, 120000)
