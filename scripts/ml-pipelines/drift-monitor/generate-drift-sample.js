import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DIMS = {
  creative: ['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing'],
  legal: ['clarity', 'ambiguity', 'liability', 'missing_provision'],
  technical: ['architecture', 'interface', 'security', 'validation']
}

const BASE_SCORES = {
  creative: [7.5, 6.5, 7.0, 7.2, 7.8],
  legal: [8.0, 7.5, 7.8, 8.2],
  technical: [7.0, 6.5, 7.5, 7.0]
}

const DRIFT_DELTAS = {
  creative: [0, 0, -1.2, 0.3, -1.8],
  legal: [0, 0, 0, 0],
  technical: [0, 1.5, 0, 0.8]
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    var t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(v, min, max) {
  return Math.round(Math.min(max, Math.max(min, v)))
}

function generateEvals(workspaceType, count, driftStartIdx, seed, startDate) {
  const rng = mulberry32(seed)
  const dims = DIMS[workspaceType]
  const base = BASE_SCORES[workspaceType]
  const deltas = DRIFT_DELTAS[workspaceType]
  const evals = []
  const startTs = new Date(startDate).getTime()
  const daySpan = 180
  const projects = [`proj-${workspaceType}-a`, `proj-${workspaceType}-b`, `proj-${workspaceType}-c`]

  for (let i = 0; i < count; i++) {
    const isDrift = i >= driftStartIdx
    const ts = new Date(startTs + (i / count) * daySpan * 86400000)

    const dimScores = {}
    let total = 0
    for (let d = 0; d < dims.length; d++) {
      let score = base[d] + (rng() - 0.5) * 1.5
      if (isDrift) {
        score += deltas[d] + (rng() - 0.5) * (deltas[d] !== 0 ? 0.8 : 0)
      }
      dimScores[dims[d]] = clamp(score, 2, 10)
      total += dimScores[dims[d]]
    }
    const overall = clamp(total / dims.length, 1, 10)

    evals.push({
      projectId: projects[i % projects.length],
      sceneId: `${workspaceType}-eval-${String(i + 1).padStart(3, '0')}`,
      evalType: workspaceType === 'creative' ? 'story' : 'document',
      score: overall,
      dimensionScores: dimScores,
      issues: [],
      strengths: [],
      timestamp: ts.toISOString(),
      workspaceType
    })
  }
  return evals
}

const allEvals = [
  ...generateEvals('creative', 35, 22, 42, '2026-01-15'),
  ...generateEvals('legal', 30, 999, 73, '2026-01-20'),
  ...generateEvals('technical', 35, 20, 91, '2026-01-10')
]

const dataset = {
  version: 1,
  description:
    'Synthetic drift-test dataset. creative: pacing+emotional_goal regress after Jan 31. legal: stable throughout. technical: clarity+interface improve after Jan 31.',
  exportedAt: new Date().toISOString(),
  evals: allEvals
}

const outPath = path.resolve(__dirname, 'sample-drift-evals.json')
fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n')
console.log(`Wrote ${allEvals.length} evals to ${outPath}`)

const byWs = {}
for (const e of allEvals) {
  byWs[e.workspaceType] = (byWs[e.workspaceType] || 0) + 1
}
for (const [ws, n] of Object.entries(byWs)) {
  console.log(`  ${ws}: ${n} evals`)
}
