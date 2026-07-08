import { describe, it, expect } from 'vitest'
import { sanitizeJson, countCharacters, formatCharacterCheck, formatLocationCheck } from '@/composables/useStoryCritic'

describe('sanitizeJson', () => {
  it('parses valid JSON', () => {
    expect(sanitizeJson('{"key": "val"}')).toEqual({ key: 'val' })
  })

  it('strips markdown fences', () => {
    expect(sanitizeJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('returns null for empty/undefined/null', () => {
    expect(sanitizeJson('')).toBeNull()
    expect(sanitizeJson(null)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(sanitizeJson('{bad}')).toBeNull()
  })
})

describe('countCharacters', () => {
  it('returns 0 for empty/null input', () => {
    expect(countCharacters('')).toBe(0)
    expect(countCharacters(null)).toBe(0)
  })

  it('counts character headings', () => {
    const bible = '## John\nSome text\n## Jane\nMore text\n## Bob\n'
    expect(countCharacters(bible)).toBe(3)
  })
})

describe('formatCharacterCheck', () => {
  it('formats character check string', () => {
    const char = { name: 'John', role: 'Hero', goal: 'Save world', voice: 'Bold', notes: 'Brave' }
    const excerpts = [{ prose: 'John walked in.' }]
    const result = formatCharacterCheck(char, '', excerpts)
    expect(result).toContain('Character: John')
    expect(result).toContain('Role: Hero')
    expect(result).toContain('John walked in.')
  })
})

describe('formatLocationCheck', () => {
  it('formats location check string', () => {
    const loc = { name: 'Forest', description: 'Dark woods', notes: 'Dangerous' }
    const excerpts = [{ prose: 'The forest was dark.' }]
    const result = formatLocationCheck(loc, '', excerpts)
    expect(result).toContain('Location: Forest')
    expect(result).toContain('Description: Dark woods')
    expect(result).toContain('The forest was dark.')
  })
})

describe('fact ledger in consistency checks', () => {
  it('includes established-canon facts in the character check when a ledger is provided', () => {
    const char = { name: 'John', role: 'Hero' }
    const excerpts = [{ prose: 'John walked in.' }]
    const ledger = ['Ch2: John loses his left hand', 'Ch3: Mara learns the truth']
    const result = formatCharacterCheck(char, ledger, excerpts)
    expect(result).toContain('Established canon')
    expect(result).toContain('John loses his left hand')
  })

  it('omits the canon block when the ledger is empty (backward compatible)', () => {
    const result = formatCharacterCheck({ name: 'John' }, [], [{ prose: 'x' }])
    expect(result).not.toContain('Established canon')
  })

  it('includes established-canon facts in the location check too', () => {
    const result = formatLocationCheck({ name: 'Keep' }, ['Ch1: the Keep burns down'], [{ prose: 'x' }])
    expect(result).toContain('Established canon')
    expect(result).toContain('the Keep burns down')
  })
})
