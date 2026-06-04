import { describe, it, expect } from 'vitest'
import { extractJson, tryExtractJson, finalizeStream } from '@/services/jsonExtractor'

describe('extractJson', () => {
  it('extracts valid JSON', () => {
    expect(extractJson('{"a": 1}')).toEqual({ a: 1 })
  })

  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(extractJson('```\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('strips preamble text before first brace', () => {
    expect(extractJson('Here is the result:\n{"key": "val"}')).toEqual({ key: 'val' })
  })

  it('repairs trailing commas', () => {
    expect(extractJson('{"a": 1,}')).toEqual({ a: 1 })
    expect(extractJson('{"a": [1, 2,]}')).toEqual({ a: [1, 2] })
  })

  it('closes unclosed braces', () => {
    expect(extractJson('{"a": {"b": 1')).toEqual({ a: { b: 1 } })
  })

  it('strips trailing text after last closing brace', () => {
    expect(extractJson('{"a": 1} some trailing text')).toEqual({ a: 1 })
  })

  it('throws on empty input', () => {
    expect(() => extractJson('')).toThrow()
    expect(() => extractJson(null)).toThrow()
    expect(() => extractJson(undefined)).toThrow()
  })

  it('throws on non-JSON input', () => {
    expect(() => extractJson('just text')).toThrow()
  })
})

describe('tryExtractJson', () => {
  it('returns success with data on valid JSON', () => {
    const result = tryExtractJson('{"x": 2}')
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ x: 2 })
  })

  it('returns error message on failure', () => {
    const result = tryExtractJson('not json')
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe('finalizeStream', () => {
  it('extracts JSON from accumulated string', () => {
    expect(finalizeStream('{"done": true}')).toEqual({ done: true })
  })

  it('throws on invalid stream content', () => {
    expect(() => finalizeStream('')).toThrow()
  })
})
