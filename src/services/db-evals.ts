import { db as _db } from './db-core'
import { guardStorageWrite } from '../guardrails/integration/storageGuardrails'

const db = _db as any

export async function saveEvalResult(record: any) {
  // A malformed eval row corrupts score aggregation without ever throwing.
  guardStorageWrite('evalResults', record, { entryPoint: 'db-evals.saveEvalResult' })
  return db.evalResults.add({
    ...record,
    timestamp: record.timestamp || new Date().toISOString()
  })
}

export async function getEvalResultsByProject(projectId: string) {
  return db.evalResults.where('projectId').equals(projectId).reverse().sortBy('timestamp')
}

export async function getEvalResultsByScene(projectId: string, sceneId: string) {
  return db.evalResults
    .where('[projectId+sceneId]')
    .equals([projectId, sceneId])
    .reverse()
    .toArray()
}

export async function getEvalResultsByType(projectId: string, evalType: string) {
  return db.evalResults
    .where('[projectId+evalType]')
    .equals([projectId, evalType])
    .reverse()
    .sortBy('timestamp')
}

export async function getLatestEvalResult(projectId: string, sceneId: string, evalType: string) {
  const results = await db.evalResults
    .where('[projectId+sceneId+evalType]')
    .equals([projectId, sceneId, evalType])
    .reverse()
    .toArray()
  return results.length > 0 ? results[results.length - 1] : null
}

export async function getEvalScoreHistory(projectId: string, evalType: string, limit = 50) {
  const results = await db.evalResults
    .where('[projectId+evalType]')
    .equals([projectId, evalType])
    .reverse()
    .sortBy('timestamp')
  return results.slice(-limit)
}

export async function getAggregateStats(projectId: string) {
  const all = await db.evalResults
    .where('[projectId+evalType]')
    .equals([projectId, 'critique'])
    .toArray()

  if (all.length === 0) return null

  const scores = all.map((r: any) => r.score).filter((s: any) => typeof s === 'number')
  const avgScore: number | null =
    scores.length > 0
      ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
      : null

  return {
    totalEvals: all.length,
    evaluatedScenes: new Set(all.map((r: any) => r.sceneId).filter(Boolean)).size,
    averageScore: avgScore,
    latestTimestamp: all.reduce((latest: string, r: any) => (r.timestamp > latest ? r.timestamp : latest), '')
  }
}

export async function deleteEvalResultsByProject(projectId: string) {
  return db.evalResults.where('projectId').equals(projectId).delete()
}
