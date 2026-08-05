import { describe, it, expect, beforeEach } from 'vitest'

let sanitizeJson, normalizeName, mergeTraits, mergeNotes
let castTargetsFor, castGap, summarizeArc
beforeEach(async () => {
  const mod = await import('@/composables/useEntityBootstrapper')
  sanitizeJson = mod.sanitizeJson
  normalizeName = mod.normalizeName
  mergeTraits = mod.mergeTraits
  mergeNotes = mod.mergeNotes
  castTargetsFor = mod.castTargetsFor
  castGap = mod.castGap
  summarizeArc = mod.summarizeArc
})

describe('sanitizeJson', () => {
  it('parses plain valid JSON', () => {
    const result = sanitizeJson('{"a":1}')
    expect(result).toEqual({ a: 1 })
  })

  it('returns null for empty input', () => {
    expect(sanitizeJson('')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(sanitizeJson(null)).toBeNull()
    expect(sanitizeJson(undefined)).toBeNull()
  })

  it('strips markdown JSON fences', () => {
    const input = '```json\n{"key": "value"}\n```'
    expect(sanitizeJson(input)).toEqual({ key: 'value' })
  })

  it('strips plain code fences', () => {
    const input = '```\n{"key": "value"}\n```'
    expect(sanitizeJson(input)).toEqual({ key: 'value' })
  })

  it('extracts JSON object from surrounding text', () => {
    const input = 'Here is the result: {"a": 1, "b": 2}. Done.'
    expect(sanitizeJson(input)).toEqual({ a: 1, b: 2 })
  })

  it('returns null for invalid JSON', () => {
    const input = 'not json at all'
    expect(sanitizeJson(input)).toBeNull()
  })

  it('trims whitespace before parsing', () => {
    expect(sanitizeJson('  {"x":1}  ')).toEqual({ x: 1 })
  })
})

describe('normalizeName', () => {
  it('trims and lowercases', () => {
    expect(normalizeName('  Alice  ')).toBe('alice')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeName('')).toBe('')
  })

  it('handles undefined', () => {
    expect(normalizeName(undefined)).toBe('')
  })
})

describe('mergeTraits', () => {
  it('merges unique traits from both arrays', () => {
    expect(mergeTraits(['brave', 'kind'], ['kind', 'wise'])).toEqual(['brave', 'kind', 'wise'])
  })

  it('returns existing traits when new traits is empty', () => {
    expect(mergeTraits(['brave'], [])).toEqual(['brave'])
  })

  it('handles undefined traits', () => {
    expect(mergeTraits(undefined, ['brave'])).toEqual(['brave'])
    expect(mergeTraits(['brave'], undefined)).toEqual(['brave'])
    expect(mergeTraits(undefined, undefined)).toEqual([])
  })
})

describe('mergeNotes', () => {
  it('appends new notes to existing', () => {
    const result = mergeNotes('Original notes.', 'Additional context')
    expect(result).toBe('Original notes. Additional context')
  })

  it('returns existing notes when new is empty', () => {
    expect(mergeNotes('Original', '')).toBe('Original')
  })

  it('returns new notes when existing is empty', () => {
    expect(mergeNotes('', 'New notes')).toBe('New notes')
  })

  it('returns existing if new is already contained', () => {
    const result = mergeNotes('Long original text here.', 'Long original')
    expect(result).toBe('Long original text here.')
  })

  it('handles both undefined', () => {
    expect(mergeNotes(undefined, undefined)).toBe('')
  })
})

describe('castTargetsFor', () => {
  // The bug this replaces: the targets were flat minimums, and since the
  // bootstrapper only generates `target - existing`, a ten-chapter novel opened
  // with the same three characters a one-shot did — and nothing downstream ever
  // added a fourth.
  it('falls back to the old floors when no scope is known', () => {
    expect(castTargetsFor(undefined)).toEqual({ characters: 3, locations: 2, plotThreads: 1 })
    expect(castTargetsFor({})).toEqual({ characters: 3, locations: 2, plotThreads: 1 })
    expect(castTargetsFor({ chapters: 0 })).toEqual({ characters: 3, locations: 2, plotThreads: 1 })
  })

  it('scales the cast with chapter count', () => {
    expect(castTargetsFor({ chapters: 10 })).toEqual({
      characters: 8,
      locations: 6,
      plotThreads: 4
    })
  })

  it('grows monotonically with scope', () => {
    const small = castTargetsFor({ chapters: 5 })
    const large = castTargetsFor({ chapters: 20 })
    expect(large.characters).toBeGreaterThan(small.characters)
    expect(large.locations).toBeGreaterThan(small.locations)
  })

  it('caps a very long story so the cast stays writable', () => {
    expect(castTargetsFor({ chapters: 200 })).toEqual({
      characters: 12,
      locations: 9,
      plotThreads: 5
    })
  })

  it('ignores a garbage chapter count instead of producing NaN targets', () => {
    expect(castTargetsFor({ chapters: 'lots' })).toEqual({
      characters: 3,
      locations: 2,
      plotThreads: 1
    })
    expect(castTargetsFor({ chapters: -5 })).toEqual({
      characters: 3,
      locations: 2,
      plotThreads: 1
    })
  })
})

describe('castGap', () => {
  it('returns the shortfall against the target', () => {
    expect(castGap(8, 3)).toBe(5)
  })

  it('never asks one call for more entities than it can reliably emit', () => {
    expect(castGap(20, 0)).toBe(6)
  })

  it('returns 0 when the cast already meets or exceeds the target', () => {
    expect(castGap(3, 3)).toBe(0)
    expect(castGap(3, 9)).toBe(0)
  })
})

describe('summarizeArc', () => {
  const chapter = (n) => ({
    chapterNumber: n,
    title: `Chapter ${n}`,
    goal: `goal ${n}`,
    hookEnding: `hook ${n}`
  })

  it('renders each chapter as a single beat line', () => {
    expect(summarizeArc([chapter(1)])).toBe('1. Chapter 1 — goal 1 → hook 1')
  })

  it('samples a long arc down so the prompt stays a shape, not a wall', () => {
    const lines = summarizeArc(Array.from({ length: 200 }, (_, i) => chapter(i + 1))).split('\n')
    expect(lines.length).toBeLessThanOrEqual(40)
    // Sampling must still span the whole book — an arc digest that stops at
    // chapter 40 can't tell the model what the ending needs.
    expect(lines[0]).toContain('Chapter 1')
    expect(lines[lines.length - 1]).toContain('Chapter 196')
  })

  it('survives missing fields and non-array input', () => {
    expect(summarizeArc([{ title: 'Untitled beat' }])).toBe('1. Untitled beat')
    expect(summarizeArc(null)).toBe('')
    expect(summarizeArc([])).toBe('')
  })
})
