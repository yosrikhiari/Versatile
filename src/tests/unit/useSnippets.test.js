import { describe, it, expect, vi } from 'vitest'

vi.mock('vue', () => ({
  ref: (v) => ({ value: v }),
  computed: (fn) => ({ value: fn() })
}))

describe('useSnippets', () => {
  async function create(snippetsArray) {
    const mod = await import('../../composables/useSnippets')
    return mod.useSnippets({ value: snippetsArray })
  }

  it('sorts snippets by count descending', async () => {
    const { sortedSnippets } = await create([
      { text: 'a', count: 3 },
      { text: 'b', count: 10 },
      { text: 'c', count: 1 }
    ])
    expect(sortedSnippets.value[0].text).toBe('b')
    expect(sortedSnippets.value[1].text).toBe('a')
    expect(sortedSnippets.value[2].text).toBe('c')
  })

  it('getTopSnippets returns limited items', async () => {
    const { getTopSnippets } = await create([
      { text: 'a', count: 5 }, { text: 'b', count: 4 }, { text: 'c', count: 3 }
    ])
    expect(getTopSnippets(2)).toHaveLength(2)
    expect(getTopSnippets(2)[0].text).toBe('a')
  })

  it('hasSnippets returns true when there are snippets', async () => {
    const { hasSnippets } = await create([{ text: 'a', count: 1 }])
    expect(hasSnippets()).toBe(true)
  })

  it('hasSnippets returns false when empty', async () => {
    const { hasSnippets } = await create([])
    expect(hasSnippets()).toBe(false)
  })
})
