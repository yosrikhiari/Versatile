import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  getCharacters, addCharacter, updateCharacter, deleteCharacter,
  getLocations, addLocation, updateLocation, deleteLocation,
  getPlotThreads, addPlotThread, updatePlotThread, deletePlotThread,
  deleteCharacterRelationshipsByCharacter
} from '../services/dbService'
import {
  deleteGraphEdgesByEntity,
  removeEntityFromNodeInstances,
  removeEntityFromNodePositions,
  removeEntityFromNodeParents
} from '../services/db-graph'
import { useStoryDocuments } from '../composables/useStoryDocuments'
import { useProjectStore } from '../stores/projectStore'
import { saveVoiceProfile, loadVoiceProfile } from '../services/db-entities'

const DOC_REGEN_DEBOUNCE = 1500

export const useStoryBibleStore = defineStore('storyBible', () => {
  const characters = ref([])
  const locations = ref([])
  const plotThreads = ref([])
  const isLoading = ref(false)
  const loadError = ref(null)
  const storyBibleReady = ref(false)

  // Voice profile state
  const voiceProfile = reactive({
    isExtracted: false,
    profile: null,
    manuscriptSizeAtExtraction: null,
    lastUpdated: null,
    locked: false,
    supplementaryMergeCount: 0
  })

  let docsDebounceTimer = null

  function queueDocumentRegeneration(docTypes) {
    if (docsDebounceTimer) clearTimeout(docsDebounceTimer)
    docsDebounceTimer = setTimeout(async () => {
      const projectStore = useProjectStore()
      const projectId = projectStore.currentProjectId
      if (!projectId) return
      const storyDocs = useStoryDocuments()
      await Promise.all(docTypes.map(dt => storyDocs.regenerateDocument(projectId, dt).catch(err => {
        console.error(`[storyBibleStore] Failed to regenerate ${dt}:`, err)
      })))
    }, DOC_REGEN_DEBOUNCE)
  }

  async function loadAll(projectId) {
    isLoading.value = true
    loadError.value = null
    try {
      characters.value = await getCharacters(projectId)
      locations.value = await getLocations(projectId)
      plotThreads.value = await getPlotThreads(projectId)
      const storyDocs = useStoryDocuments()
      await storyDocs.regenerateAllDocuments(projectId)
      storyBibleReady.value = true
    } catch (e) {
      loadError.value = e.message
      console.error('[storyBibleStore] loadAll failed:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function addCharacterData(projectId, data, source = 'manual', chapterId = null) {
    const id = await addCharacter(projectId, { ...data, source, chapterId })
    characters.value.push({ id, projectId, ...data, source, chapterId, lastEditedAt: Date.now() })
    queueDocumentRegeneration(['characters', 'relationships'])
    return id
  }

  async function updateCharacterData(id, data, projectId) {
    await updateCharacter(id, { ...data, lastEditedAt: Date.now() })
    const index = characters.value.findIndex(c => c.id === id)
    if (index !== -1) {
      characters.value[index] = { ...characters.value[index], ...data, lastEditedAt: Date.now() }
    }
    queueDocumentRegeneration(['characters', 'relationships'])
  }

  async function deleteCharacterData(id, projectId) {
    await Promise.all([
      deleteCharacterRelationshipsByCharacter(id),
      deleteGraphEdgesByEntity(projectId, 'character', id),
      removeEntityFromNodeInstances(projectId, 'character', id),
      removeEntityFromNodePositions(projectId, 'character', id),
      removeEntityFromNodeParents(projectId, 'character', id)
    ])
    await deleteCharacter(id)
    characters.value = characters.value.filter(c => c.id !== id)
    queueDocumentRegeneration(['characters', 'relationships'])
  }

  async function addLocationData(projectId, data, source = 'manual', chapterId = null) {
    const id = await addLocation(projectId, { ...data, source, chapterId })
    locations.value.push({ id, projectId, ...data, source, chapterId })
    queueDocumentRegeneration(['world', 'relationships'])
    return id
  }

  async function updateLocationData(id, data, projectId) {
    await updateLocation(id, data)
    const index = locations.value.findIndex(l => l.id === id)
    if (index !== -1) {
      locations.value[index] = { ...locations.value[index], ...data }
    }
    queueDocumentRegeneration(['world', 'relationships'])
  }

  async function deleteLocationData(id, projectId) {
    await deleteLocation(id)
    locations.value = locations.value.filter(l => l.id !== id)
    queueDocumentRegeneration(['world', 'relationships'])
  }

  async function addPlotThreadData(projectId, data, source = 'manual', chapterId = null) {
    const maxOrder = plotThreads.value.reduce((max, t) => Math.max(max, t.timelineOrder ?? 0), 0)
    const id = await addPlotThread(projectId, { ...data, source, chapterId, timelineOrder: maxOrder + 1 })
    plotThreads.value.push({ id, projectId, ...data, source, chapterId, timelineOrder: maxOrder + 1 })
    queueDocumentRegeneration(['timeline', 'relationships'])
    return id
  }

  async function reorderPlotThreads(orderedIds) {
    await Promise.all(
      orderedIds.map((id, i) => {
        const thread = plotThreads.value.find(t => t.id === id)
        if (thread) thread.timelineOrder = i
        return updatePlotThread(id, { timelineOrder: i })
      })
    )
    queueDocumentRegeneration(['timeline'])
  }

  async function updatePlotThreadData(id, data, projectId) {
    await updatePlotThread(id, data)
    const index = plotThreads.value.findIndex(t => t.id === id)
    if (index !== -1) {
      plotThreads.value[index] = { ...plotThreads.value[index], ...data }
    }
    queueDocumentRegeneration(['timeline', 'relationships'])
  }

  async function deletePlotThreadData(id, projectId) {
    await deletePlotThread(id)
    plotThreads.value = plotThreads.value.filter(t => t.id !== id)
    queueDocumentRegeneration(['timeline', 'relationships'])
  }

  async function updateThreadStatus(id, status, projectId) {
    await updatePlotThread(id, { status })
    const index = plotThreads.value.findIndex(t => t.id === id)
    if (index !== -1) {
      plotThreads.value[index].status = status
    }
    queueDocumentRegeneration(['timeline'])
  }

  function getCharacterNames() {
    return characters.value.map(c => c.name)
  }

  // Voice profile methods
  async function setVoiceProfile(profile) {
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

  async function loadVoiceProfileForProject(projectId) {
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
    updateCharacterData,
    deleteCharacterData,
    addLocationData,
    updateLocationData,
    deleteLocationData,
    addPlotThreadData,
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