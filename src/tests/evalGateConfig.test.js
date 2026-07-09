import { describe, it, expect } from 'vitest'
import { EVAL_GATE_CONFIG } from '../config/evalGateConfig'

describe('evalGateConfig', () => {
  it('exports EVAL_GATE_CONFIG with 3 gates', () => {
    expect(EVAL_GATE_CONFIG).toHaveProperty('dimensionCoverage')
    expect(EVAL_GATE_CONFIG).toHaveProperty('scoreDistribution')
    expect(EVAL_GATE_CONFIG).toHaveProperty('revisionEffectiveness')
    expect(Object.keys(EVAL_GATE_CONFIG).length).toBe(3)
  })

  it('dimensionCoverage gate has correct structure', () => {
    const gate = EVAL_GATE_CONFIG.dimensionCoverage
    expect(gate).toHaveProperty('enabled')
    expect(gate).toHaveProperty('strict')
    expect(typeof gate.enabled).toBe('boolean')
    expect(typeof gate.strict).toBe('boolean')
  })

  it('scoreDistribution gate has correct structure', () => {
    const gate = EVAL_GATE_CONFIG.scoreDistribution
    expect(gate).toHaveProperty('enabled')
    expect(gate).toHaveProperty('suspectScore')
    expect(gate).toHaveProperty('suspectScoreRange')
    expect(typeof gate.enabled).toBe('boolean')
    expect(Array.isArray(gate.suspectScoreRange)).toBe(true)
    expect(gate.suspectScoreRange[0]).toBeLessThanOrEqual(gate.suspectScoreRange[1])
  })

  it('revisionEffectiveness gate has correct structure', () => {
    const gate = EVAL_GATE_CONFIG.revisionEffectiveness
    expect(gate).toHaveProperty('enabled')
    expect(typeof gate.enabled).toBe('boolean')
    expect(gate.enabled).toBe(true)
  })

  it('all gates are enabled by default', () => {
    const allEnabled = Object.values(EVAL_GATE_CONFIG).every((g) => g.enabled)
    expect(allEnabled).toBe(true)
  })
})
