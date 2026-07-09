import { describe, it, expect } from 'vitest'
import { useEntityExtractor } from '../../composables/useEntityExtractor'

const { isValidEntityName, extractPotentialEntities, getNewEntities } = useEntityExtractor()

describe('isValidEntityName', () => {
  it('rejects null, undefined, empty', () => {
    expect(isValidEntityName(null)).toBe(false)
    expect(isValidEntityName(undefined)).toBe(false)
    expect(isValidEntityName('')).toBe(false)
    expect(isValidEntityName('  ')).toBe(false)
  })

  it('rejects names shorter than 2 chars', () => {
    expect(isValidEntityName('A')).toBe(false)
    expect(isValidEntityName('X')).toBe(false)
  })

  it('rejects names longer than 40 chars', () => {
    expect(isValidEntityName('A' + 'b'.repeat(40))).toBe(false)
  })

  it('rejects names starting with digits', () => {
    expect(isValidEntityName('123 Abc')).toBe(false)
  })

  it('rejects names with more than 4 words', () => {
    expect(isValidEntityName('One Two Three Four Five')).toBe(false)
  })

  it('rejects common words', () => {
    expect(isValidEntityName('the')).toBe(false)
    expect(isValidEntityName('world')).toBe(false)
    expect(isValidEntityName('The Castle')).toBe(false)
  })

  it('rejects names starting with a verb indicator', () => {
    expect(isValidEntityName('is The Thing')).toBe(false)
    expect(isValidEntityName('are They')).toBe(false)
    expect(isValidEntityName('seems Strange')).toBe(false)
  })

  it('rejects names ending with punctuation', () => {
    expect(isValidEntityName('John.')).toBe(false)
    expect(isValidEntityName('Town,')).toBe(false)
    expect(isValidEntityName('Place:')).toBe(false)
  })

  it('rejects single generic location words', () => {
    expect(isValidEntityName('Realm')).toBe(false)
    expect(isValidEntityName('gate')).toBe(false)
  })

  it('accepts valid character name', () => {
    expect(isValidEntityName('John')).toBe(true)
    expect(isValidEntityName('Eldric Stormborn')).toBe(true)
    expect(isValidEntityName('Lady Seraphina')).toBe(true)
  })

  it('accepts valid location name', () => {
    expect(isValidEntityName('Mirkwood Forest')).toBe(true)
    expect(isValidEntityName('Rivendell')).toBe(true)
  })
})

describe('extractPotentialEntities', () => {
  it('returns empty for null/empty input', () => {
    expect(extractPotentialEntities(null)).toEqual({ characters: [], locations: [] })
    expect(extractPotentialEntities('')).toEqual({ characters: [], locations: [] })
    expect(extractPotentialEntities(undefined)).toEqual({ characters: [], locations: [] })
  })

  it('extracts character from explicit label', () => {
    const result = extractPotentialEntities('Character: John Smith')
    expect(result.characters).toContain('John Smith')
  })

  it('extracts location from explicit label', () => {
    const result = extractPotentialEntities('Location: Dark Forest')
    expect(result.locations).toContain('Dark Forest')
  })

  it('extracts named entities', () => {
    const result = extractPotentialEntities('He met a man named Marcus Aurelius.')
    expect(result.characters).toContain('Marcus Aurelius')
  })

  it('extracts entities with titles (name only, not title)', () => {
    const result = extractPotentialEntities('King Arthur drew the sword.')
    expect(result.characters).toContain('Arthur')
  })

  it('detects character from action verbs', () => {
    const result = extractPotentialEntities('The hero helps Sarah Connor escape.')
    expect(result.characters).toContain('Sarah Connor')
  })

  it('extracts location from travel verbs', () => {
    const result = extractPotentialEntities('He travels to Winterfell.')
    expect(result.locations).toContain('Winterfell')
  })

  it('extracts named entities with action verb context', () => {
    const result = extractPotentialEntities('The hero helps Sarah Connor escape.')
    expect(result.characters).toContain('Sarah Connor')
  })

  it('extracts via capitalized pattern with strong character indicator', () => {
    const result = extractPotentialEntities('Captain Marvel saves the world.')
    expect(result.characters).toContain('Marvel')
  })

  it('extracts location from location indicator pattern', () => {
    const result = extractPotentialEntities('travels to the hidden valley')
    expect(result.locations).toContain('valley')
  })

  it('deduplicates entities', () => {
    const result = extractPotentialEntities('Character: John. Named John.')
    expect(result.characters.filter((c) => c === 'John').length).toBe(1)
  })

  it('handles text with multiple entities using explicit labels', () => {
    const text = 'Character: Aragorn. Character: Frodo. Location: Dark Forest.'
    const result = extractPotentialEntities(text)
    expect(result.characters.length).toBeGreaterThanOrEqual(2)
    expect(result.locations.length).toBeGreaterThanOrEqual(1)
  })
})

describe('getNewEntities', () => {
  it('returns all as new when no existing', () => {
    const extracted = { characters: ['John'], locations: ['Forest'] }
    const result = getNewEntities(extracted, [], [])
    expect(result.characters).toEqual([{ name: 'John', isNew: true }])
    expect(result.locations).toEqual([{ name: 'Forest', isNew: true }])
  })

  it('marks existing entities', () => {
    const extracted = { characters: ['John'], locations: [] }
    const result = getNewEntities(extracted, [{ name: 'John', id: 1 }], [])
    expect(result.characters).toEqual([{ name: 'John', isNew: false, id: 1 }])
  })

  it('mixes new and existing', () => {
    const extracted = { characters: ['John', 'Jane'], locations: [] }
    const result = getNewEntities(extracted, [{ name: 'John', id: 1 }], [])
    expect(result.characters).toEqual([
      { name: 'Jane', isNew: true },
      { name: 'John', isNew: false, id: 1 }
    ])
  })

  it('handles case-insensitive matching', () => {
    const extracted = { characters: ['john'], locations: [] }
    const result = getNewEntities(extracted, [{ name: 'John', id: 1 }], [])
    expect(result.characters).toEqual([{ name: 'john', isNew: false, id: 1 }])
  })
})
