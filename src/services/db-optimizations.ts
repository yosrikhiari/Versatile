import { db as _db } from './db-core'

const db = _db as any

export async function createOptimizationSession(session: any) {
  return db.optimizationSessions.add({
    ...session,
    timestamp: session.timestamp || new Date().toISOString()
  })
}

export async function getOptimizationSessionsByProject(projectId: any) {
  return db.optimizationSessions.where('projectId').equals(projectId).reverse().sortBy('timestamp')
}

export async function getOptimizationSessionsByScene(projectId: any, sceneId: any) {
  return db.optimizationSessions
    .where('[projectId+sceneId]')
    .equals([projectId, sceneId])
    .reverse()
    .toArray()
}

export async function getLatestOptimizationSession(projectId: any, sceneId: any) {
  const sessions = await getOptimizationSessionsByScene(projectId, sceneId)
  return sessions.length > 0 ? sessions[0] : null
}

export async function updateOptimizationSession(id: any, updates: any) {
  return db.optimizationSessions.update(id, updates)
}

export async function deleteOptimizationSessionsByProject(projectId: any) {
  return db.optimizationSessions.where('projectId').equals(projectId).delete()
}
