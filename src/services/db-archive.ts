import Dexie from 'dexie'
import { db as _db } from './db-core'
import { SIGNAL } from '../config/archive'

const db = _db as any

/** Newest-first cursor over one project's rows on a `[projectId+timestamp]` index. */
function newestFirst(table: any, projectId: any) {
  return table
    .where('[projectId+timestamp]')
    .between([projectId, Dexie.minKey], [projectId, Dexie.maxKey])
    .reverse()
}

/** State snapshots kept per project; older ones are dropped on write. */
export const STATE_SNAPSHOT_CAP = 50

export async function saveSessionArchive(
  projectId: any,
  type: any,
  data: any,
  tags: any,
  signal: any
) {
  if (
    !signal ||
    ![SIGNAL.ACCEPTED, SIGNAL.PARTIAL, SIGNAL.NEUTRAL, SIGNAL.REJECTED].includes(signal)
  ) {
    throw new Error(
      `saveSessionArchive: signal is required and must be one of accepted/partial/neutral/rejected (got ${signal})`
    )
  }
  return db.sessionArchive.add({
    projectId,
    type,
    data,
    tags: tags || [],
    signal,
    timestamp: new Date().toISOString()
  })
}

export async function getSessionArchive(projectId: any, opts: any = {}) {
  const { types, limit = 50, tags, minSignal, before } = opts
  const rank: any = { accepted: 4, partial: 3, neutral: 2, rejected: 1 }
  const minRank = minSignal ? rank[minSignal] || 0 : 0

  // Walk the index newest-first and stop at `limit` matches. This used to load
  // the project's whole archive, filter, sort and slice — the cost of showing
  // the last 50 entries grew with every entry ever written.
  const upper = before ? [projectId, before] : [projectId, Dexie.maxKey]
  return db.sessionArchive
    .where('[projectId+timestamp]')
    .between([projectId, Dexie.minKey], upper, true, false)
    .reverse()
    .filter((e: any) => {
      if (types && types.length > 0 && !types.includes(e.type)) return false
      if (tags && tags.length > 0 && !tags.some((t: any) => e.tags?.includes(t))) return false
      if (minRank && (rank[e.signal] || 0) < minRank) return false
      return true
    })
    .limit(limit)
    .toArray()
}

export async function searchSessionArchive(projectId: any, query: any) {
  const entries = await db.sessionArchive.where('projectId').equals(projectId).toArray()
  const lower = query.toLowerCase()
  return entries
    .filter((e: any) => {
      if (e.type?.toLowerCase().includes(lower)) return true
      if (e.signal?.toLowerCase().includes(lower)) return true
      if (e.tags?.some((t: any) => t.toLowerCase().includes(lower))) return true
      if (e.data) {
        const str = typeof e.data === 'string' ? e.data : JSON.stringify(e.data)
        if (str.toLowerCase().includes(lower)) return true
      }
      return false
    })
    .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))
}

export async function saveStateSnapshot(projectId: any, sessionId: any, state: any) {
  const id = await db.storyStateSnapshots.add({
    projectId,
    sessionId,
    state,
    timestamp: new Date().toISOString()
  })
  // Bounded history: one row per save used to accumulate for the life of the
  // project, and every read of "the latest" paid for all of them.
  const stale = await newestFirst(db.storyStateSnapshots, projectId)
    .offset(STATE_SNAPSHOT_CAP)
    .primaryKeys()
  if (stale.length) await db.storyStateSnapshots.bulkDelete(stale)
  return id
}

export async function getLatestStateSnapshot(projectId: any) {
  return (await newestFirst(db.storyStateSnapshots, projectId).first()) || null
}

export async function getStateSnapshotHistory(projectId: any, limit = 20) {
  return newestFirst(db.storyStateSnapshots, projectId).limit(limit).toArray()
}

export async function saveAuthorProfile(projectId: any, profile: any) {
  const safe = JSON.parse(JSON.stringify(profile))
  const existing = await db.authorProfile.where('projectId').equals(projectId).first()
  if (existing) {
    await db.authorProfile.update(existing.id, { ...safe, updatedAt: new Date().toISOString() })
    return existing.id
  }
  return db.authorProfile.add({ projectId, ...safe, updatedAt: new Date().toISOString() })
}

export async function getAuthorProfile(projectId: any) {
  return db.authorProfile.where('projectId').equals(projectId).first()
}

export async function pruneSessionArchive(projectId: any, olderThanDays = 90) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)
  const cutoffStr = cutoff.toISOString()
  const entries = await db.sessionArchive
    .where('projectId')
    .equals(projectId)
    .filter((e: any) => e.timestamp < cutoffStr)
    .toArray()
  const ids = entries.map((e: any) => e.id)
  await db.sessionArchive.bulkDelete(ids)
  return ids.length
}
