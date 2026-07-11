import { db } from './db-core'

export async function saveEvalResult(record) {
  return db.evalResults.add({
    ...record,
    timestamp: record.timestamp || new Date().toISOString()
  })
}

export async function getEvalResultsByProject(projectId) {
  return db.evalResults.where('projectId').equals(projectId).reverse().sortBy('timestamp')
}

export async function getEvalResultsByScene(projectId, sceneId) {
  return db.evalResults
    .where('projectId')
    .equals(projectId)
    .filter((r) => r.sceneId === sceneId)
    .reverse()
    .toArray()
}

export async function getEvalResultsByType(projectId, evalType) {
  return db.evalResults
    .where('projectId')
    .equals(projectId)
    .filter((r) => r.evalType === evalType)
    .reverse()
    .sortBy('timestamp')
}

export async function getLatestEvalResult(projectId, sceneId, evalType) {
  const results = await db.evalResults
    .where('projectId')
    .equals(projectId)
    .filter((r) => r.sceneId === sceneId && r.evalType === evalType)
    .reverse()
    .toArray()
  return results.length > 0 ? results[results.length - 1] : null
}

export async function getEvalScoreHistory(projectId, evalType, limit = 50) {
  const results = await db.evalResults
    .where('projectId')
    .equals(projectId)
    .filter((r) => r.evalType === evalType)
    .reverse()
    .sortBy('timestamp')
  return results.slice(-limit)
}

export async function getAggregateStats(projectId) {
  const all = await db.evalResults
    .where('projectId')
    .equals(projectId)
    .filter((r) => r.evalType === 'critique')
    .toArray()

  if (all.length === 0) return null

  const scores = all.map((r) => r.score).filter((s) => typeof s === 'number')
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null

  return {
    totalEvals: all.length,
    evaluatedScenes: new Set(all.map((r) => r.sceneId).filter(Boolean)).size,
    averageScore: avgScore,
    latestTimestamp: all.reduce((latest, r) => (r.timestamp > latest ? r.timestamp : latest), '')
  }
}

export async function deleteEvalResultsByProject(projectId) {
  return db.evalResults.where('projectId').equals(projectId).delete()
}
