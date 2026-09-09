import { describe, it, expect } from 'vitest'
import { buildSceneEntitiesBlob } from '@/composables/generation/context/sceneContext'

// Plot-thread scoping on the director's per-scene `threadIds`: threads the
// scene advances ride full, the rest collapse to a name-only index — the
// same convention the cast already follows. The audit's acceptance is the
// last test: prompt size stays flat as the bible grows.

const thread = (id, title) => ({
  id,
  title,
  status: 'active',
  notes: 'A very long thread note '.repeat(20),
  traits: ['tense']
})
const bible = (n) => Array.from({ length: n }, (_, i) => thread(`t${i + 1}`, `Thread ${i + 1}`))
const scene = (over = {}) => ({
  charactersPresent: ['Kael'],
  location: 'Harbor',
  threadIds: ['t1'],
  ...over
})
const chars = [{ name: 'Kael', role: 'protagonist', description: 'd', traits: [] }]

describe('buildSceneEntitiesBlob plot-thread scoping', () => {
  it('sends the scene’s threads full and the rest name-only', () => {
    const blob = JSON.parse(
      buildSceneEntitiesBlob(scene(), { characters: chars, locations: [], plotThreads: bible(3) })
    )
    expect(blob.threadsInScene).toHaveLength(1)
    expect(blob.threadsInScene[0].title).toBe('Thread 1')
    expect(blob.threadsInScene[0].notes).toContain('very long')
    expect(blob.otherThreads).toEqual([{ title: 'Thread 2' }, { title: 'Thread 3' }])
    expect(blob.plotThreads).toBeUndefined()
  })

  it('sends every thread whole when the scene names none (no signal to scope on)', () => {
    const blob = JSON.parse(
      buildSceneEntitiesBlob(scene({ threadIds: [] }), {
        characters: chars,
        locations: [],
        plotThreads: bible(2)
      })
    )
    expect(blob.plotThreads).toHaveLength(2)
    expect(blob.threadsInScene).toBeUndefined()
  })

  it('ignores thread ids that match no known thread', () => {
    const blob = JSON.parse(
      buildSceneEntitiesBlob(scene({ threadIds: ['tx'] }), {
        characters: chars,
        locations: [],
        plotThreads: bible(2)
      })
    )
    expect(blob.threadsInScene).toEqual([])
    expect(blob.otherThreads).toEqual([{ title: 'Thread 1' }, { title: 'Thread 2' }])
  })

  it('keeps prompt size flat as the thread bible grows', () => {
    const sizes = [3, 30, 300].map(
      (n) =>
        buildSceneEntitiesBlob(scene(), { characters: chars, locations: [], plotThreads: bible(n) })
          .length
    )
    // The index grows ~21 chars per extra thread (a title entry); a full
    // dump would add ~550. Marginal cost must scale like the index, and
    // the 300-thread blob must stay an order of magnitude under a dump.
    const marginal = (a, b, na, nb) => (b - a) / (nb - na)
    expect(marginal(sizes[1], sizes[2], 30, 300)).toBeLessThan(
      marginal(sizes[0], sizes[1], 3, 30) * 1.5
    )
    expect(sizes[2]).toBeLessThan(15000)
  })
})
