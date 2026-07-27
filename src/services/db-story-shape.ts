import { db as _db } from './db-core'

const db = _db as any

export async function saveShapeAnalysis(record: any) {
  return db.storyShapeAnalysis.put({
    ...record,
    analyzedAt: record.analyzedAt || new Date().toISOString()
  })
}

export async function getShapeAnalysisByScene(projectId: string, sceneId: string) {
  return db.storyShapeAnalysis
    .where('[projectId+sceneId]')
    .equals([projectId, sceneId])
    .reverse()
    .first()
}

export async function getShapeAnalysisByVersion(projectId: string, version: number) {
  return db.storyShapeAnalysis.where('[projectId+version]').equals([projectId, version]).toArray()
}

export async function getLatestShapeVersion(projectId: string) {
  const records = await db.storyShapeAnalysis
    .where('projectId')
    .equals(projectId)
    .reverse()
    .sortBy('version')
  return records.length > 0 ? records[records.length - 1].version : 0
}

export async function getAllShapeAnalyses(projectId: string) {
  return db.storyShapeAnalysis.where('projectId').equals(projectId).toArray()
}

export async function deleteShapeAnalysesByProject(projectId: string) {
  return db.storyShapeAnalysis.where('projectId').equals(projectId).delete()
}
