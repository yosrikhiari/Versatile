import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  addSnapshot,
  getSnapshots,
  getSnapshot,
  deleteSnapshot,
  updateSubsection
} from '../services/dbService'
// eslint-disable-next-line no-restricted-imports
import { useLoading } from '../composables/useLoading'

export const useSnapshotStore = defineStore('snapshot', () => {
  const {
    items: snapshots,
    isLoading,
    load: loadSnapshots
  } = useLoading((projectId, chapterId = null) => getSnapshots(projectId, chapterId))
  const autoSaveEnabled = ref(true)
  const autoSaveInterval = ref(5)
  let intervalTimer = null

  async function saveNewSnapshot(projectId, chapterId, content, label = '') {
    if (!projectId || chapterId === null) return null
    const id = await addSnapshot(projectId, chapterId, content, label)
    await loadSnapshots(projectId, chapterId)
    return id
  }

  async function restoreSnapshot(id, projectId) {
    const snapshot = await getSnapshot(id)
    if (!snapshot) return null
    const { chapterId, content } = snapshot
    await updateSubsection(chapterId, { content })
    await loadSnapshots(projectId, chapterId)
    return snapshot
  }

  async function removeSnapshot(id, projectId) {
    const snapshot = await getSnapshot(id)
    await deleteSnapshot(id)
    if (snapshot) {
      await loadSnapshots(projectId, snapshot.chapterId)
    }
  }

  function startAutoSave(projectId, chapterId, getContentFn) {
    stopAutoSave()
    if (!autoSaveEnabled.value) return
    intervalTimer = setInterval(
      async () => {
        const content = getContentFn()
        if (content) {
          await saveNewSnapshot(projectId, chapterId, content, 'auto')
        }
      },
      autoSaveInterval.value * 60 * 1000
    )
  }

  function stopAutoSave() {
    if (intervalTimer) {
      clearInterval(intervalTimer)
      intervalTimer = null
    }
  }

  function setAutoSaveEnabled(enabled) {
    autoSaveEnabled.value = enabled
  }

  function setAutoSaveInterval(minutes) {
    autoSaveInterval.value = minutes
  }

  return {
    snapshots,
    isLoading,
    autoSaveEnabled,
    autoSaveInterval,
    loadSnapshots,
    saveNewSnapshot,
    restoreSnapshot,
    removeSnapshot,
    startAutoSave,
    stopAutoSave,
    setAutoSaveEnabled,
    setAutoSaveInterval
  }
})
