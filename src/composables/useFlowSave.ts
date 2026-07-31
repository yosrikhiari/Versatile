import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useSnapshotStore } from '../stores/snapshotStore'
import { useDialogueIndexer } from '../composables/useDialogueIndexer'
import { countWords, stripHtmlTags } from '../utils/textUtils'

let _pendingSubsectionId: any = null
let _pendingSectionId: any = null
let _flushResolver: ((value?: unknown) => void) | null = null

/** Idle gap before an autosave fires. */
const SAVE_DEBOUNCE_MS = 10_000

export function useFlowSave(editorRef: any) {
  const projectStore = useProjectStore()
  const manuscriptStore = useManuscriptStore()
  const snapshotStore = useSnapshotStore()
  const dialogueIndexer = useDialogueIndexer()
  const isSaving = ref(false)

  /**
   * Hand-rolled debounce rather than `useDebounceFn`.
   *
   * VueUse's debounced function has no `flush()` — that is lodash's API — so
   * the old `(debouncedSave as any).flush()` threw `flush is not a function`
   * on *every* unmount. Two things followed: the `beforeUnmount` hook aborted
   * part-way, which left route remounts half-torn-down and made navigation
   * need a manual refresh; and the pending save never ran, so leaving the
   * editor within the debounce window silently dropped what had just been
   * typed. A timer we own gives a real flush and a real cancel.
   */
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let hasUnsavedWork = false

  const performSave = async () => {
    hasUnsavedWork = false
    if (projectStore.currentProjectId) {
      isSaving.value = true
      const content = editorRef.value?.getHTML() || ''
      const saveSubId = _pendingSubsectionId
      const saveSecId = _pendingSectionId
      _pendingSubsectionId = null
      _pendingSectionId = null

      // Saved alongside the content, not derived later. Every surface that
      // reports progress — the breadcrumb, the Section Manager, the outline,
      // and the continuation survey that decides which scenes still need
      // prose — reads the stored `wordCount`. Writing content without it left
      // hand-written scenes indistinguishable from empty ones: "0 words" beside
      // text you had just typed.
      const wordCount = countWords(stripHtmlTags(content))

      if (saveSubId) {
        await manuscriptStore.updateSubsectionData(
          saveSubId,
          { content, wordCount },
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
          { content, wordCount },
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
  }

  function scheduleSave() {
    // Assigned unconditionally, null included.
    //
    // These only ever got *set*, never cleared, so the target could outlive the
    // thing being edited: open a scene, type, switch to the project document
    // inside the 10s debounce, and the next save wrote the document's text into
    // that scene — overwriting it with the wrong content entirely. The pending
    // target has to describe what is on screen now, not what was.
    _pendingSubsectionId = manuscriptStore.activeSubsectionId || null
    _pendingSectionId = _pendingSubsectionId ? null : manuscriptStore.activeSectionId || null
    hasUnsavedWork = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      performSave().catch((err) => console.error('[useFlowSave] autosave failed:', err))
    }, SAVE_DEBOUNCE_MS)
  }

  /**
   * Persist immediately. Called from `onBeforeUnmount`, which cannot await, so
   * the write is started and left to finish on its own — Dexie does not need
   * the component to stay alive.
   *
   * Nothing here may throw: an exception in an unmount hook aborts the rest of
   * the teardown, which is exactly how this broke route navigation before.
   */
  function flushSave() {
    try {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      if (!hasUnsavedWork) return
      performSave().catch((err) => console.error('[useFlowSave] flush failed:', err))
    } catch (err) {
      console.error('[useFlowSave] flush failed:', err)
    }
  }

  return {
    isSaving,
    scheduleSave,
    flushSave
  }
}
