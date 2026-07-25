import { ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useProjectStore } from '../stores/projectStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useSnapshotStore } from '../stores/snapshotStore'
import { useDialogueIndexer } from '../composables/useDialogueIndexer'

let _pendingSubsectionId = null
let _pendingSectionId = null
let _flushResolver = null

export function useFlowSave(editorRef) {
  const projectStore = useProjectStore()
  const manuscriptStore = useManuscriptStore()
  const snapshotStore = useSnapshotStore()
  const dialogueIndexer = useDialogueIndexer()
  const isSaving = ref(false)

  const debouncedSave = useDebounceFn(async () => {
    if (projectStore.currentProjectId) {
      isSaving.value = true
      const content = editorRef.value?.getHTML() || ''
      const saveSubId = _pendingSubsectionId
      const saveSecId = _pendingSectionId
      _pendingSubsectionId = null
      _pendingSectionId = null

      if (saveSubId) {
        await manuscriptStore.updateSubsectionData(
          saveSubId,
          { content },
          projectStore.currentProjectId
        )
        const sub = manuscriptStore.subsections.find((s) => s.id === saveSubId)
        if (sub) {
          dialogueIndexer
            .reindexSubsection(sub)
            .catch((err) => console.error('[FlowEditor] dialogue reindex failed:', err))
        }
      } else if (saveSecId) {
        await manuscriptStore.updateSectionData(
          saveSecId,
          { content },
          projectStore.currentProjectId
        )
      } else {
        projectStore.saveDocumentDebounced()
      }

      if (_flushResolver) {
        _flushResolver()
        _flushResolver = null
      }

      await snapshotStore.saveNewSnapshot(
        projectStore.currentProjectId,
        saveSubId || saveSecId || null,
        content,
        'manuscript auto-save'
      )
      setTimeout(() => {
        isSaving.value = false
      }, 1500)
    }
  }, 10000)

  function scheduleSave() {
    if (manuscriptStore.activeSubsectionId) {
      _pendingSubsectionId = manuscriptStore.activeSubsectionId
    } else if (manuscriptStore.activeSectionId) {
      _pendingSectionId = manuscriptStore.activeSectionId
    }
    debouncedSave()
  }

  function flushSave() {
    debouncedSave.flush()
  }

  return {
    isSaving,
    scheduleSave,
    flushSave
  }
}
