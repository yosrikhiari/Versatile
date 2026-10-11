import { describe, it, expect } from 'vitest'
import { weightedKappa, wilsonCI, perClassAgreement } from '@/evaluation/judgeMetrics'

// P0-A calibration: chance-corrected agreement over three ORDERED classes
// (pass < revise < rewrite) plus interval estimates.

const CLASSES = ['pass', 'revise', 'rewrite']

describe('weightedKappa', () => {
  it('is exactly 1 on perfect agreement (3 per class)', () => {
    const a = [
      'pass',
      'pass',
      'pass',
      'revise',
      'revise',
      'revise',
      'rewrite',
      'rewrite',
      'rewrite'
    ]
    const b = [
      'pass',
      'pass',
      'pass',
      'revise',
      'revise',
      'revise',
      'rewrite',
      'rewrite',
      'rewrite'
    ]
    expect(weightedKappa(a, b, CLASSES)).toBe(1)
  })

  it('matches the hand-computed linear-weight case', () => {
    // 3x3 table (rows = a, cols = b), N = 12, uniform margins (4 each):
    //   pass:    [3, 1, 0]
    //   revise:  [1, 2, 1]
    //   rewrite: [0, 1, 3]
    // Linear weights w[i][j] = |i-j|/2:
    //   Qo = (0.5 + 0.5 + 0.5 + 0.5) / 12 = 2/12 = 1/6
    //   Qe = (1/9) * (0+0.5+1 + 0.5+0+0.5 + 1+0.5+0) = 4/9
    //   kw = 1 - Qo/Qe = 1 - (1/6)/(4/9) = 1 - 3/8 = 0.625
    const a = [
      'pass',
      'pass',
      'pass',
      'pass',
      'revise',
      'revise',
      'revise',
      'revise',
      'rewrite',
      'rewrite',
      'rewrite',
      'rewrite'
    ]
    const b = [
      'pass',
      'pass',
      'pass',
      'revise',
      'pass',
      'revise',
      'revise',
      'rewrite',
      'revise',
      'rewrite',
      'rewrite',
      'rewrite'
    ]
    expect(weightedKappa(a, b, CLASSES)).toBeCloseTo(0.625, 10)
  })

  it('is NaN on vacuous single-category inputs', () => {
    expect(Number.isNaN(weightedKappa(['pass', 'pass'], ['pass', 'pass'], CLASSES))).toBe(true)
  })
})

describe('wilsonCI', () => {
  it('is [NaN, NaN] on (0, 0)', () => {
    const [lo, hi] = wilsonCI(0, 0)
    expect(Number.isNaN(lo)).toBe(true)
    expect(Number.isNaN(hi)).toBe(true)
  })

  it('covers (8, 10) at lo~=0.49 hi~=0.94', () => {
    const [lo, hi] = wilsonCI(8, 10)
    expect(lo).toBeCloseTo(0.49, 2)
    expect(hi).toBeCloseTo(0.94, 2)
  })

  it('covers (0, 10) at lo~=0 hi~=0.28', () => {
    const [lo, hi] = wilsonCI(0, 10)
    expect(lo).toBeCloseTo(0, 2)
    expect(hi).toBeCloseTo(0.28, 2)
  })
})

describe('perClassAgreement', () => {
  it('returns per-class agreement rate and support', () => {
    // pass: 3 actual, 2 correct -> 2/3; revise: 2 actual, 1 correct -> 0.5; rewrite: 1 actual, 1 correct -> 1
    const actual = ['pass', 'pass', 'pass', 'revise', 'revise', 'rewrite']
    const predicted = ['pass', 'pass', 'revise', 'revise', 'rewrite', 'rewrite']
    const result = perClassAgreement(actual, predicted, CLASSES)
    expect(result['pass'].support).toBe(3)
    expect(result['pass'].agreement).toBeCloseTo(2 / 3, 10)
    expect(result['revise'].support).toBe(2)
    expect(result['revise'].agreement).toBeCloseTo(0.5, 10)
    expect(result['rewrite'].support).toBe(1)
    expect(result['rewrite'].agreement).toBe(1)
  })
})
