import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// getSectionContext must report the budget it enforces: the selector UI
// renders `chars/budget`, and a missing key displays as "undefined".
// Every return path — including empty-manuscript early exits — carries it.

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useManuscriptContext budget reporting', () => {
  it('reports the enforced budget even with no sections loaded', async () => {
    const { useManuscriptContext } = await import('@/composables/useManuscriptContext')
    const { getSectionContext } = useManuscriptContext()
    const result = await getSectionContext('current', 'spark')
    expect(result.totalChars).toBe(0)
    expect(result.budgetChars).toEqual(expect.any(Number))
    expect(result.budgetChars).toBeGreaterThan(0)
  })
})
