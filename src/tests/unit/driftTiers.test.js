import { describe, it, expect } from 'vitest'
import {
  computeDrift as analyzerDrift,
  generateReport as analyzerReport,
  DEFAULTS as analyzerDefaults
} from '@/evaluation/driftAnalyzer'
import {
  computeDrift as scriptDrift,
  generateReport as scriptReport,
  DEFAULTS as scriptDefaults
} from '../../../scripts/ml-pipelines/drift-monitor/monitor.js'

// Constant scores isolate mean-shift behavior: zero variance means the
// volatility path can never fire, so every status below is tier logic only.
// Shift boundary aligns with the monitor's own 70/30 timestamp split.
function makeEvals({ base = 7, recentShift = 0, total = 14, recentWindow = 0.3, dim = 'pacing' }) {
  const splitIdx = Math.max(1, Math.min(total - 1, Math.floor(total * (1 - recentWindow))))
  const evals = []
  for (let i = 0; i < total; i++) {
    const score = i < splitIdx ? base : base + recentShift
    evals.push({
      projectId: 'proj-tier',
      sceneId: `tier-eval-${String(i + 1).padStart(3, '0')}`,
      score,
      dimensionScores: { [dim]: score },
      timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      workspaceType: 'creative'
    })
  }
  return evals
}

const DIMS = ['pacing']
const TIERS = { threshold: 0.7, warnThreshold: 0.5 }

describe('drift warn/act tiers', () => {
  it('defaults preserve single-threshold behavior (warn tier unreachable)', () => {
    expect(analyzerDefaults.warnThreshold).toBe(analyzerDefaults.driftThreshold)
    expect(scriptDefaults.warnThreshold).toBe(scriptDefaults.driftThreshold)
    // 0.6 shift stays silent by default, exactly as the old single threshold did.
    const result = analyzerDrift(makeEvals({ recentShift: -0.6 }), DIMS, {})
    expect(result.dimensionDrifts.pacing.status).toBe('stable')
    expect(result.driftDetected).toBe(false)
  })

  it('warn band fires warning without driftDetected', () => {
    const result = analyzerDrift(makeEvals({ recentShift: -0.6 }), DIMS, TIERS)
    expect(result.dimensionDrifts.pacing.status).toBe('warning')
    expect(result.dimensionDrifts.pacing.severity).toBe('low')
    expect(result.driftDetected).toBe(false)
  })

  it('act tier fires regression with driftDetected', () => {
    const result = analyzerDrift(makeEvals({ recentShift: -0.8 }), DIMS, TIERS)
    expect(result.dimensionDrifts.pacing.status).toBe('regression')
    expect(result.driftDetected).toBe(true)
  })

  it('below warn band stays stable', () => {
    const result = analyzerDrift(makeEvals({ recentShift: -0.4 }), DIMS, TIERS)
    expect(result.dimensionDrifts.pacing.status).toBe('stable')
    expect(result.driftDetected).toBe(false)
  })

  it('act dominates when warnThreshold exceeds threshold (misconfig is safe)', () => {
    const result = analyzerDrift(makeEvals({ recentShift: -0.8 }), DIMS, {
      threshold: 0.7,
      warnThreshold: 0.9
    })
    expect(result.dimensionDrifts.pacing.status).toBe('regression')
    expect(result.driftDetected).toBe(true)
  })

  it('warnings collect in the report, never in regressions/improvements', () => {
    const evals = makeEvals({ recentShift: -0.6 })
    const drift = analyzerDrift(evals, DIMS, TIERS)
    const report = analyzerReport([{ workspaceType: 'creative', evalCount: evals.length, drift }], {
      recentWindow: 0.3,
      ...TIERS,
      minData: 10
    })
    expect(report.flaggedItems.warnings).toHaveLength(1)
    expect(report.flaggedItems.regressions).toHaveLength(0)
    expect(report.flaggedItems.improvements).toHaveLength(0)
    expect(report.summary.dimensionsWithWarning).toBe(1)
    expect(report.summary.workspacesWithDrift).toBe(0)
  })

  it('monitor script and analyzer agree on statuses and deltas', () => {
    for (const shift of [-1.8, -0.8, -0.6, -0.4, 0, 0.6, 1.5]) {
      const evals = makeEvals({ recentShift: shift })
      const a = analyzerDrift(evals, DIMS, TIERS)
      const s = scriptDrift(evals, DIMS, TIERS)
      expect(s.dimensionDrifts.pacing.status).toBe(a.dimensionDrifts.pacing.status)
      expect(s.dimensionDrifts.pacing.delta).toBe(a.dimensionDrifts.pacing.delta)
      expect(s.driftDetected).toBe(a.driftDetected)
    }
  })

  it('monitor and analyzer reports agree on warning counts', () => {
    const evals = makeEvals({ recentShift: -0.6 })
    const opts = { recentWindow: 0.3, ...TIERS, minData: 10 }
    const a = analyzerReport(
      [
        {
          workspaceType: 'creative',
          evalCount: evals.length,
          drift: analyzerDrift(evals, DIMS, TIERS)
        }
      ],
      opts
    )
    const s = scriptReport(
      [
        {
          workspaceType: 'creative',
          evalCount: evals.length,
          drift: scriptDrift(evals, DIMS, TIERS)
        }
      ],
      opts
    )
    expect(s.summary.dimensionsWithWarning).toBe(a.summary.dimensionsWithWarning)
    expect(s.flaggedItems.warnings).toHaveLength(a.flaggedItems.warnings.length)
  })
})
