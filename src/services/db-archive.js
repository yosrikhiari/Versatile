import { db } from './db-core'
import { SIGNAL } from '../config/archive'

export async function saveSessionArchive(projectId, type, data, tags, signal) {
  if (!signal || ![SIGNAL.ACCEPTED, SIGNAL.PARTIAL, SIGNAL.NEUTRAL, SIGNAL.REJECTED].includes(signal)) {
    throw new Error(`saveSessionArchive: signal is required and must be one of accepted/partial/neutral/rejected (got ${signal})`)
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

export async function getSessionArchive(projectId, opts = {}) {
  const { types, limit = 50, tags, minSignal, before } = opts
  let entries = await db.sessionArchive.where('projectId').equals(projectId).toArray()
  if (types && types.length > 0) {
    entries = entries.filter(e => types.includes(e.type))
  }
  if (tags && tags.length > 0) {
    entries = entries.filter(e => tags.some(t => e.tags.includes(t)))
  }
  if (minSignal) {
    const rank = { accepted: 4, partial: 3, neutral: 2, rejected: 1 }
    const minRank = rank[minSignal] || 0
    entries = entries.filter(e => (rank[e.signal] || 0) >= minRank)
  }
  if (before) {
    entries = entries.filter(e => e.timestamp < before)
  }
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return entries.slice(0, limit)
}

export async function searchSessionArchive(projectId, query) {
  const entries = await db.sessionArchive.where('projectId').equals(projectId).toArray()
  const lower = query.toLowerCase()
  return entries.filter(e => {
    if (e.type && e.type.toLowerCase().includes(lower)) return true
    if (e.signal && e.signal.toLowerCase().includes(lower)) return true
    if (e.tags && e.tags.some(t => t.toLowerCase().includes(lower))) return true
    if (e.data) {
      const str = typeof e.data === 'string' ? e.data : JSON.stringify(e.data)
      if (str.toLowerCase().includes(lower)) return true
    }
    return false
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export async function saveStateSnapshot(projectId, sessionId, state) {
  return db.storyStateSnapshots.add({
    projectId,
    sessionId,
    state,
    timestamp: new Date().toISOString()
  })
}

export async function getLatestStateSnapshot(projectId) {
  const entries = await db.storyStateSnapshots
    .where('projectId').equals(projectId)
    .toArray()
  if (entries.length === 0) return null
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return entries[0]
}

export async function getStateSnapshotHistory(projectId, limit = 20) {
  const entries = await db.storyStateSnapshots
    .where('projectId').equals(projectId)
    .toArray()
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return entries.slice(0, limit)
}

export async function saveAuthorProfile(projectId, profile) {
  const safe = JSON.parse(JSON.stringify(profile))
  const existing = await db.authorProfile.where('projectId').equals(projectId).first()
  if (existing) {
    await db.authorProfile.update(existing.id, { ...safe, updatedAt: new Date().toISOString() })
    return existing.id
  }
  return db.authorProfile.add({ projectId, ...safe, updatedAt: new Date().toISOString() })
}

export async function getAuthorProfile(projectId) {
  return db.authorProfile.where('projectId').equals(projectId).first()
}

export async function pruneSessionArchive(projectId, olderThanDays = 90) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - olderThanDays)
  const cutoffStr = cutoff.toISOString()
  const entries = await db.sessionArchive
    .where('projectId').equals(projectId)
    .filter(e => e.timestamp < cutoffStr)
    .toArray()
  const ids = entries.map(e => e.id)
  await db.sessionArchive.bulkDelete(ids)
  return ids.length
}
