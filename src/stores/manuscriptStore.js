import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getChapters, addChapter, updateChapter, deleteChapter,
  getScenes, addScene, updateScene, deleteScene, reorderScenes, reorderChapters,
  getStoryElements, addStoryElement, updateStoryElement, deleteStoryElement,
  getCharacterRelationships, addCharacterRelationship, updateCharacterRelationship, deleteCharacterRelationship
} from '../services/dbService'
import { warmEmbeddingCache } from '../composables/useManuscriptContext'

export const useManuscriptStore = defineStore('manuscript', () => {
  const chapters = ref([])
  const scenes = ref([])
  const storyElements = ref([])
  const relationships = ref([])
  const activeChapterId = ref(null)
  const activeSceneId = ref(null)

  const sortedChapters = computed(() => {
    return [...chapters.value].sort((a, b) => (a.order || 0) - (b.order || 0))
  })

  const activeChapter = computed(() => {
    return chapters.value.find(c => c.id === activeChapterId.value)
  })

  const activeScene = computed(() => {
    return scenes.value.find(s => s.id === activeSceneId.value)
  })

  const scenesByChapter = computed(() => {
    const grouped = {}
    for (const scene of scenes.value) {
      if (!grouped[scene.chapterId]) {
        grouped[scene.chapterId] = []
      }
      grouped[scene.chapterId].push(scene)
    }
    for (const key in grouped) {
      grouped[key].sort((a, b) => (a.order || 0) - (b.order || 0))
    }
    return grouped
  })

  async function loadManuscript(projectId) {
    chapters.value = await getChapters(projectId)
    scenes.value = await getScenes(projectId)
    storyElements.value = await getStoryElements(projectId)
    relationships.value = await getCharacterRelationships(projectId)
    warmEmbeddingCache(projectId).catch((err) => {
      console.error('Failed to warm embedding cache:', err)
    })
  }

  async function addChapterData(projectId, data) {
    const order = chapters.value.length
    const id = await addChapter(projectId, { ...data, order, status: 'planning' })
    chapters.value.push({ id, projectId, order, status: 'planning', ...data })
    return id
  }

  async function updateChapterData(id, data, projectId) {
    await updateChapter(id, data)
    const index = chapters.value.findIndex(c => c.id === id)
    if (index !== -1) {
      chapters.value[index] = { ...chapters.value[index], ...data }
    }
  }

  async function deleteChapterData(id, projectId) {
    const chapterScenes = scenes.value.filter(s => s.chapterId === id)
    for (const scene of chapterScenes) {
      await deleteScene(scene.id)
    }
    await deleteChapter(id)
    chapters.value = chapters.value.filter(c => c.id !== id)
    scenes.value = scenes.value.filter(s => s.chapterId !== id)
  }

  async function reorderChaptersData(chapterIds, projectId) {
    await reorderChapters(chapterIds)
    chapterIds.forEach((id, index) => {
      const chapter = chapters.value.find(c => c.id === id)
      if (chapter) chapter.order = index
    })
  }

  async function addSceneData(projectId, chapterId, data) {
    const chapterScenes = scenes.value.filter(s => s.chapterId === chapterId)
    const order = chapterScenes.length
    const id = await addScene(projectId, { ...data, chapterId, order })
    scenes.value.push({ id, projectId, chapterId, order, ...data })
    return id
  }

  async function updateSceneData(id, data, projectId) {
    await updateScene(id, data)
    const index = scenes.value.findIndex(s => s.id === id)
    if (index !== -1) {
      scenes.value[index] = { ...scenes.value[index], ...data }
    }
  }

  async function deleteSceneData(id, projectId) {
    await deleteScene(id)
    scenes.value = scenes.value.filter(s => s.id !== id)
  }

  async function reorderScenesData(sceneIds, projectId) {
    await reorderScenes(sceneIds)
    sceneIds.forEach((id, index) => {
      const scene = scenes.value.find(s => s.id === id)
      if (scene) scene.order = index
    })
  }

  async function addStoryElementData(projectId, data) {
    const id = await addStoryElement(projectId, data)
    storyElements.value.push({ id, projectId, ...data })
    return id
  }

  async function updateStoryElementData(id, data, projectId) {
    await updateStoryElement(id, data)
    const index = storyElements.value.findIndex(e => e.id === id)
    if (index !== -1) {
      storyElements.value[index] = { ...storyElements.value[index], ...data }
    }
  }

  async function deleteStoryElementData(id, projectId) {
    await deleteStoryElement(id)
    storyElements.value = storyElements.value.filter(e => e.id !== id)
  }

  async function addRelationshipData(projectId, data) {
    const id = await addCharacterRelationship(projectId, data)
    relationships.value.push({ id, projectId, ...data })
    return id
  }

  async function updateRelationshipData(id, data, projectId) {
    await updateCharacterRelationship(id, data)
    const index = relationships.value.findIndex(r => r.id === id)
    if (index !== -1) {
      relationships.value[index] = { ...relationships.value[index], ...data }
    }
  }

  async function deleteRelationshipData(id, projectId) {
    await deleteCharacterRelationship(id)
    relationships.value = relationships.value.filter(r => r.id !== id)
  }

  function setActiveChapter(id) {
    activeChapterId.value = id
  }

  function setActiveScene(id) {
    activeSceneId.value = id
  }

  return {
    chapters,
    scenes,
    storyElements,
    relationships,
    activeChapterId,
    activeSceneId,
    sortedChapters,
    activeChapter,
    activeScene,
    scenesByChapter,
    loadManuscript,
    addChapterData,
    updateChapterData,
    deleteChapterData,
    reorderChaptersData,
    addSceneData,
    updateSceneData,
    deleteSceneData,
    reorderScenesData,
    addStoryElementData,
    updateStoryElementData,
    deleteStoryElementData,
    addRelationshipData,
    updateRelationshipData,
    deleteRelationshipData,
    setActiveChapter,
    setActiveScene
  }
})