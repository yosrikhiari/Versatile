import { describe, it, expect, vi } from 'vitest'
import { retryWithBackoff, sanitizeJsonResponse, FIELD_LENGTH_CONSTRAINTS } from '@/services/ai/aiHelpers'

describe('retryWithBackoff', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(retryWithBackoff(fn, 3)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('ok')
    await expect(retryWithBackoff(fn, 5)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(retryWithBackoff(fn, 3)).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws immediately on permanent error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('API key invalid'))
    await expect(retryWithBackoff(fn, 5)).rejects.toThrow('API key invalid')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('sanitizeJsonResponse', () => {
  it('returns null for empty/ invalid input', () => {
    expect(sanitizeJsonResponse('')).toBeNull()
    expect(sanitizeJsonResponse(null)).toBeNull()
    expect(sanitizeJsonResponse(undefined)).toBeNull()
    expect(sanitizeJsonResponse(123)).toBeNull()
  })

  it('strips markdown code fences', () => {
    expect(sanitizeJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: '1' })
    expect(sanitizeJsonResponse('```\n{"b":2}\n```')).toEqual({ b: '2' })
  })

  it('flattens stringified values', () => {
    expect(sanitizeJsonResponse('{"x": "hello"}')).toEqual({ x: 'hello' })
  })

  it('handles arrays', () => {
    expect(sanitizeJsonResponse('{"tags": ["a", "b"]}')).toEqual({ tags: 'a; b' })
  })

  it('handles null/undefined as empty string', () => {
    expect(sanitizeJsonResponse('{"a": null}')).toEqual({ a: '' })
  })

  it('handles numbers and booleans', () => {
    expect(sanitizeJsonResponse('{"n": 42, "b": true}')).toEqual({ n: '42', b: 'true' })
  })
})

describe('FIELD_LENGTH_CONSTRAINTS', () => {
  it('defines character constraints', () => {
    expect(FIELD_LENGTH_CONSTRAINTS.character.name.maxWords).toBe(3)
    expect(FIELD_LENGTH_CONSTRAINTS.character.sampleDialogue.maxSentences).toBe(3)
  })

  it('defines location constraints', () => {
    expect(FIELD_LENGTH_CONSTRAINTS.location.description.maxSentences).toBe(3)
  })

  it('defines plotThread constraints', () => {
    expect(FIELD_LENGTH_CONSTRAINTS.plotThread.title.maxWords).toBe(6)
  })
})
