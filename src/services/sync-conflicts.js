export const CONFLICT_STRATEGIES = {
  LAST_WRITE_WINS: 'last-write-wins',
  SKIP_CONFLICTED: 'skip-conflicted',
  MANUAL: 'manual'
}

export function hasPendingChanges(localRecord) {
  return localRecord && localRecord.syncStatus && localRecord.syncStatus !== 'synced'
}

export function skipConflicted(localRecord) {
  return hasPendingChanges(localRecord)
}

export function lastWriteWins(localRecord, apiRecord) {
  const localTime = localRecord?.lastSyncedAt || localRecord?.updatedAt || 0
  const apiTime = apiRecord?.updatedAt || apiRecord?.lastSyncedAt || 0
  return new Date(apiTime) > new Date(localTime)
}

export function compareTimestamps(a, b) {
  const ta = a?.updatedAt || a?.lastSyncedAt || 0
  const tb = b?.updatedAt || b?.lastSyncedAt || 0
  return new Date(ta) - new Date(tb)
}
