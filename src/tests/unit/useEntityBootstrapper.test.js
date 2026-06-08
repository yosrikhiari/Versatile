import { describe, it, expect, beforeEach } from 'vitest'

let sanitizeJson, normalizeName, mergeTraits, mergeNotes
beforeEach(async () => {
  const mod = await import('@/composables/useEntityBootstrapper')
  sanitizeJson = mod.sanitizeJson
  normalizeName = mod.normalizeName
  mergeTraits = mod.mergeTraits
  mergeNotes = mod.mergeNotes
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
