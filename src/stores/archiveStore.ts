import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  saveSessionArchive as dbSaveSessionArchive,
  getSessionArchive as dbGetSessionArchive,
  searchSessionArchive as dbSearchSessionArchive,
  saveStateSnapshot as dbSaveStateSnapshot,
  getStateSnapshotHistory as dbGetStateSnapshotHistory,
  saveAuthorProfile as dbSaveAuthorProfile,
  getAuthorProfile as dbGetAuthorProfile,
  pruneSessionArchive as dbPruneSessionArchive
} from '../services/dbService'
import { SIGNAL, ARCHIVE_TYPES } from '../config/archive'

export const useArchiveStore = defineStore('archive', () => {
  const archivedSessions = ref<any[]>([])
  const stateSnapshots = ref<any[]>([])
  const currentStateSnapshot = ref<any | null>(null)
  const archiveSearchResults = ref<any[]>([])
  const isLoading = ref(false)

  async function saveInteraction(
    projectId: any,
    type: any,
    data: any,
    tags: any = [],
    signal: any
  ) {
    if (signal === null || signal === undefined) {
      throw new Error(`saveInteraction: signal is required. Caller: ${type}`)
    }
    return dbSaveSessionArchive(projectId, type, data, tags, signal)
  }

  async function loadSessionHistory(projectId: any, opts: any = {}) {
    isLoading.value = true
    try {
      archivedSessions.value = await dbGetSessionArchive(projectId, opts)
    } finally {
      isLoading.value = false
    }
  }

  async function searchArchive(projectId: any, query: any) {
    isLoading.value = true
    try {
      archiveSearchResults.value = await dbSearchSessionArchive(projectId, query)
    } finally {
      isLoading.value = false
    }
  }

  /** How many state snapshots the drawer lists. */
  const STATE_HISTORY_LIMIT = 20

  /**
   * Persist a story-state snapshot and fold it into the loaded history in
   * place — no re-read of the table, which used to happen on every write.
   */
  async function saveStateSnapshot(projectId: any, sessionId: any, state: any) {
    const id = await dbSaveStateSnapshot(projectId, sessionId, state)
    const row = { id, projectId, sessionId, state, timestamp: new Date().toISOString() }
    currentStateSnapshot.value = row
    stateSnapshots.value = [row, ...stateSnapshots.value].slice(0, STATE_HISTORY_LIMIT)
    return id
  }

  /** A real end of session: the snapshot plus an archive entry the writer can browse. */
  async function saveEndOfSessionState(projectId: any, sessionId: any, state: any) {
    const id = await saveStateSnapshot(projectId, sessionId, state)
    await saveInteraction(
      projectId,
      ARCHIVE_TYPES.SESSION_END,
      state,
      ['session_end'],
      SIGNAL.ACCEPTED
    )
    return id
  }

  async function loadStateSnapshots(projectId: any) {
    // Newest first, so the head of the history is the latest — one read.
    stateSnapshots.value = await dbGetStateSnapshotHistory(projectId, STATE_HISTORY_LIMIT)
    if (stateSnapshots.value.length) currentStateSnapshot.value = stateSnapshots.value[0]
  }

  async function saveAuthorProfileData(projectId: any, profile: any) {
    return dbSaveAuthorProfile(projectId, profile)
  }

  async function loadAuthorProfile(projectId: any) {
    return dbGetAuthorProfile(projectId)
  }

  async function prune(projectId: any, olderThanDays: any = 90) {
    const deleted = await dbPruneSessionArchive(projectId, olderThanDays)
    await loadSessionHistory(projectId)
    return deleted
  }

  return {
    archivedSessions,
    stateSnapshots,
    currentStateSnapshot,
    archiveSearchResults,
    isLoading,
    saveInteraction,
    loadSessionHistory,
    searchArchive,
    saveEndOfSessionState,
    saveStateSnapshot,
    loadStateSnapshots,
    saveAuthorProfileData,
    loadAuthorProfile,
    prune
  }
})
