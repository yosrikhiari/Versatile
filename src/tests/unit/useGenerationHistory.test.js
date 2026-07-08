import { describe, it, expect, vi } from 'vitest'

// Minimal Dexie-ish stub for db.generatedStories query chain.
const sortByResult = []
vi.mock('@/services/db-core', () => ({
  db: {
    generatedStories: {
      where: () => ({
        equals: () => ({
          reverse: () => ({
            sortBy: async () => sortByResult
          })
        })
      })
    }
  }
}))

import { useGenerationHistory } from '@/composables/useGenerationHistory'

describe('useGenerationHistory', () => {
  it('loadPreviousGenerations is a no-op without a project id', async () => {
    const h = useGenerationHistory(() => null, {})
    await h.loadPreviousGenerations()
    expect(h.previousGenerations.value).toEqual([])
  })

  it('loadPreviousGenerations fills from the store when a project id is present', async () => {
    sortByResult.length = 0
    sortByResult.push({ id: 1, title: 'Draft' })
    const h = useGenerationHistory(() => 7, {})
    await h.loadPreviousGenerations()
    expect(h.previousGenerations.value).toEqual([{ id: 1, title: 'Draft' }])
  })

  it('checkResumable resolves the run from the generator', async () => {
    const gen = { getResumableRun: vi.fn().mockResolvedValue({ written: 3, total: 10 }) }
    const h = useGenerationHistory(() => 7, gen)
    await h.checkResumable()
    expect(gen.getResumableRun).toHaveBeenCalledWith(7)
    expect(h.resumableRun.value).toEqual({ written: 3, total: 10 })
  })

  it('checkResumable clears the run without a project id', async () => {
    const gen = { getResumableRun: vi.fn() }
    const h = useGenerationHistory(() => null, gen)
    h.resumableRun.value = { written: 1, total: 2 }
    await h.checkResumable()
    expect(gen.getResumableRun).not.toHaveBeenCalled()
    expect(h.resumableRun.value).toBeNull()
  })

  it('checkResumable clears the run when the generator throws', async () => {
    const gen = { getResumableRun: vi.fn().mockRejectedValue(new Error('boom')) }
    const h = useGenerationHistory(() => 7, gen)
    await h.checkResumable()
    expect(h.resumableRun.value).toBeNull()
  })
})
