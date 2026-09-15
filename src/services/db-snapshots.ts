import Dexie from 'dexie'
import { db as _db } from './db-core'

const db = _db as any

/** Content snapshots kept per chapter/scene; the oldest are dropped on write. */
export const SNAPSHOT_CAP = 40

function newestFirstForChapter(projectId: any, chapterId: any) {
  return db.snapshots
    .where('[projectId+chapterId+timestamp]')
    .between([projectId, chapterId, Dexie.minKey], [projectId, chapterId, Dexie.maxKey])
    .reverse()
}

export async function getSnapshots(projectId: any, chapterId: any = null) {
  if (chapterId !== null) {
    return newestFirstForChapter(projectId, chapterId).toArray()
  }
  return db.snapshots
    .where('projectId')
    .equals(projectId)
    .toArray()
    .then((arr: any) => arr.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp)))
}

/**
 * Append a snapshot unless it would duplicate the newest one.
 *
 * Autosave calls this after every idle pause. Without the check a writer who
 * paused to think, or clicked around, stored the same text again and again —
 * and the history drawer reloaded all of it after each write. Returns the
 * existing id when nothing new was written. Manual saves (a `label`) are
 * always kept, and count toward the cap like any other.
 */
export async function addSnapshot(projectId: any, chapterId: any, content: any, label: any = '') {
  const latest = await newestFirstForChapter(projectId, chapterId).first()
  if (latest && !label && latest.content === content) return latest.id

  const id = await db.snapshots.add({
    projectId,
    chapterId,
    content,
    label,
    timestamp: new Date().toISOString()
  })

  const stale = await newestFirstForChapter(projectId, chapterId).offset(SNAPSHOT_CAP).primaryKeys()
  if (stale.length) await db.snapshots.bulkDelete(stale)
  return id
}

export async function getSnapshot(id: any) {
  return db.snapshots.get(id)
}

export async function deleteSnapshot(id: any) {
  return db.snapshots.delete(id)
}

export async function getSceneSnapshots(projectId: any, chapterId: any) {
  return newestFirstForChapter(projectId, chapterId).toArray()
}
