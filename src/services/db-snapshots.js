import { db } from './db-core'

export async function getSnapshots(projectId, chapterId = null) {
  if (chapterId !== null) {
    return db.snapshots
      .where('[projectId+chapterId]')
      .equals([projectId, chapterId])
      .toArray()
      .then((arr) => arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
  }
  return db.snapshots
    .where('projectId')
    .equals(projectId)
    .toArray()
    .then((arr) => arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
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
    .where('[projectId+chapterId]')
    .equals([projectId, chapterId])
    .toArray()
    .then((arr) => arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
}
