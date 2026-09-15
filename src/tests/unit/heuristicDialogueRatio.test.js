import { describe, it, expect } from 'vitest'
import { computeDialogueRatio } from '@/composables/useHeuristicAnalyzer'

describe('computeDialogueRatio', () => {
  it('measures the share of words inside quotation marks, straight or curly', () => {
    // 5 quoted words of 7 (the tag "she said" is narration).
    expect(computeDialogueRatio('“You are late,” she said. "Very late."')).toBeCloseTo(5 / 7, 2)
  })

  it('finds dialogue that does not start the paragraph', () => {
    // The old line-based check saw no dialogue here at all.
    const r = computeDialogueRatio('Ilse turned. “Where is the boat?” Tomas did not answer.')
    expect(r).toBeGreaterThan(0.3)
  })

  it('is 0 for narration and for empty text', () => {
    expect(computeDialogueRatio('The tide turned and nobody spoke.')).toBe(0)
    expect(computeDialogueRatio('')).toBe(0)
  })
})
