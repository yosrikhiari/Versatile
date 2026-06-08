import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLocalStorage } from '../../composables/useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('with string default', () => {
    it('returns default value when key does not exist', () => {
      const ref = useLocalStorage('test-key', 'default')
      expect(ref.value).toBe('default')
    })

    it('reads plain string from localStorage', () => {
      localStorage.setItem('test-key', 'stored value')
      const ref = useLocalStorage('test-key', 'default')
      expect(ref.value).toBe('stored value')
    })

    it('sets plain string to localStorage', () => {
      const ref = useLocalStorage('test-key', 'default')
      ref.value = 'new value'
      expect(localStorage.getItem('test-key')).toBe('new value')
    })

    it('sets null removes key', () => {
      localStorage.setItem('test-key', 'value')
      const ref = useLocalStorage('test-key', 'default')
      ref.value = null
      expect(localStorage.getItem('test-key')).toBeNull()
    })
  })

  describe('with object default', () => {
    it('returns default when key does not exist', () => {
      const ref = useLocalStorage('obj-key', { a: 1 })
      expect(ref.value).toEqual({ a: 1 })
    })

    it('parses JSON from localStorage', () => {
      localStorage.setItem('obj-key', JSON.stringify({ b: 2 }))
      const ref = useLocalStorage('obj-key', { a: 1 })
      expect(ref.value).toEqual({ b: 2 })
    })

    it('serializes object to JSON on set', () => {
      const ref = useLocalStorage('obj-key', {})
      ref.value = { nested: { value: 42 } }
      expect(JSON.parse(localStorage.getItem('obj-key'))).toEqual({ nested: { value: 42 } })
    })
  })

  describe('with number default', () => {
    it('parses JSON number', () => {
      localStorage.setItem('num-key', '42')
      const ref = useLocalStorage('num-key', 0)
      expect(ref.value).toBe(42)
    })

    it('serializes number to JSON on set', () => {
      const ref = useLocalStorage('num-key', 0)
      ref.value = 99
      expect(localStorage.getItem('num-key')).toBe('99')
    })
  })
})
