import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  getCharacters,
  addCharacter,
  addCharactersBatch,
  updateCharacter,
  deleteCharacter,
  getLocations,
  addLocation,
  addLocationsBatch,
  updateLocation,
  deleteLocation,
  getPlotThreads,
  addPlotThread,
  addPlotThreadsBatch,
  updatePlotThread,
  deletePlotThread,
  deleteCharacterRelationshipsByCharacter
} from '../services/dbService'
import {
  deleteGraphEdgesByEntity,
  removeEntityFromNodeInstances,
  removeEntityFromNodePositions,
  removeEntityFromNodeParents
} from '../services/db-graph'
import { useProjectStore } from '../stores/projectStore'
import { saveVoiceProfile, loadVoiceProfile } from '../services/db-entities'

const DOC_REGEN_DEBOUNCE = 1500

export const useStoryBibleStore = defineStore('storyBible', () => {
  const characters = ref<any[]>([])
  const locations = ref<any[]>([])
  const plotThreads = ref<any[]>([])
  const isLoading = ref(false)
  const loadError = ref<any | null>(null)
  const storyBibleReady = ref(false)

  // Voice profile state
  const voiceProfile = reactive<{
    isExtracted: boolean
    profile: any
    manuscriptSizeAtExtraction: any
    lastUpdated: any
    locked: boolean
    supplementaryMergeCount: number
  }>({
    isExtracted: false,
    profile: null,
    manuscriptSizeAtExtraction: null,
    lastUpdated: null,
    locked: false,
    supplementaryMergeCount: 0
  })

  let docsDebounceTimer: any = null

  function queueDocumentRegeneration(docTypes: any) {
    if (docsDebounceTimer) clearTimeout(docsDebounceTimer)
    docsDebounceTimer = setTimeout(async () => {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProjectId
      if (!projectId) return
      const { useStoryDocuments } = await import('../composables/useStoryDocuments')
      const storyDocs = useStoryDocuments()
      await Promise.all(
        docTypes.map((dt: any) =>
          storyDocs.regenerateDocument(projectId, dt).catch((err: any) => {
            console.error(`[storyBibleStore] Failed to regenerate ${dt}:`, err)
          })
        )
      )
    }, DOC_REGEN_DEBOUNCE)
  }

  async function loadAll(projectId: any) {
    isLoading.value = true
    loadError.value = null
    try {
      characters.value = await getCharacters(projectId)
      locations.value = await getLocations(projectId)
      plotThreads.value = await getPlotThreads(projectId)

      const { useStoryDocuments } = await import('../composables/useStoryDocuments')
      const storyDocs = useStoryDocuments()
      await storyDocs.regenerateAllDocuments(projectId)
      storyBibleReady.value = true
    } catch (e: any) {
      loadError.value = e.message
      console.error('[storyBibleStore] loadAll failed:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function addCharacterData(projectId: any, data: any, source = 'manual', chapterId: any = null) {
    const id = await addCharacter(projectId, { ...data, source, chapterId })
    characters.value.push({ id, projectId, ...data, source, chapterId, lastEditedAt: Date.now() })
    queueDocumentRegeneration(['characters', 'relationships'])
    return id
  }

  // Atomic bulk create: all characters inserted in one transaction, then the
  // reactive store is updated in sync. Mirrors addCharacterData's defaults so a
  // crash mid-bible leaves either all of this batch's characters or none.
  async function addCharactersBatchData(projectId: any, dataList: any) {
    if (!Array.isArray(dataList) || dataList.length === 0) return []
    const rows = dataList.map((data: any) => ({ source: 'manual', chapterId: null, ...data }))
    const ids = await addCharactersBatch(projectId, rows)
    ids.forEach((id: any, i: any) => {
      characters.value.push({ id, projectId, ...rows[i], lastEditedAt: Date.now() })
    })
    queueDocumentRegeneration(['characters', 'relationships'])
    return ids
  }

  async function updateCharacterData(id: any, data: any, _projectId: any) {
    await updateCharacter(id, { ...data, lastEditedAt: Date.now() })
    const index = characters.value.findIndex((c: any) => c.id === id)
    if (index !== -1) {
      characters.value[index] = { ...characters.value[index], ...data, lastEditedAt: Date.now() }
    }
    queueDocumentRegeneration(['characters', 'relationships'])
  }

  async function deleteCharacterData(id: any, projectId: any) {
    await Promise.all([
      deleteCharacterRelationshipsByCharacter(id),
      deleteGraphEdgesByEntity(projectId, 'character', id),
      removeEntityFromNodeInstances(projectId, 'character', id),
      removeEntityFromNodePositions(projectId, 'character', id),
      removeEntityFromNodeParents(projectId, 'character', id)
    ])
    await deleteCharacter(id)
      characters.value = characters.value.filter((c: any) => c.id !== id)
    queueDocumentRegeneration(['characters', 'relationships'])
  }

  async function addLocationData(projectId: any, data: any, source = 'manual', chapterId: any = null) {
    const id = await addLocation(projectId, { ...data, source, chapterId })
    locations.value.push({ id, projectId, ...data, source, chapterId })
    queueDocumentRegeneration(['world', 'relationships'])
    return id
  }

  // Atomic bulk create for locations (see addCharactersBatchData).
  async function addLocationsBatchData(projectId: any, dataList: any) {
    if (!Array.isArray(dataList) || dataList.length === 0) return []
    const rows = dataList.map((data: any) => ({ source: 'manual', chapterId: null, ...data }))
    const ids = await addLocationsBatch(projectId, rows)
    ids.forEach((id: any, i: any) => {
      locations.value.push({ id, projectId, ...rows[i] })
    })
    queueDocumentRegeneration(['world', 'relationships'])
    return ids
  }

  async function updateLocationData(id: any, data: any, _projectId: any) {
    await updateLocation(id, data)
    const index = locations.value.findIndex((l: any) => l.id === id)
    if (index !== -1) {
      locations.value[index] = { ...locations.value[index], ...data }
    }
    queueDocumentRegeneration(['world', 'relationships'])
  }

  async function deleteLocationData(id: any, projectId: any) {
    await Promise.all([
      deleteGraphEdgesByEntity(projectId, 'location', id),
      removeEntityFromNodeInstances(projectId, 'location', id),
      removeEntityFromNodePositions(projectId, 'location', id),
      removeEntityFromNodeParents(projectId, 'location', id)
    ])
    await deleteLocation(id)
    locations.value = locations.value.filter((l: any) => l.id !== id)
    queueDocumentRegeneration(['world', 'relationships'])
  }

  async function addPlotThreadData(projectId: any, data: any, source = 'manual', chapterId: any = null) {
    const maxOrder = plotThreads.value.reduce((max: any, t: any) => Math.max(max, t.timelineOrder ?? 0), 0)
    const id = await addPlotThread(projectId, {
      ...data,
      source,
      chapterId,
      timelineOrder: maxOrder + 1
    })
    plotThreads.value.push({
      id,
      projectId,
      ...data,
      source,
      chapterId,
      timelineOrder: maxOrder + 1
    })
    queueDocumentRegeneration(['timeline', 'relationships'])
    return id
  }

  // Atomic bulk create for plot threads (see addCharactersBatchData); assigns
  // sequential timelineOrder values continuing from the current max.
  async function addPlotThreadsBatchData(projectId: any, dataList: any) {
    if (!Array.isArray(dataList) || dataList.length === 0) return []
    let maxOrder = plotThreads.value.reduce((max: any, t: any) => Math.max(max, t.timelineOrder ?? 0), 0)
    const rows = dataList.map((data: any) => ({
      source: 'manual',
      chapterId: null,
      ...data,
      timelineOrder: ++maxOrder
    }))
    const ids = await addPlotThreadsBatch(projectId, rows)
    ids.forEach((id: any, i: any) => {
      plotThreads.value.push({ id, projectId, ...rows[i] })
    })
    queueDocumentRegeneration(['timeline', 'relationships'])
    return ids
  }

  async function reorderPlotThreads(orderedIds: any) {
    await Promise.all(
      orderedIds.map((id: any, i: any) => {
        const thread = plotThreads.value.find((t: any) => t.id === id)
        if (thread) thread.timelineOrder = i
        return updatePlotThread(id, { timelineOrder: i })
      })
    )
    queueDocumentRegeneration(['timeline'])
  }

  async function updatePlotThreadData(id: any, data: any, _projectId: any) {
    await updatePlotThread(id, data)
    const index = plotThreads.value.findIndex((t: any) => t.id === id)
    if (index !== -1) {
      plotThreads.value[index] = { ...plotThreads.value[index], ...data }
    }
    queueDocumentRegeneration(['timeline', 'relationships'])
  }

  async function deletePlotThreadData(id: any, projectId: any) {
    await Promise.all([
      deleteGraphEdgesByEntity(projectId, 'plotThread', id),
      removeEntityFromNodeInstances(projectId, 'plotThread', id),
      removeEntityFromNodePositions(projectId, 'plotThread', id),
      removeEntityFromNodeParents(projectId, 'plotThread', id)
    ])
    await deletePlotThread(id)
    plotThreads.value = plotThreads.value.filter((t: any) => t.id !== id)
    queueDocumentRegeneration(['timeline', 'relationships'])
  }

  async function updateThreadStatus(id: any, status: any, _projectId: any) {
    await updatePlotThread(id, { status })
    const index = plotThreads.value.findIndex((t: any) => t.id === id)
    if (index !== -1) {
      plotThreads.value[index].status = status
    }
    queueDocumentRegeneration(['timeline'])
  }

  function getCharacterNames() {
    return characters.value.map((c: any) => c.name)
  }

  // Voice profile methods
  async function setVoiceProfile(profile: any) {
    voiceProfile.profile = profile
    voiceProfile.isExtracted = true
    voiceProfile.lastUpdated = new Date()
    voiceProfile.manuscriptSizeAtExtraction = profile.manuscriptSizeAtExtraction
    voiceProfile.supplementaryMergeCount = profile.supplementaryMergeCount || 0

    // Save to IndexedDB
    const projectStore = useProjectStore()
    const projectId = projectStore.currentProjectId
    if (projectId) {
      try {
        await saveVoiceProfile(projectId, { ...voiceProfile })
      } catch (error) {
        console.error('[storyBibleStore] Failed to save voice profile:', error)
      }
    }
  }

  function lockVoiceProfile() {
    voiceProfile.locked = !voiceProfile.locked
  }

  async function loadVoiceProfileForProject(projectId: any) {
    try {
      const saved = await loadVoiceProfile(projectId)
      if (saved) {
        Object.assign(voiceProfile, saved)
      }
    } catch (error) {
      console.error('[storyBibleStore] Failed to load voice profile:', error)
    }
  }

  return {
    characters,
    locations,
    plotThreads,
    isLoading,
    loadError,
    storyBibleReady,
    voiceProfile,
    loadAll,
    addCharacterData,
    addCharactersBatchData,
    updateCharacterData,
    deleteCharacterData,
    addLocationData,
    addLocationsBatchData,
    updateLocationData,
    deleteLocationData,
    addPlotThreadData,
    addPlotThreadsBatchData,
    updatePlotThreadData,
    deletePlotThreadData,
    updateThreadStatus,
    reorderPlotThreads,
    getCharacterNames,
    setVoiceProfile,
    lockVoiceProfile,
    loadVoiceProfileForProject
  }
})
