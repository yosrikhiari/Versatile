import { describe, it, expect } from 'vitest'
import { unwrapEnvelope } from '@/services/api'

// The backend wraps every 2xx object result as { data, message }
// (ResponseEnvelopeFilter). Before 2026-10-04 nothing unwrapped it, so login
// read `result.token` and sync read `result.id` off the envelope: undefined.
describe('unwrapEnvelope', () => {
  it('returns the payload of a { data, message } envelope', () => {
    expect(unwrapEnvelope({ data: { id: 'x' }, message: null })).toEqual({ id: 'x' })
    expect(unwrapEnvelope({ data: [1, 2] })).toEqual([1, 2])
    expect(unwrapEnvelope({ data: { items: [], hasNextPage: false } })).toEqual({
      items: [],
      hasNextPage: false
    })
  })

  it('leaves anything else alone, including objects that merely have a data field', () => {
    expect(unwrapEnvelope({ data: 'x', id: 'y' })).toEqual({ data: 'x', id: 'y' })
    expect(unwrapEnvelope([{ data: 1 }])).toEqual([{ data: 1 }])
    expect(unwrapEnvelope(null)).toBeNull()
    expect(unwrapEnvelope('text')).toBe('text')
  })
})
