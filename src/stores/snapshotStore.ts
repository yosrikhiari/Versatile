import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  addSnapshot,
  getSnapshots,
  getSnapshot,
  deleteSnapshot,
  updateSubsection
} from '../services/dbService'
import { useLoading } from '../utils/useLoading'

export const useSnapshotStore = defineStore('snapshot', () => {
  const {
    items: snapshots,
    isLoading,
    load: loadSnapshots
  } = useLoading((projectId, chapterId = null) => getSnapshots(projectId, chapterId))
  const autoSaveEnabled = ref(true)
  const autoSaveInterval = ref(5)
  let intervalTimer: ReturnType<typeof setInterval> | null = null

  async function saveNewSnapshot(projectId: any, chapterId: any, content: any, label = '') {
    if (!projectId || chapterId === null) return null
    const id = await addSnapshot(projectId, chapterId, content, label)
    await loadSnapshots(projectId, chapterId)
    return id
  }

  async function restoreSnapshot(id: any, projectId: any) {
    const snapshot = await getSnapshot(id)
    if (!snapshot) return null
    const { chapterId, content } = snapshot
    await updateSubsection(chapterId, { content })
    await loadSnapshots(projectId, chapterId)
    return snapshot
  }

  async function removeSnapshot(id: any, projectId: any) {
    const snapshot = await getSnapshot(id)
    await deleteSnapshot(id)
    if (snapshot) {
      await loadSnapshots(projectId, snapshot.chapterId)
    }
  }

  function startAutoSave(projectId: any, chapterId: any, getContentFn: any) {
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

  function setAutoSaveEnabled(enabled: any) {
    autoSaveEnabled.value = enabled
  }

  function setAutoSaveInterval(minutes: any) {
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
