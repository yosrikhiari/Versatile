import { describe, it, expect, vi } from 'vitest'
import { sanitizeJsonResponse, normalizeField, wrapApiError, FIELD_LENGTH_CONSTRAINTS } from '@/composables/generation/utils'

describe('sanitizeJsonResponse', () => {
  it('returns null for empty/null input', () => {
    expect(sanitizeJsonResponse('')).toBeNull()
    expect(sanitizeJsonResponse(null)).toBeNull()
    expect(sanitizeJsonResponse(undefined)).toBeNull()
  })

  it('strips markdown fences and parses', () => {
    const result = sanitizeJsonResponse('```json\n{"name": "John"}\n```')
    expect(result).toEqual({ name: 'John' })
  })

  it('preserves arrays', () => {
    const result = sanitizeJsonResponse('{"a": null, "b": 42, "c": true, "d": ["x", "y"]}')
    expect(result).toEqual({ a: '', b: '42', c: 'true', d: ['x', 'y'] })
  })

  it('returns null for invalid JSON', () => {
    expect(sanitizeJsonResponse('not json')).toBeNull()
  })
})

describe('normalizeField', () => {
  it('returns field value when present', () => {
    expect(normalizeField({ name: 'John' }, 'name')).toBe('John')
  })

  it('tries capitalized variant', () => {
    expect(normalizeField({ Name: 'Jane' }, 'name')).toBe('Jane')
  })

  it('returns empty for missing field', () => {
    expect(normalizeField({}, 'name')).toBe('')
  })
})

describe('wrapApiError', () => {
  it('returns default error for null input', () => {
    const result = wrapApiError(null)
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toMatch(/Ensure Ollama is running/)
  })

  it('throws original message for API errors', () => {
    expect(() => wrapApiError(new Error('Ollama error'))).toThrow('Ollama error')
    expect(() => wrapApiError(new Error('Model not found'))).toThrow('Model not found')
  })

  it('throws default error for other errors', () => {
    expect(() => wrapApiError(new Error('Network timeout'))).toThrow('Ensure Ollama is running')
  })
})

describe('FIELD_LENGTH_CONSTRAINTS', () => {
  it('has character constraints', () => {
    expect(FIELD_LENGTH_CONSTRAINTS.character.name.maxWords).toBe(3)
  })

  it('has location constraints', () => {
    expect(FIELD_LENGTH_CONSTRAINTS.location.description.maxSentences).toBe(3)
  })
})

describe('retryWithBackoff', () => {
  it('returns result on successful call', async () => {
    const { retryWithBackoff } = await import('@/composables/generation/utils')
    const result = await retryWithBackoff(() => Promise.resolve('ok'))
    expect(result).toBe('ok')
  })

  it('throws permanent error without retry', async () => {
    const { retryWithBackoff } = await import('@/composables/generation/utils')
    const fn = vi.fn().mockRejectedValue(new Error('API key invalid'))
    await expect(retryWithBackoff(fn)).rejects.toThrow('API key invalid')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on transient errors then succeeds', async () => {
    const { retryWithBackoff } = await import('@/composables/generation/utils')
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('recovered')
    const result = await retryWithBackoff(fn)
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('exhausts retries and throws on persistent failure', async () => {
    const { retryWithBackoff } = await import('@/composables/generation/utils')
    const fn = vi.fn().mockRejectedValue(new Error('transient error'))
    await expect(retryWithBackoff(fn, 3)).rejects.toThrow('transient error')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
