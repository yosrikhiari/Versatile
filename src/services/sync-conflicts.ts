export const CONFLICT_STRATEGIES = {
  LAST_WRITE_WINS: 'last-write-wins',
  SKIP_CONFLICTED: 'skip-conflicted',
  MANUAL: 'manual'
} as const

interface SyncRecord {
  syncStatus?: string
  lastSyncedAt?: string | number
  updatedAt?: string | number
}

export function hasPendingChanges(localRecord: SyncRecord | null | undefined): boolean {
  return !!(localRecord && localRecord.syncStatus && localRecord.syncStatus !== 'synced')
}

export function skipConflicted(localRecord: SyncRecord | null | undefined): boolean {
  return hasPendingChanges(localRecord)
}

export function lastWriteWins(
  localRecord: SyncRecord | null | undefined,
  apiRecord: SyncRecord | null | undefined
): boolean {
  const localTime = localRecord?.lastSyncedAt || localRecord?.updatedAt || 0
  const apiTime = apiRecord?.updatedAt || apiRecord?.lastSyncedAt || 0
  return new Date(apiTime).getTime() > new Date(localTime).getTime()
}

export function compareTimestamps(
  a: SyncRecord | null | undefined,
  b: SyncRecord | null | undefined
): number {
  const ta = a?.updatedAt || a?.lastSyncedAt || 0
  const tb = b?.updatedAt || b?.lastSyncedAt || 0
  return new Date(ta).getTime() - new Date(tb).getTime()
}
