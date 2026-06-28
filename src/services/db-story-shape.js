import { db } from './db-core'

export async function saveShapeAnalysis(record) {
  return db.storyShapeAnalysis.put({
    ...record,
    analyzedAt: record.analyzedAt || new Date().toISOString()
  })
}

export async function getShapeAnalysisByScene(projectId, sceneId) {
  return db.storyShapeAnalysis
    .where('[projectId+sceneId]')
    .equals([projectId, sceneId])
    .reverse()
    .first()
}

export async function getShapeAnalysisByVersion(projectId, version) {
  return db.storyShapeAnalysis
    .where('[projectId+version]')
    .equals([projectId, version])
    .toArray()
}

export async function getLatestShapeVersion(projectId) {
  const records = await db.storyShapeAnalysis
    .where('projectId')
    .equals(projectId)
    .reverse()
    .sortBy('version')
  return records.length > 0 ? records[records.length - 1].version : 0
}

export async function getAllShapeAnalyses(projectId) {
  return db.storyShapeAnalysis
    .where('projectId')
    .equals(projectId)
    .toArray()
}

export async function deleteShapeAnalysesByProject(projectId) {
  return db.storyShapeAnalysis
    .where('projectId')
    .equals(projectId)
    .delete()
}
