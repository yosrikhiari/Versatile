import { describe, it, expect } from 'vitest'
import { sanitizeJson } from '@/composables/useStoryDirector'

describe('sanitizeJson', () => {
  it('returns null for empty/undefined/null input', () => {
    expect(sanitizeJson('')).toBeNull()
    expect(sanitizeJson(null)).toBeNull()
    expect(sanitizeJson(undefined)).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(sanitizeJson(123)).toBeNull()
    expect(sanitizeJson({})).toBeNull()
  })

  it('parses valid JSON', () => {
    expect(sanitizeJson('{"key": "value"}')).toEqual({ key: 'value' })
  })

  it('strips markdown code fences', () => {
    expect(sanitizeJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(sanitizeJson('```\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(sanitizeJson('```json\n{"a": 1}```')).toEqual({ a: 1 })
  })

  it('strips preamble text', () => {
    expect(sanitizeJson('Here is the result: {"key": "val"}')).toEqual({ key: 'val' })
  })

  it('trims leading/trailing whitespace', () => {
    expect(sanitizeJson('  \n{"a": 1}\n  ')).toEqual({ a: 1 })
  })

  it('returns null for malformed JSON', () => {
    expect(sanitizeJson('{invalid}')).toBeNull()
  })

  it('extracts from first { to last } even with text between', () => {
    const input = 'some text {"first": true} and then {"second": true}'
    expect(sanitizeJson(input)).toBeNull()
  })
})
