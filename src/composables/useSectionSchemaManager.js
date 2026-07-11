import { ref } from 'vue'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useProjectStore } from '../stores/projectStore'
import { SECTION_STATUSES } from '../config/statuses'
import { countWords } from '../utils/textUtils'
import { useNotifications } from './useNotifications'
import { useDialogueIndexer } from './useDialogueIndexer'

export { SECTION_STATUSES }

export function useSectionSchemaManager() {
  const manuscriptStore = useManuscriptStore()
  const projectStore = useProjectStore()
  const { showConfirm } = useNotifications()

  const editingSubsection = ref(null)
  const showSubsectionModal = ref(false)
  const activeSectionId = ref(null)
  const newSubsection = ref({ title: '', summary: '', content: '', tags: [] })

  function getStatusColor(status) {
    return SECTION_STATUSES.find((s) => s.value === status)?.color || '#6b7280'
  }

  function getStatusLabel(status) {
    return SECTION_STATUSES.find((s) => s.value === status)?.label || status
  }

  function getSubsectionWordCount(subsection) {
    return countWords(subsection.content)
  }

  function getSectionWordCount(sectionId) {
    const subsections = manuscriptStore.subsectionsBySection[sectionId] || []
    return subsections.reduce((sum, s) => sum + getSubsectionWordCount(s), 0)
  }

  function openAddSubsection(sectionId) {
    editingSubsection.value = null
    newSubsection.value = { title: '', summary: '', content: '' }
    activeSectionId.value = sectionId
    showSubsectionModal.value = true
  }

  function openEditSubsection(subsection) {
    editingSubsection.value = subsection
    newSubsection.value = {
      title: subsection.title || '',
      summary: subsection.summary || '',
      content: subsection.content || '',
      tags: subsection.tags ? [...subsection.tags] : []
    }
    showSubsectionModal.value = true
  }

  async function saveSubsection() {
    if (!newSubsection.value.title?.trim()) return

    const dialogueIndexer = useDialogueIndexer()

    if (editingSubsection.value) {
      await manuscriptStore.updateSubsectionData(
        editingSubsection.value.id,
        {
          title: newSubsection.value.title,
          summary: newSubsection.value.summary,
          content: newSubsection.value.content,
          tags: newSubsection.value.tags
        },
        projectStore.currentProjectId
      )
      const sub = manuscriptStore.subsections.find((s) => s.id === editingSubsection.value.id)
      if (sub?.content) {
        dialogueIndexer.reindexSubsection(sub)
      }
    } else if (activeSectionId.value) {
      const id = await manuscriptStore.addSubsectionData(
        projectStore.currentProjectId,
        activeSectionId.value,
        newSubsection.value
      )
      const sub = manuscriptStore.subsections.find((s) => s.id === id)
      if (sub?.content) {
        dialogueIndexer.reindexSubsection(sub)
      }
    }

    showSubsectionModal.value = false
  }

  async function deleteSubsection(subsection) {
    if (
      await showConfirm(
        'Delete Subsection',
        `Delete "${subsection.title || 'Untitled'}"?`,
        'Delete',
        'danger'
      )
    ) {
      manuscriptStore.deleteSubsectionData(subsection.id, projectStore.currentProjectId)
    }
  }

  return {
    editingSubsection,
    showSubsectionModal,
    activeSectionId,
    newSubsection,
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
