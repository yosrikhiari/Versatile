import { describe, it, expect, beforeEach } from 'vitest'
import {
  getCalibration,
  getCalibrationReport,
  recordObservedUsage,
  resetCalibration
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
})
