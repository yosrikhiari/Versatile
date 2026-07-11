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
  creative: [7.0, 7.0, 7.0, 7.0, 7.0],
  legal: [8.0, 7.5, 7.8, 8.2],
  technical: [7.0, 6.5, 7.5, 7.0]
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

function gauss(rng) {
  const u1 = rng()
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

function generateEvals(workspaceType, count, seed, startDate, volatilityStartIdx, lowStd, highStd) {
  const rng = mulberry32(seed)
  const dims = DIMS[workspaceType]
  const base = BASE_SCORES[workspaceType]
  const evals = []
  const startTs = new Date(startDate).getTime()
  const daySpan = 120
  const projects = [`proj-${workspaceType}-a`, `proj-${workspaceType}-b`]

  for (let i = 0; i < count; i++) {
    const isVolatile = volatilityStartIdx >= 0 && i >= volatilityStartIdx
    const std = isVolatile ? highStd : lowStd
    const ts = new Date(startTs + (i / count) * daySpan * 86400000)

    const dimScores = {}
    let total = 0
    for (let d = 0; d < dims.length; d++) {
      let score = base[d] + gauss(rng) * std
      dimScores[dims[d]] = clamp(score, 1, 10)
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
  ...generateEvals('creative', 60, 17, '2026-03-01', 40, 0.5, 2.2),
  ...generateEvals('legal', 5, 42, '2026-04-01', -1, 0.5, 0.5),
  ...generateEvals('technical', 15, 88, '2026-03-15', -1, 0.5, 0.5)
]

const dataset = {
  version: 1,
  description:
    'Edge-case drift dataset. creative: volatility spikes in last 20 evals (std 0.5 → 2.2). legal: 5 evals (< min-data). technical: 15 evals (above min-data, below analysis min).',
  exportedAt: new Date().toISOString(),
  evals: allEvals
}

const outPath = path.resolve(__dirname, 'sample-drift-edge-evals.json')
fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2) + '\n')
console.log(`Wrote ${allEvals.length} evals to ${outPath}`)

const byWs = {}
for (const e of allEvals) {
  byWs[e.workspaceType] = (byWs[e.workspaceType] || 0) + 1
}
for (const [ws, n] of Object.entries(byWs)) {
  console.log(`  ${ws}: ${n} evals`)
}
