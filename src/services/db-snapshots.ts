import { db as _db } from './db-core'

const db = _db as any

export async function getSnapshots(projectId: any, chapterId: any = null) {
  if (chapterId !== null) {
    return db.snapshots
      .where('[projectId+chapterId]')
      .equals([projectId, chapterId])
      .toArray()
      .then((arr: any) => arr.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)))
  }
  return db.snapshots
    .where('projectId')
    .equals(projectId)
    .toArray()
    .then((arr: any) => arr.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)))
}

export async function addSnapshot(projectId: any, chapterId: any, content: any, label: any = '') {
  return db.snapshots.add({
    projectId,
    chapterId,
    content,
    label,
    timestamp: new Date().toISOString()
  })
}

export async function getSnapshot(id: any) {
  return db.snapshots.get(id)
}

export async function deleteSnapshot(id: any) {
  return db.snapshots.delete(id)
}

export async function getSceneSnapshots(projectId: any, chapterId: any) {
  return db.snapshots
    .where('[projectId+chapterId]')
    .equals([projectId, chapterId])
    .toArray()
    .then((arr: any) => arr.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)))
}
