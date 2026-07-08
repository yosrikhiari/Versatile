import { describe, it, expect } from 'vitest'
import { detectDialogue, detectDialogueBatch, hasDialogue } from '../../utils/dialogueDetector'

describe('dialogueDetector', () => {
  describe('detectDialogue', () => {
    it('returns empty array for null/empty text', () => {
      expect(detectDialogue(null, 0)).toEqual([])
      expect(detectDialogue('', 0)).toEqual([])
      expect(detectDialogue(undefined, 0)).toEqual([])
    })

    it('detects double-quoted dialogue with trailing tag', () => {
      const result = detectDialogue('"Hello there," he said.', 0)
      expect(result).toHaveLength(1)
      expect(result[0].dialogueText).toBe('Hello there,')
      expect(result[0].tag).toBeNull()
      expect(result[0].speakerCandidate).toBeNull()
      expect(result[0].paragraphIndex).toBe(0)
    })

    it('detects double-quoted dialogue with leading tag', () => {
      const result = detectDialogue('He said, "Hello there."', 0)
      expect(result).toHaveLength(1)
      expect(result[0].dialogueText).toBe('Hello there.')
    })

    it('detects curly/smart double-quoted dialogue', () => {
      const result = detectDialogue('\u201cHow are you?\u201d she asked.', 1)
      expect(result).toHaveLength(1)
      expect(result[0].dialogueText).toBe('How are you?')
      expect(result[0].speakerCandidate).toBeNull()
    })

    it('detects single-curly quoted dialogue', () => {
      const result = detectDialogue("'I am tired,' he admitted.", 0)
      expect(result).toHaveLength(1)
      expect(result[0].dialogueText).toBe('I am tired,')
    })

    it('returns no dialogue for text without quotes', () => {
      const result = detectDialogue('The cat sat on the mat.', 0)
      expect(result).toHaveLength(0)
    })

    it('detects em-dash dialogue', () => {
      const result = detectDialogue('\u2014I am not going, she said.', 0)
      expect(result).toHaveLength(1)
      expect(result[0].dialogueText).toBe('I am not going, she said.')
      expect(result[0].quoteName).toBe('em-dash')
    })

    it('extracts multiple dialogue lines from one paragraph', () => {
      const text = '"First," he said. "Second," she replied.'
      const results = detectDialogue(text, 0)
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.some(r => r.dialogueText.includes('First'))).toBe(true)
      expect(results.some(r => r.dialogueText.includes('Second'))).toBe(true)
    })

    it('assigns paragraph index to each result', () => {
      const results = detectDialogue('"Hi," he said.', 42)
      expect(results).toHaveLength(1)
      expect(results[0].paragraphIndex).toBe(42)
    })
  })

  describe('detectDialogueBatch', () => {
    it('returns empty array for non-array input', () => {
      expect(detectDialogueBatch(null)).toEqual([])
      expect(detectDialogueBatch(undefined)).toEqual([])
      expect(detectDialogueBatch({})).toEqual([])
    })

    it('processes multiple paragraphs and collects dialogue', () => {
      const paragraphs = [
        { textContent: '"Hello," he said.', paragraphIndex: 0 },
        { textContent: 'The narrator continued.', paragraphIndex: 1 },
        { textContent: '"Goodbye," she replied.', paragraphIndex: 2 },
      ]
      const results = detectDialogueBatch(paragraphs)
      expect(results).toHaveLength(2)
      expect(results[0].paragraphIndex).toBe(0)
      expect(results[1].paragraphIndex).toBe(2)
    })

    it('preserves full paragraph text in each result', () => {
      const paragraphs = [
        { textContent: '"Hey," John said with a smile.', paragraphIndex: 0 },
      ]
      const results = detectDialogueBatch(paragraphs)
      expect(results[0].fullParagraphText).toBe('"Hey," John said with a smile.')
    })
  })

  describe('hasDialogue', () => {
    it('returns false for null/empty', () => {
      expect(hasDialogue(null)).toBe(false)
      expect(hasDialogue('')).toBe(false)
    })

    it('returns true for text with quotes', () => {
      expect(hasDialogue('"Hello!"')).toBe(true)
    })

    it('returns false for text without quotes', () => {
      expect(hasDialogue('Just narration.')).toBe(false)
    })
  })
})
