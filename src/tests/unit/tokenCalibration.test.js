import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCalibration,
  getCalibrationReport,
  getCalibrationHealth,
  getCalibrationHealthReport,
  recordObservedUsage,
  resetCalibration,
  resetModelCalibration
} from '@/services/ai/tokenCalibration'

beforeEach(() => {
  resetCalibration()
})

describe('getCalibration', () => {
  it('is a no-op multiplier until something has been observed', () => {
    expect(getCalibration('claude-sonnet-4-5')).toBe(1)
    expect(getCalibration('')).toBe(1)
  })
})

describe('recordObservedUsage', () => {
  it('learns the ratio between our estimate and what the provider billed', () => {
    // We guessed 1000, the provider charged 1200: our counts run 20% light.
    recordObservedUsage('claude-sonnet-4-5', 1000, 1200)
    expect(getCalibration('claude-sonnet-4-5')).toBeCloseTo(1.2, 5)
  })

  it('blends later samples instead of chasing the last one', () => {
    recordObservedUsage('claude-sonnet-4-5', 1000, 1200)
    recordObservedUsage('claude-sonnet-4-5', 1000, 1000)
    const factor = getCalibration('claude-sonnet-4-5')
    // Moves toward 1.0 but does not jump to it.
    expect(factor).toBeLessThan(1.2)
    expect(factor).toBeGreaterThan(1.0)
  })

  it('converges on a steady ratio', () => {
    for (let i = 0; i < 40; i++) recordObservedUsage('gpt-4o', 1000, 1100)
    expect(getCalibration('gpt-4o')).toBeCloseTo(1.1, 2)
  })

  it('ignores prompts too short to learn from', () => {
    // Chat framing is ~10 additive tokens. On a 50-token prompt that is a 20%
    // swing that has nothing to do with the tokenizer.
    recordObservedUsage('gpt-4o', 50, 60)
    expect(getCalibration('gpt-4o')).toBe(1)
    expect(getCalibrationReport()['gpt-4o']).toBeUndefined()
  })

  it('clamps a wildly implausible reading rather than trusting it', () => {
    // A factor this far off means something other than tokenization is wrong.
    for (let i = 0; i < 60; i++) recordObservedUsage('gpt-4o', 1000, 100000)
    expect(getCalibration('gpt-4o')).toBeLessThanOrEqual(2.0)
  })

  it('ignores malformed observations', () => {
    recordObservedUsage('gpt-4o', 1000, 0)
    recordObservedUsage('gpt-4o', NaN, 1000)
    recordObservedUsage('gpt-4o', 1000, NaN)
    recordObservedUsage('', 1000, 1000)
    expect(getCalibration('gpt-4o')).toBe(1)
  })

  it('keeps models separate', () => {
    recordObservedUsage('gpt-4o', 1000, 1000)
    recordObservedUsage('claude-sonnet-4-5', 1000, 1300)
    expect(getCalibration('gpt-4o')).toBeCloseTo(1.0, 5)
    expect(getCalibration('claude-sonnet-4-5')).toBeCloseTo(1.3, 5)
  })

  it('survives a reload', () => {
    recordObservedUsage('gpt-4o', 1000, 1150)
    const persisted = localStorage.getItem('versatile.tokenCalibration.v1')
    expect(persisted).toBeTruthy()
    expect(JSON.parse(persisted)['gpt-4o'].factor).toBeCloseTo(1.15, 5)
  })

  it('counts how many samples informed a factor', () => {
    recordObservedUsage('gpt-4o', 1000, 1100)
    recordObservedUsage('gpt-4o', 1000, 1100)
    expect(getCalibrationReport()['gpt-4o'].samples).toBe(2)
  })

  describe('budget-poisoning outlier rejection', () => {
    it('rejects a sample >2σ from the running factor and counts it as an anomaly', () => {
      // Establish a stable baseline — 4 equal observations yield near-zero variance.
      for (let i = 0; i < 4; i++) {
        recordObservedUsage('gpt-4o', 1000, 1200)
      }
      const before = getCalibration('gpt-4o')
      expect(before).toBeCloseTo(1.2, 4)

      // Spike: ratio 3.0 is (3.0 - 1.2) / ≈0 ≈ ∞σ above the baseline.
      recordObservedUsage('gpt-4o', 1000, 3000)

      // Factor must not have moved — the outlier was rejected.
      expect(getCalibration('gpt-4o')).toBeCloseTo(1.2, 4)
      const report = getCalibrationReport()['gpt-4o']
      expect(report.anomalies).toBe(1)
      expect(report.consecutiveAnomalies).toBe(1)
    })

    it('accepts a sample within 2σ as a normal observation', () => {
      // Mix in slight variation so variance is non-zero.
      recordObservedUsage('gpt-4o', 1000, 1200)
      recordObservedUsage('gpt-4o', 1000, 1220)
      recordObservedUsage('gpt-4o', 1000, 1180)
      recordObservedUsage('gpt-4o', 1000, 1200)
      const before = getCalibration('gpt-4o')
      // Ratio 1.205 — within 2σ of the ~1.2 factor (stddev ≈ 0.006).
      recordObservedUsage('gpt-4o', 1000, 1205)
      const report = getCalibrationReport()['gpt-4o']
      expect(report.anomalies).toBe(0)
      expect(report.consecutiveAnomalies).toBe(0)
    })

    it('does not attempt outlier detection until MIN_OUTLIER_SAMPLES (4) have been seen', () => {
      recordObservedUsage('gpt-4o', 1000, 1200)
      recordObservedUsage('gpt-4o', 1000, 3000) // ratio 3.0, but insufficient samples
      const report = getCalibrationReport()['gpt-4o']
      expect(report.anomalies).toBe(0)
    })
  })

  describe('budget-poisoning auto-reset', () => {
    it('resets when more than 20% of total attempts are outliers', () => {
      // 4 baseline samples.
      for (let i = 0; i < 4; i++) recordObservedUsage('gpt-4o', 1000, 1200)
      expect(getCalibration('gpt-4o')).toBeCloseTo(1.2, 4)

      // 2 outliers → rate = 2/6 = 33% > 20%.
      for (let i = 0; i < 2; i++) recordObservedUsage('gpt-4o', 1000, 3000)

      // Entry should be gone.
      expect(getCalibration('gpt-4o')).toBe(1)
      expect(getCalibrationReport()['gpt-4o']).toBeUndefined()
    })

    it('resets on 5 consecutive anomalies regardless of overall rate', () => {
      // 20 baseline samples so 5 outliers produce rate 5/25 = 20% (not >20%).
      for (let i = 0; i < 20; i++) recordObservedUsage('gpt-4o', 1000, 1200)
      expect(getCalibration('gpt-4o')).toBeCloseTo(1.2, 2)

      // 5 consecutive outliers → MAX_CONSECUTIVE_ANOMALIES = 5.
      for (let i = 0; i < 5; i++) recordObservedUsage('gpt-4o', 1000, 3000)

      expect(getCalibration('gpt-4o')).toBe(1)
      expect(getCalibrationReport()['gpt-4o']).toBeUndefined()
    })
  })

  describe('getCalibrationHealth', () => {
    it('returns null for an untracked model', () => {
      expect(getCalibrationHealth('unknown-model')).toBeNull()
    })

    it('returns a clean bill of health for a normally converged model', () => {
      for (let i = 0; i < 10; i++) recordObservedUsage('gpt-4o', 1000, 1100)
      const health = getCalibrationHealth('gpt-4o')
      expect(health).not.toBeNull()
      expect(health.suspicious).toBe(false)
      expect(health.samples).toBe(10)
      expect(health.anomalies).toBe(0)
    })

    it('flags convergence to 1.0 with near-zero variance after 20+ samples', () => {
      // All observations at exactly 1.0.
      for (let i = 0; i < 25; i++) recordObservedUsage('gpt-4o', 1000, 1000)
      const health = getCalibrationHealth('gpt-4o')
      expect(health.suspicious).toBe(true)
      expect(health.reason).toContain('possible calibration probe')
    })
  })

  describe('resetModelCalibration', () => {
    it('removes a single model and leaves others intact', () => {
      recordObservedUsage('gpt-4o', 1000, 1100)
      recordObservedUsage('claude-sonnet-4-5', 1000, 1300)
      resetModelCalibration('gpt-4o')
      expect(getCalibration('gpt-4o')).toBe(1)
      expect(getCalibration('claude-sonnet-4-5')).toBeCloseTo(1.3, 5)
    })

    it('does nothing for a non-existent model', () => {
      recordObservedUsage('gpt-4o', 1000, 1100)
      resetModelCalibration('nonexistent')
      expect(getCalibration('gpt-4o')).toBeCloseTo(1.1, 5)
    })
  })

  describe('getCalibrationHealthReport', () => {
    it('returns health for all tracked models', () => {
      recordObservedUsage('gpt-4o', 1000, 1100)
      recordObservedUsage('claude-sonnet-4-5', 1000, 1300)
      const report = getCalibrationHealthReport()
      expect(report.length).toBe(2)
      expect(report.map((h) => h.model).sort()).toEqual(['claude-sonnet-4-5', 'gpt-4o'])
    })
  })
})
