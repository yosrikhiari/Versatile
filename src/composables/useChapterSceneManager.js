import { ref } from 'vue'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useProjectStore } from '../stores/projectStore'
import { SECTION_STATUSES } from '../config/statuses'
import { countWords } from '../utils/textUtils'
import { useNotifications } from './useNotifications'

export { SECTION_STATUSES }

export function useChapterSceneManager() {
  const manuscriptStore = useManuscriptStore()
  const projectStore = useProjectStore()
  const { showConfirm } = useNotifications()

  const editingScene = ref(null)
  const showSceneModal = ref(false)
  const activeSectionId = ref(null)
  const newScene = ref({ title: '', summary: '', content: '', tags: [] })

  function getStatusColor(status) {
    return SECTION_STATUSES.find(s => s.value === status)?.color || '#6b7280'
  }

  function getStatusLabel(status) {
    return SECTION_STATUSES.find(s => s.value === status)?.label || status
  }

  function getSubsectionWordCount(subsection) {
    return countWords(subsection.content)
  }

  function getSectionWordCount(sectionId) {
    const subsections = manuscriptStore.subsectionsBySection[sectionId] || []
    return subsections.reduce((sum, s) => sum + getSubsectionWordCount(s), 0)
  }

  function openAddSubsection(sectionId) {
    editingScene.value = null
    newScene.value = { title: '', summary: '', content: '' }
    activeSectionId.value = sectionId
    showSceneModal.value = true
  }

  function openEditSubsection(subsection) {
    editingScene.value = subsection
    newScene.value = { 
      title: subsection.title || '',
      summary: subsection.summary || '', 
      content: subsection.content || '',
      tags: subsection.tags ? [...subsection.tags] : []
    }
    showSceneModal.value = true
  }

  function saveSubsection() {
    if (!newScene.value.title?.trim()) return

    if (editingScene.value) {
      manuscriptStore.updateSubsectionData(
        editingScene.value.id,
        { 
          title: newScene.value.title, 
          summary: newScene.value.summary, 
          content: newScene.value.content,
          tags: newScene.value.tags
        },
        projectStore.currentProjectId
      )
    } else if (activeSectionId.value) {
      manuscriptStore.addSubsectionData(projectStore.currentProjectId, activeSectionId.value, newScene.value)
    }

    showSceneModal.value = false
  }

  async function deleteSubsection(subsection) {
    if (await showConfirm('Delete Scene', `Delete "${subsection.title || 'Untitled'}"?`, 'Delete', 'danger')) {
      manuscriptStore.deleteSubsectionData(subsection.id, projectStore.currentProjectId)
    }
  }

  return {
    editingScene,
    showSceneModal,
    activeSectionId,
    newScene,
    SECTION_STATUSES,
    getStatusColor,
    getStatusLabel,
    getSubsectionWordCount,
    getSectionWordCount,
    openAddSubsection,
    openEditSubsection,
    saveSubsection,
    deleteSubsection
  }
}
