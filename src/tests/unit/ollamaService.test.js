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

describe('obfuscate', () => {
  it('encodes a string to base64', () => {
    const result = ollamaService.obfuscate('hello')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns the original text on failure', () => {
    const result = ollamaService.obfuscate('')
    expect(typeof result).toBe('string')
  })
})

describe('deobfuscate', () => {
  it('decodes an encoded string', () => {
    const encoded = ollamaService.obfuscate('test-value')
    const decoded = ollamaService.deobfuscate(encoded)
    expect(decoded).toBe('test-value')
  })

  it('returns original text on invalid input', () => {
    const result = ollamaService.deobfuscate('not-base64!!!')
    expect(result).toBe('not-base64!!!')
  })

  it('round-trips correctly for various inputs', () => {
    const inputs = ['', 'abc', 'hello world', 'special chars: !@#$%']
    for (const input of inputs) {
      expect(ollamaService.deobfuscate(ollamaService.obfuscate(input))).toBe(input)
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

