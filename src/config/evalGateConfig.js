export const EVAL_GATE_CONFIG = {
  dimensionCoverage: { enabled: true, failOn: 'warn', strict: false },
  scoreDistribution: { enabled: true, failOn: 'warn', suspectScore: 7, suspectScoreRange: [1, 10] },
  revisionEffectiveness: { enabled: true, failOn: 'block' }
}
