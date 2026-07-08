import { describe, it, expect } from 'vitest'
import { identifySpeakers, buildSpeakerIndex, getUnidentifiedLines } from '../../utils/speakerIdentifier'

describe('speakerIdentifier', () => {
  const characters = [
    { id: 'char1', name: 'John Smith' },
    { id: 'char2', name: 'Jane Doe' },
    { id: 'char3', name: 'Bob', aliases: ['Bobby', 'Robert'] },
  ]

  describe('identifySpeakers', () => {
    it('returns empty array for null/empty inputs', () => {
      expect(identifySpeakers(null, characters)).toEqual([])
      expect(identifySpeakers([], null)).toEqual([])
      expect(identifySpeakers(null, null)).toEqual([])
    })

    it('identifies speaker from tag match (full name)', () => {
      const lines = [
        { speakerCandidate: 'John', dialogueText: 'Hello', tag: 'said', tagPosition: 'after' },
      ]
      const result = identifySpeakers(lines, characters)
      expect(result).toHaveLength(1)
      expect(result[0].speakerId).toBe('char1')
      expect(result[0].speakerName).toBe('John Smith')
      expect(result[0].confidence).toBe(0.9)
      expect(result[0].needsReview).toBe(false)
    })

    it('identifies speaker from tag match (alias)', () => {
      const lines = [
        { speakerCandidate: 'Bobby', dialogueText: 'Hey', tag: 'said' },
      ]
      const result = identifySpeakers(lines, characters)
      expect(result[0].speakerId).toBe('char3')
      expect(result[0].speakerName).toBe('Bob')
    })

    it('falls back to context when no tag match', () => {
      const lines = [
        { speakerId: 'char1', speakerName: 'John Smith', needsReview: false, confidence: 0.9, dialogueText: 'First', fullParagraphText: 'First line.' },
        { speakerCandidate: null, dialogueText: 'Response', fullParagraphText: 'Response.' },
      ]
      const result = identifySpeakers(lines, characters)
      expect(result).toHaveLength(2)
      expect(result[1].speakerId).toBe('char1')
      expect(result[1].confidence).toBe(0.6)
      expect(result[1].needsReview).toBe(true)
    })

    it('marks needsReview when no speaker identified', () => {
      const lines = [
        { speakerCandidate: null, dialogueText: 'Unknown', fullParagraphText: 'Unknown line.' },
      ]
      const result = identifySpeakers(lines, characters)
      expect(result[0].speakerId).toBeNull()
      expect(result[0].speakerName).toBeNull()
      expect(result[0].confidence).toBe(0)
      expect(result[0].needsReview).toBe(true)
    })

    it('matches partial name (first name only)', () => {
      const lines = [
        { speakerCandidate: 'John', dialogueText: 'Hey' },
      ]
      const result = identifySpeakers(lines, characters)
      expect(result[0].speakerId).toBe('char1')
    })

    it('preserves all original properties on enriched line', () => {
      const lines = [
        { speakerCandidate: 'John', dialogueText: 'Hi', tag: 'said', paragraphIndex: 5, quoteChar: '"' },
      ]
      const result = identifySpeakers(lines, characters)
      expect(result[0].dialogueText).toBe('Hi')
      expect(result[0].paragraphIndex).toBe(5)
      expect(result[0].quoteChar).toBe('"')
    })
  })

  describe('buildSpeakerIndex', () => {
    it('returns empty object for non-array', () => {
      expect(buildSpeakerIndex(null)).toEqual({})
      expect(buildSpeakerIndex(undefined)).toEqual({})
    })

    it('groups lines by speakerId', () => {
      const lines = [
        { speakerId: 'char1', speakerName: 'John Smith', dialogueText: 'First' },
        { speakerId: 'char2', speakerName: 'Jane Doe', dialogueText: 'Second' },
        { speakerId: 'char1', speakerName: 'John Smith', dialogueText: 'Third' },
      ]
      const index = buildSpeakerIndex(lines)
      expect(Object.keys(index)).toHaveLength(2)
      expect(index.char1.totalLines).toBe(2)
      expect(index.char1.lines).toHaveLength(2)
      expect(index.char2.totalLines).toBe(1)
      expect(index.char2.speakerName).toBe('Jane Doe')
    })

    it('skips lines without speakerId', () => {
      const lines = [
        { speakerId: null, dialogueText: 'Orphan' },
        { speakerId: 'char1', speakerName: 'John Smith', dialogueText: 'Known' },
      ]
      const index = buildSpeakerIndex(lines)
      expect(Object.keys(index)).toHaveLength(1)
    })
  })

  describe('getUnidentifiedLines', () => {
    it('returns empty array for non-array', () => {
      expect(getUnidentifiedLines(null)).toEqual([])
    })

    it('filters lines needing review', () => {
      const lines = [
        { speakerId: 'char1', needsReview: false, dialogueText: 'Known' },
        { speakerId: null, needsReview: true, dialogueText: 'Unknown 1' },
        { speakerId: 'char2', needsReview: true, dialogueText: 'Uncertain' },
      ]
      const result = getUnidentifiedLines(lines)
      expect(result).toHaveLength(2)
      expect(result[0].dialogueText).toBe('Unknown 1')
      expect(result[1].dialogueText).toBe('Uncertain')
    })
  })
})
