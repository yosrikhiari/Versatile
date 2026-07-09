import { describe, it, expect, vi } from 'vitest'
import { deepPlain } from '@/services/db-core'

vi.mock('vue', () => ({
  toRaw: vi.fn((obj) => obj)
}))

describe('deepPlain', () => {
  it('deeply clones a simple object', () => {
    const input = { a: 1, b: 'hello' }
    const result = deepPlain(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
  })

  it('handles nested objects', () => {
    const input = { a: { b: { c: 3 } } }
    const result = deepPlain(input)
    expect(result).toEqual(input)
    expect(result.a).not.toBe(input.a)
  })

  it('handles arrays', () => {
    const input = [{ id: 1 }, { id: 2 }]
    const result = deepPlain(input)
    expect(result).toEqual(input)
    expect(result).not.toBe(input)
    expect(result[0]).not.toBe(input[0])
  })

  it('handles reactive refs by converting to raw first', () => {
    const input = { value: 42 }
    const result = deepPlain(input)
    expect(result).toEqual({ value: 42 })
  })

  it('strips undefined values', () => {
    const input = { a: 1, b: undefined }
    const result = deepPlain(input)
    expect(result).toEqual({ a: 1 })
    expect(result).not.toHaveProperty('b')
  })
})
