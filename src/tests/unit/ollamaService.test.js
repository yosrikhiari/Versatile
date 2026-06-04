import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('dexie', () => {
  function DexieMock() {
    this.version = vi.fn().mockReturnThis()
    this.stores = vi.fn().mockReturnThis()
  }
  return { default: DexieMock }
})

let ollamaService
beforeEach(async () => {
  vi.resetModules()
  ollamaService = await import('@/services/ollamaService')
})

describe('simpleEncrypt', () => {
  it('encrypts a string to base64', () => {
    const result = ollamaService.simpleEncrypt('hello')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns the original text on failure', () => {
    const result = ollamaService.simpleEncrypt('')
    expect(typeof result).toBe('string')
  })
})

describe('simpleDecrypt', () => {
  it('decrypts an encrypted string', () => {
    const encrypted = ollamaService.simpleEncrypt('test-value')
    const decrypted = ollamaService.simpleDecrypt(encrypted)
    expect(decrypted).toBe('test-value')
  })

  it('returns original text on invalid input', () => {
    const result = ollamaService.simpleDecrypt('not-base64!!!')
    expect(result).toBe('not-base64!!!')
  })

  it('round-trips correctly for various inputs', () => {
    const inputs = ['', 'abc', 'hello world', 'special chars: !@#$%']
    for (const input of inputs) {
      expect(ollamaService.simpleDecrypt(ollamaService.simpleEncrypt(input))).toBe(input)
    }
  })
})

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(ollamaService.cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(ollamaService.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })

  it('returns 0 for null/undefined inputs', () => {
    expect(ollamaService.cosineSimilarity(null, [1])).toBe(0)
    expect(ollamaService.cosineSimilarity([1], null)).toBe(0)
  })

  it('returns 0 for mismatched lengths', () => {
    expect(ollamaService.cosineSimilarity([1], [1, 2])).toBe(0)
  })

  it('returns 0 when all values are zero', () => {
    expect(ollamaService.cosineSimilarity([0, 0], [1, 2])).toBe(0)
    expect(ollamaService.cosineSimilarity([1, 2], [0, 0])).toBe(0)
  })
})

describe('sanitizeJSON (internal)', () => {
  it('strips markdown code fences', () => {
    const cleaned = ollamaService.sanitizeJSON('```json\n{"a":1}\n```')
    expect(cleaned).toBe('{"a":1}')
  })

  it('trims whitespace', () => {
    const cleaned = ollamaService.sanitizeJSON('  {"a":1}  ')
    expect(cleaned).toBe('{"a":1}')
  })
})

describe('parseJSONWithRetry (internal)', () => {
  it('parses clean JSON', () => {
    const result = ollamaService.parseJSONWithRetry('{"a": 1}')
    expect(result).toEqual({ a: 1 })
  })

  it('strips fences and parses', () => {
    const result = ollamaService.parseJSONWithRetry('```json\n{"a": 1}\n```')
    expect(result).toEqual({ a: 1 })
  })

  it('strips nested code blocks on retry', () => {
    const result = ollamaService.parseJSONWithRetry('```trash```\n{"a": 1}')
    expect(result).toEqual({ a: 1 })
  })

  it('throws after exhausting retries', () => {
    expect(() => ollamaService.parseJSONWithRetry('not json', 2)).toThrow()
  })
})
