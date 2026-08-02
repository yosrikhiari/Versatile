/**
 * Regression tests for the failure chain found in the live manuscript audit
 * (planning/LIVE-MANUSCRIPT-AUDIT.md, planning/CONTEXT-STARVATION-LOOP.md).
 *
 * The bug was not that any single piece was missing — the repetition detector,
 * the quality gate, and the entity-sync layer were all present and all correct.
 * It was that a `catch` returned the exact prose the guard had just rejected,
 * with empty metadata, so the guard never rejected anything and the story bible
 * never gained a row. Each test below pins one link of that chain.
 */
import { describe, it, expect } from 'vitest'
import {
  countWords,
  countUniqueWords,
  duplicateRatio,
  gateProseQuality,
  gateScoreDistribution,
  MAX_DUPLICATE_RATIO
} from '@/services/evalGates'

/** The actual shape of the worst scene found in the live database. */
function loopingProse({ lead = 60, repeats = 131 } = {}) {
  const body = Array.from(
    { length: lead },
    (_, i) => `Kaelen moved through the ${i} chamber with the map held against his chest.`
  ).join(' ')
  const loop = Array.from(
    { length: repeats },
    () => 'He had no illusions of being any different.'
  ).join(' ')
  return `${body} ${loop}`
}

describe('countUniqueWords', () => {
  it('counts every word when nothing repeats', () => {
    const text = 'The harbor was quiet that morning. Mira counted the ledger twice.'
    expect(countUniqueWords(text)).toBe(countWords(text))
  })

  it('drops duplicate sentences', () => {
    const once = 'He had no illusions of being any different.'
    const text = `${once} ${once} ${once}`
    expect(countWords(text)).toBe(24)
    expect(countUniqueWords(text)).toBe(8)
  })

  it('keeps short repeated fragments — dialogue legitimately repeats', () => {
    const text = 'No. No. No.'
    expect(countUniqueWords(text)).toBe(countWords(text))
  })
})

describe('duplicateRatio', () => {
  it('is ~0 for clean prose', () => {
    expect(duplicateRatio('One sentence here. A different sentence there.')).toBe(0)
  })

  it('reproduces the live failure — a 131x loop reads as heavily duplicated', () => {
    // Scene 0 in the audit measured 70% duplicate; this synthetic shape lands
    // near 57% because the real scene also carried partial duplicates the
    // fixture does not model. Asserting against the threshold the gate actually
    // uses keeps this meaningful without pinning it to fixture proportions.
    const ratio = duplicateRatio(loopingProse())
    expect(ratio).toBeGreaterThan(MAX_DUPLICATE_RATIO * 3)
    expect(ratio).toBeGreaterThan(0.5)
  })

  it('is 0 for empty input rather than NaN', () => {
    expect(duplicateRatio('')).toBe(0)
  })
})

describe('gateProseQuality', () => {
  it('fails a looping scene that raw word count would pass', () => {
    const prose = loopingProse()
    const target = 1200

    // The defect: by raw count this scene is comfortably on target.
    expect(countWords(prose)).toBeGreaterThan(target)

    const gate = gateProseQuality({ dimensionScores: null }, 0, countWords(prose), target, prose)
    expect(gate.pass).toBe(false)
    expect(gate.flags.join(' ')).toMatch(/duplicate sentences/)
  })

  it('flags the same scene as short once duplicates are removed', () => {
    const prose = loopingProse()
    const gate = gateProseQuality({ dimensionScores: null }, 0, countWords(prose), 1200, prose)
    // Raw length passed; unique length is far below the 85% floor.
    expect(gate.flags.join(' ')).toMatch(/below \d+ \(85% of the 1200-word target\)/)
  })

  it('passes clean prose of the right length', () => {
    const prose = Array.from(
      { length: 120 },
      (_, i) => `Sentence number ${i} carries its own distinct clause and detail.`
    ).join(' ')
    const gate = gateProseQuality({ dimensionScores: null }, 0, countWords(prose), 1000, prose)
    expect(gate.flags.filter((f) => /duplicate/.test(f))).toHaveLength(0)
  })

  it('stays backwards compatible when no prose text is supplied', () => {
    const gate = gateProseQuality({ dimensionScores: null }, 0, 1000, 1000)
    expect(gate.flags.filter((f) => /duplicate/.test(f))).toHaveLength(0)
  })

  it('tolerates repetition below the threshold', () => {
    const unique = Array.from(
      { length: 100 },
      (_, i) => `Sentence number ${i} carries its own distinct clause and detail.`
    ).join(' ')
    const refrain = 'And the harbor went on breathing all the same.'
    const prose = `${unique} ${refrain} ${refrain}`
    expect(duplicateRatio(prose)).toBeLessThan(MAX_DUPLICATE_RATIO)
  })
})

describe('gateScoreDistribution', () => {
  it('flags zero issues at ANY score, not only at or above the suspect score', () => {
    // The live suite scored 6.8 with issueCount 0 on every fixture and passed,
    // because the degenerate-evaluation check required score >= 7.
    const gate = gateScoreDistribution({ score: 6.8, issues: [] })
    expect(gate.pass).toBe(false)
    expect(gate.flags.join(' ')).toMatch(/zero issues/)
  })

  it('still flags zero issues at a high score', () => {
    expect(gateScoreDistribution({ score: 9, issues: [] }).flags.join(' ')).toMatch(/zero issues/)
  })

  it('does not flag a scored critique that found issues', () => {
    const gate = gateScoreDistribution({
      score: 6.5,
      issues: [{ severity: 'minor', type: 'pacing', description: 'slow open' }]
    })
    expect(gate.flags.join(' ')).not.toMatch(/zero issues/)
  })

  it('reports a missing score as missing rather than as -1', () => {
    const gate = gateScoreDistribution({ score: null, issues: [] })
    expect(gate.pass).toBe(false)
    expect(gate.flags.join(' ')).toMatch(/no score/)
    // The old `?? -1` sentinel surfaced to the user as a catastrophic verdict.
    expect(gate.flags.join(' ')).not.toMatch(/-1/)
  })

  it('stays quiet when evaluation was explicitly unavailable', () => {
    const gate = gateScoreDistribution({ evalUnavailable: true, score: null, issues: [] })
    expect(gate.pass).toBe(true)
    expect(gate.flags).toHaveLength(0)
  })

  it('returns a consistent shape from every exit', () => {
    for (const input of [
      null,
      { evalUnavailable: true },
      { score: null, issues: [] },
      { score: 7, issues: [{ severity: 'major' }] }
    ]) {
      const gate = gateScoreDistribution(input)
      expect(gate).toHaveProperty('pass')
      expect(gate).toHaveProperty('failOn')
      expect(Array.isArray(gate.flags)).toBe(true)
    }
  })
})
