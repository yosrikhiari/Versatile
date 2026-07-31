import { describe, it, expect, beforeEach, vi } from 'vitest'

let est
beforeEach(async () => {
  vi.resetModules()
  localStorage.clear()
  est = await import('@/services/generationEstimate')
})

describe('recordThroughput', () => {
  it('records the first sample as the rate itself', () => {
    est.recordThroughput('m', 600, 100000) // 600 tok in 100s = 6 tok/s
    expect(est.getThroughput('m').tokensPerSecond).toBeCloseTo(6, 3)
    expect(est.getThroughput('m').samples).toBe(1)
  })

  it('blends later samples rather than jumping to the newest', () => {
    est.recordThroughput('m', 600, 100000) // 6 tok/s
    est.recordThroughput('m', 600, 50000) // 12 tok/s
    const rate = est.getThroughput('m').tokensPerSecond
    expect(rate).toBeGreaterThan(6)
    expect(rate).toBeLessThan(12)
  })

  it('ignores samples too small or too malformed to time', () => {
    est.recordThroughput('m', 5, 1000) // below the minimum token count
    est.recordThroughput('m', 500, 0) // no duration
    est.recordThroughput('', 500, 1000) // no model
    expect(est.getThroughput('m')).toBeNull()
  })

  it('keeps per-model rates separate', () => {
    est.recordThroughput('slow', 600, 100000)
    est.recordThroughput('fast', 600, 40000)
    expect(est.getThroughput('slow').tokensPerSecond).toBeLessThan(
      est.getThroughput('fast').tokensPerSecond
    )
  })

  it('survives unreadable storage without throwing', () => {
    localStorage.setItem('versatile_model_throughput', 'not json')
    expect(() => est.recordThroughput('m', 600, 100000)).not.toThrow()
    expect(est.getThroughput('m').tokensPerSecond).toBeCloseTo(6, 3)
  })
})

describe('estimateRun', () => {
  it('flags an unmeasured machine as provisional', () => {
    const r = est.estimateRun({ totalWords: 1000, model: 'unknown' })
    expect(r.measured).toBe(false)
    expect(r.tokensPerSecond).toBe(est.DEFAULT_TOKENS_PER_SECOND)
  })

  it('uses the measured rate once samples exist', () => {
    est.recordThroughput('m', 600, 100000) // 6 tok/s
    const r = est.estimateRun({ totalWords: 1000, model: 'm' })
    expect(r.measured).toBe(true)
    expect(r.tokensPerSecond).toBeCloseTo(6, 3)
  })

  it('reproduces the reported failure case: 10 chapters x 10k words is hours, not minutes', () => {
    // The run the user actually attempted, at this machine's measured 5.85 tok/s.
    est.recordThroughput('qwen3:8b', 585, 100000)
    const r = est.estimateRun({
      totalWords: 100000,
      scenes: 30,
      chapters: 10,
      model: 'qwen3:8b'
    })
    const hours = r.ms / 3600000
    expect(hours).toBeGreaterThan(5)
    expect(hours).toBeLessThan(9)
    expect(r.ms).toBeGreaterThan(est.LONG_RUN_WARNING_MS)
  })

  it('counts per-scene and per-chapter overhead, not just prose', () => {
    const bare = est.estimateRun({ totalWords: 10000 })
    const withOverhead = est.estimateRun({ totalWords: 10000, scenes: 30, chapters: 10 })
    expect(withOverhead.ms).toBeGreaterThan(bare.ms)
  })

  it('handles a zero-size request without producing NaN', () => {
    const r = est.estimateRun({ totalWords: 0 })
    expect(r.ms).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats across the ranges a run actually spans', () => {
    expect(est.formatDuration(30 * 1000)).toBe('under a minute')
    expect(est.formatDuration(45 * 60 * 1000)).toBe('45 min')
    expect(est.formatDuration(2 * 3600 * 1000)).toBe('2h')
    expect(est.formatDuration(2.5 * 3600 * 1000)).toBe('2h 30m')
  })
})
