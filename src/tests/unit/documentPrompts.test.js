import { describe, it, expect } from 'vitest'
import { DOCUMENT_PROMPTS } from '@/config/documentPrompts'

describe('DOCUMENT_PROMPTS', () => {
  it('is exported as an object', () => {
    expect(DOCUMENT_PROMPTS).toBeTypeOf('object')
  })

  const promptTypes = ['creative', 'novel', 'legal', 'technical', 'business', 'research']

  it('has entries for expected workspace types', () => {
    for (const type of promptTypes) {
      expect(DOCUMENT_PROMPTS).toHaveProperty(type)
    }
  })

  it('only has entries for the defined workspace types', () => {
    expect(Object.keys(DOCUMENT_PROMPTS).sort()).toEqual([...promptTypes].sort())
  })

  const promptKeys = ['director', 'writer', 'critic', 'revisor']

  it('each prompt entry has all expected keys', () => {
    for (const type of promptTypes) {
      const entry = DOCUMENT_PROMPTS[type]
      for (const key of promptKeys) {
        expect(entry).toHaveProperty(key)
        expect(entry[key]).toBeTypeOf('string')
      }
    }
  })

  it('each prompt entry has exactly the expected keys', () => {
    for (const type of promptTypes) {
      expect(Object.keys(DOCUMENT_PROMPTS[type]).sort()).toEqual([...promptKeys].sort())
    }
  })
})
