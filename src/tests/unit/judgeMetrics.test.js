import { describe, it, expect } from 'vitest'
import {
  cohensKappa,
  swapAgreement,
  pearsonCorrelation,
  precisionRecallF1,
  passRate
} from '../../evaluation/judgeMetrics'

// P0-A groundwork: the calibration harness's acceptance numbers
// (swap >= 0.85, |r| < 0.3, kappa vs humans) are defined and pinned here,
// before any hand label exists. Labels plug into these functions later.

describe('cohensKappa', () => {
  it('is 1 on perfect agreement', () => {
    expect(cohensKappa(['P', 'F', 'P'], ['P', 'F', 'P'])).toBe(1)
  })

  it('is 0 at chance agreement', () => {
    expect(cohensKappa(['P', 'P', 'F', 'F'], ['P', 'F', 'P', 'F'])).toBe(0)
  })

  it('matches the textbook partial-agreement case', () => {
    // agree 4/5 = 0.8; chance = (4/5)(3/5) + (1/5)(2/5) = 0.56; kappa = 6/11
    expect(cohensKappa(['P', 'P', 'P', 'P', 'F'], ['P', 'P', 'P', 'F', 'F'])).toBeCloseTo(0.5455, 4)
  })

  it('is NaN on vacuous single-category labels, not a misleading 1', () => {
    expect(Number.isNaN(cohensKappa(['P', 'P'], ['P', 'P']))).toBe(true)
  })

  it('rejects unpaired or empty input', () => {
    expect(() => cohensKappa(['P'], ['P', 'F'])).toThrow()
    expect(() => cohensKappa([], [])).toThrow()
  })
})

describe('swapAgreement', () => {
  it('counts identical verdicts across presentation orders', () => {
    expect(swapAgreement(['P', 'F', 'P', 'P', 'F'], ['P', 'P', 'P', 'P', 'F'])).toBe(0.8)
  })

  it('rejects unpaired input', () => {
    expect(() => swapAgreement(['P'], [])).toThrow()
  })
})

describe('pearsonCorrelation', () => {
  it('is 1 on a perfect linear verbosity trend', () => {
    expect(pearsonCorrelation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10)
  })

  it('is NaN on a constant score column (the degenerate judge)', () => {
    // An 8/10-on-every-scene judge has no variance to correlate.
    expect(Number.isNaN(pearsonCorrelation([8, 8, 8, 8], [100, 200, 300, 400]))).toBe(true)
  })
})

describe('precisionRecallF1', () => {
  it('scores the worked example', () => {
    // 2 caught of 3 real defects, 1 false alarm.
    const { precision, recall, f1 } = precisionRecallF1(
      [true, true, false, true, false],
      [true, false, true, true, false]
    )
    expect(precision).toBeCloseTo(2 / 3, 10)
    expect(recall).toBeCloseTo(2 / 3, 10)
    expect(f1).toBeCloseTo(2 / 3, 10)
  })

  it('scores vacuous inputs as perfect, not failed', () => {
    expect(precisionRecallF1([false, false], [false, false])).toEqual({
      precision: 1,
      recall: 1,
      f1: 1
    })
  })

  it('scores a gate that never fails as zero recall', () => {
    const { recall } = precisionRecallF1([false, false], [true, false])
    expect(recall).toBe(0)
  })
})

describe('passRate', () => {
  it('is informational only', () => {
    expect(passRate([true, true, false])).toBeCloseTo(2 / 3, 10)
  })

  it('rejects empty input', () => {
    expect(() => passRate([])).toThrow()
  })
})
