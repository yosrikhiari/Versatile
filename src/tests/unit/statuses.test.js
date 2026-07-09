import { describe, it, expect } from 'vitest'
import { SECTION_STATUSES, LENS_MAP, LENS_LABELS } from '../../config/statuses'

describe('statuses config', () => {
  describe('SECTION_STATUSES', () => {
    it('has 4 status entries', () => {
      expect(SECTION_STATUSES).toHaveLength(4)
    })

    it.each([
      { value: 'planning', label: 'Planning' },
      { value: 'drafting', label: 'Drafting' },
      { value: 'review', label: 'Under Review' },
      { value: 'final', label: 'Final' }
    ])('includes status $value with label $label', ({ value, label }) => {
      const entry = SECTION_STATUSES.find((s) => s.value === value)
      expect(entry).toBeDefined()
      expect(entry.label).toBe(label)
    })
  })

  describe('LENS_MAP', () => {
    it('maps weakVerbs to weak_verb', () => {
      expect(LENS_MAP.weakVerbs).toBe('weak_verb')
    })

    it('maps repetition to repetition', () => {
      expect(LENS_MAP.repetition).toBe('repetition')
    })

    it('maps pacing to pacing', () => {
      expect(LENS_MAP.pacing).toBe('pacing')
    })

    it('maps clarity to unclear_references', () => {
      expect(LENS_MAP.clarity).toBe('unclear_references')
    })
  })

  describe('LENS_LABELS', () => {
    it('has label for weak_verb', () => {
      expect(LENS_LABELS.weak_verb).toBe('Weak Verbs')
    })

    it('has label for repetition', () => {
      expect(LENS_LABELS.repetition).toBe('Repetition')
    })

    it('has label for pacing', () => {
      expect(LENS_LABELS.pacing).toBe('Pacing')
    })

    it('has label for unclear_references', () => {
      expect(LENS_LABELS.unclear_references).toBe('Clarity Issues')
    })
  })
})
