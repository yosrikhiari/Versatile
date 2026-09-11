import { describe, it, expect } from 'vitest'
import { computeWordDiff, collapseSegments, MAX_DIFF_WORDS } from '@/utils/wordDiff'

describe('computeWordDiff', () => {
  it('returns one unchanged segment for identical texts', () => {
    expect(computeWordDiff('Hello brave world', 'Hello brave world')).toEqual([
      { value: 'Hello brave world' }
    ])
  })

  it('marks a swapped word as remove+add', () => {
    const out = computeWordDiff('the quick fox', 'the slow fox')
    expect(out).toEqual([
      { value: 'the ' },
      { value: 'quick', removed: true },
      { value: 'slow', added: true },
      { value: ' fox' }
    ])
  })

  it('marks fully new text as added', () => {
    expect(computeWordDiff('', 'brand new')).toEqual([{ value: 'brand new', added: true }])
  })

  it('strips HTML before diffing', () => {
    const out = computeWordDiff('<p>Hello <b>world</b></p>', 'Hello world!')
    expect(JSON.stringify(out)).not.toContain('<')
  })

  it('keeps contraction changes legible (fragments stay adjacent)', () => {
    // jsdiff tokenizes at apostrophes in every major version (verified on
    // v3 and v9): "doesn't" diffs as "doesn" + "'t". The fragments render
    // adjacently inline, so the change still reads correctly — pin that
    // instead of whole-word intactness.
    const out = computeWordDiff("Kael doesn't move", "Kael can't move")
    const removed = out
      .filter((s) => s.removed)
      .map((s) => s.value)
      .join('')
    const added = out
      .filter((s) => s.added)
      .map((s) => s.value)
      .join('')
    expect(removed).toBe('doesn')
    expect(added).toBe('can')
    expect(out[0]).toEqual({ value: 'Kael ' })
    expect(out[out.length - 1]).toEqual({ value: "'t move" })
  })

  it('refuses over-cap input with a documented fallback', () => {
    expect(MAX_DIFF_WORDS).toBe(4000)
    const big = Array(5000).fill('word').join(' ')
    expect(() => computeWordDiff(big, big + ' extra')).toThrow(/too long/i)
  })
})

describe('collapseSegments', () => {
  it('collapses long unchanged runs keeping edge context', () => {
    const words = Array(100).fill('w')
    const segs = [{ value: words.join(' ') }]
    // Head/tail keep contextWords/2 words each: [head, marker, tail].
    const out = collapseSegments(segs, 10)
    expect(out).toHaveLength(3)
    expect(out[1]).toMatchObject({ collapsed: true, count: 90 })
  })

  it('leaves short runs untouched', () => {
    const segs = [{ value: 'a b c' }]
    expect(collapseSegments(segs, 10)).toEqual(segs)
  })
})
