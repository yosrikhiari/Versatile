import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  saveSessionArchive as dbSaveSessionArchive,
  getSessionArchive as dbGetSessionArchive,
  searchSessionArchive as dbSearchSessionArchive,
  saveStateSnapshot as dbSaveStateSnapshot,
  getLatestStateSnapshot as dbGetLatestStateSnapshot,
  getStateSnapshotHistory as dbGetStateSnapshotHistory,
  saveAuthorProfile as dbSaveAuthorProfile,
  getAuthorProfile as dbGetAuthorProfile,
  pruneSessionArchive as dbPruneSessionArchive
} from '../services/dbService'
import { SIGNAL, ARCHIVE_TYPES } from '../config/archive'

export const useArchiveStore = defineStore('archive', () => {
  const archivedSessions = ref([])
  const stateSnapshots = ref([])
  const currentStateSnapshot = ref(null)
  const archiveSearchResults = ref([])
  const isLoading = ref(false)

  async function saveInteraction(projectId, type, data, tags = [], signal) {
    if (signal === null || signal === undefined) {
      throw new Error(`saveInteraction: signal is required. Caller: ${type}`)
    }
    return dbSaveSessionArchive(projectId, type, data, tags, signal)
  }

  async function loadSessionHistory(projectId, opts = {}) {
    isLoading.value = true
    try {
      archivedSessions.value = await dbGetSessionArchive(projectId, opts)
    } finally {
      isLoading.value = false
    }
  }

  async function searchArchive(projectId, query) {
    isLoading.value = true
    try {
      archiveSearchResults.value = await dbSearchSessionArchive(projectId, query)
    } finally {
      isLoading.value = false
    }
  }

  async function saveEndOfSessionState(projectId, sessionId, state) {
    const id = await dbSaveStateSnapshot(projectId, sessionId, state)
    currentStateSnapshot.value = { id, projectId, sessionId, state, timestamp: new Date().toISOString() }
    await loadStateSnapshots(projectId)
    await saveInteraction(projectId, ARCHIVE_TYPES.SESSION_END, state, ['session_end'], SIGNAL.ACCEPTED)
    return id
  }

  async function loadStateSnapshots(projectId) {
    stateSnapshots.value = await dbGetStateSnapshotHistory(projectId)
    const latest = await dbGetLatestStateSnapshot(projectId)
    if (latest) {
      currentStateSnapshot.value = latest
    }
  }

  async function saveAuthorProfileData(projectId, profile) {
    return dbSaveAuthorProfile(projectId, profile)
  }

  async function loadAuthorProfile(projectId) {
    return dbGetAuthorProfile(projectId)
  }

  async function prune(projectId, olderThanDays = 90) {
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
    loadStateSnapshots,
    saveAuthorProfileData,
    loadAuthorProfile,
    prune
  }
})
