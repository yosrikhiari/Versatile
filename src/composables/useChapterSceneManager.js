import { ref } from 'vue'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useProjectStore } from '../stores/projectStore'
import { CHAPTER_STATUSES } from '../config/statuses'
import { countWords } from '../utils/textUtils'

export { CHAPTER_STATUSES }

export function useChapterSceneManager() {
  const manuscriptStore = useManuscriptStore()
  const projectStore = useProjectStore()

  const editingScene = ref(null)
  const showSceneModal = ref(false)
  const activeChapterId = ref(null)
  const newScene = ref({ title: '', summary: '', content: '', tags: [] })

  function getStatusColor(status) {
    return CHAPTER_STATUSES.find(s => s.value === status)?.color || '#6b7280'
  }

  function getStatusLabel(status) {
    return CHAPTER_STATUSES.find(s => s.value === status)?.label || status
  }

  function getSceneWordCount(scene) {
    return countWords(scene.content)
  }

  function getChapterWordCount(chapterId) {
    const scenes = manuscriptStore.scenesByChapter[chapterId] || []
    return scenes.reduce((sum, s) => sum + getSceneWordCount(s), 0)
  }

  function openAddScene(chapterId) {
    editingScene.value = null
    newScene.value = { title: '', summary: '', content: '' }
    activeChapterId.value = chapterId
    showSceneModal.value = true
  }

  function openEditScene(scene) {
    editingScene.value = scene
    newScene.value = { 
      title: scene.title || '',
      summary: scene.summary || '', 
      content: scene.content || '',
      tags: scene.tags ? [...scene.tags] : []
    }
    showSceneModal.value = true
  }

  function saveScene() {
    if (!newScene.value.title?.trim()) return

    if (editingScene.value) {
      manuscriptStore.updateSceneData(
        editingScene.value.id,
        { 
          title: newScene.value.title, 
          summary: newScene.value.summary, 
          content: newScene.value.content,
          tags: newScene.value.tags
        },
        projectStore.currentProjectId
      )
    } else if (activeChapterId.value) {
      manuscriptStore.addSceneData(projectStore.currentProjectId, activeChapterId.value, newScene.value)
    }

    showSceneModal.value = false
  }

  function deleteScene(scene) {
    if (confirm(`Delete "${scene.title || 'Untitled'}"?`)) {
      manuscriptStore.deleteSceneData(scene.id, projectStore.currentProjectId)
    }
  }

  return {
    editingScene,
    showSceneModal,
    activeChapterId,
    newScene,
    CHAPTER_STATUSES,
    getStatusColor,
    getStatusLabel,
    getSceneWordCount,
    getChapterWordCount,
    openAddScene,
    openEditScene,
    saveScene,
    deleteScene
  }
}