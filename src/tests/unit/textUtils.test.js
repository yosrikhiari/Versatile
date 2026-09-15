import { describe, it, expect } from 'vitest'
import { countWords, stripHtmlTags, stripHtmlBlock, truncate } from '../../utils/textUtils'

describe('textUtils', () => {
  describe('countWords', () => {
    it('returns 0 for empty string', () => {
      expect(countWords('')).toBe(0)
    })

    it('returns 0 for null', () => {
      expect(countWords(null)).toBe(0)
    })

    it('counts words in a sentence', () => {
      expect(countWords('hello world')).toBe(2)
    })

    it('counts words with multiple spaces', () => {
      expect(countWords('hello   world  foo')).toBe(3)
    })

    it('counts words with leading/trailing whitespace', () => {
      expect(countWords('  hello world  ')).toBe(2)
    })

    it('returns 0 for whitespace-only string', () => {
      expect(countWords('   ')).toBe(0)
    })
  })

  describe('stripHtmlTags', () => {
    it('returns empty string for falsy input', () => {
      expect(stripHtmlTags(null)).toBe('')
      expect(stripHtmlTags(undefined)).toBe('')
      expect(stripHtmlTags('')).toBe('')
    })

    it('strips HTML tags', () => {
      expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello')
    })

    it('strips nested HTML tags', () => {
      expect(stripHtmlTags('<div><p>Hello <b>world</b></p></div>')).toBe('Hello world')
    })

    it('returns plain text unchanged', () => {
      expect(stripHtmlTags('Hello world')).toBe('Hello world')
    })

    it('separates adjacent paragraphs so words are not glued together', () => {
      expect(stripHtmlTags('<p>sky.</p><p>Ilse walked</p>')).toBe('sky. Ilse walked')
      expect(countWords(stripHtmlTags('<p>three</p><p>four five</p>'))).toBe(3)
    })

    it('does not split a word around an inline mark', () => {
      expect(stripHtmlTags('<p>un<b>believ</b>able</p>')).toBe('unbelievable')
    })
  })

  describe('stripHtmlBlock', () => {
    it('keeps paragraph breaks and decodes entities', () => {
      expect(stripHtmlBlock('<p>One &amp; two.</p><p>Three<br>four.</p>')).toBe(
        'One & two.\n\nThree\nfour.'
      )
    })
    it('is what the scene digest hashes, so the beta reader must read through it', () => {
      expect(stripHtmlBlock(null)).toBe('')
      expect(stripHtmlBlock('<em>Marguerite</em>')).toBe('Marguerite')
    })
  })

  describe('truncate', () => {
    it('returns full text when shorter than maxLength', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    it('returns full text when equal to maxLength', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('returns null for null text', () => {
      expect(truncate(null, 5)).toBeNull()
    })

    it('truncates text longer than maxLength', () => {
      expect(truncate('hello world', 5)).toBe('hello...')
    })
  })
})
