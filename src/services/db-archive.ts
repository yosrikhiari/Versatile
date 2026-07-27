import { db as _db } from './db-core'
import { SIGNAL } from '../config/archive'

const db = _db as any

export async function saveSessionArchive(projectId: any, type: any, data: any, tags: any, signal: any) {
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
  let entries = await db.sessionArchive.where('projectId').equals(projectId).toArray()
  if (types && types.length > 0) {
    entries = entries.filter((e: any) => types.includes(e.type))
  }
  if (tags && tags.length > 0) {
    entries = entries.filter((e: any) => tags.some((t: any) => e.tags.includes(t)))
  }
  if (minSignal) {
    const rank: any = { accepted: 4, partial: 3, neutral: 2, rejected: 1 }
    const minRank = rank[minSignal] || 0
    entries = entries.filter((e: any) => (rank[e.signal] || 0) >= minRank)
  }
  if (before) {
    entries = entries.filter((e: any) => e.timestamp < before)
  }
  entries.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))
  return entries.slice(0, limit)
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
  return db.storyStateSnapshots.add({
    projectId,
    sessionId,
    state,
    timestamp: new Date().toISOString()
  })
}

export async function getLatestStateSnapshot(projectId: any) {
  const entries = await db.storyStateSnapshots.where('projectId').equals(projectId).toArray()
  if (entries.length === 0) return null
  entries.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))
  return entries[0]
}

export async function getStateSnapshotHistory(projectId: any, limit = 20) {
  const entries = await db.storyStateSnapshots.where('projectId').equals(projectId).toArray()
  entries.sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))
  return entries.slice(0, limit)
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
