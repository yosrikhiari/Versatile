import { db } from './db-core'

export async function getSnapshots(projectId, chapterId = null) {
  let query = db.snapshots.where('projectId').equals(projectId)
  let results = await query.toArray()
  if (chapterId !== null) {
    results = results.filter(s => s.chapterId === chapterId)
  }
  return results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export async function addSnapshot(projectId, chapterId, content, label = '') {
  return db.snapshots.add({
    projectId,
    chapterId,
    content,
    label,
    timestamp: new Date().toISOString()
  })
}

export async function getSnapshot(id) {
  return db.snapshots.get(id)
}

export async function deleteSnapshot(id) {
  return db.snapshots.delete(id)
}

export async function getSceneSnapshots(projectId, chapterId) {
  return db.snapshots
    .where('projectId')
    .equals(projectId)
    .filter(s => s.chapterId === chapterId)
    .toArray()
    .then(arr => arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
}
