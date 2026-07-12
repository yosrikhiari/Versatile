import { db } from './db-core'

export async function createOptimizationSession(session) {
  return db.optimizationSessions.add({
    ...session,
    timestamp: session.timestamp || new Date().toISOString()
  })
}

export async function getOptimizationSessionsByProject(projectId) {
  return db.optimizationSessions
    .where('projectId')
    .equals(projectId)
    .reverse()
    .sortBy('timestamp')
}

export async function getOptimizationSessionsByScene(projectId, sceneId) {
  return db.optimizationSessions
    .where('projectId')
    .equals(projectId)
    .filter((s) => s.sceneId === sceneId)
    .reverse()
    .toArray()
}

export async function getLatestOptimizationSession(projectId, sceneId) {
  const sessions = await getOptimizationSessionsByScene(projectId, sceneId)
  return sessions.length > 0 ? sessions[0] : null
}

export async function updateOptimizationSession(id, updates) {
  return db.optimizationSessions.update(id, updates)
}

export async function deleteOptimizationSessionsByProject(projectId) {
  return db.optimizationSessions.where('projectId').equals(projectId).delete()
}
