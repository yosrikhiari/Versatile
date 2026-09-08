import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFlowSave } from '@/composables/useFlowSave'
import { useProjectStore } from '@/stores/projectStore'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useSnapshotStore } from '@/stores/snapshotStore'
import { useDialogueIndexer } from '@/composables/useDialogueIndexer'

// The documented data-loss path: leaving the editor inside the 10s debounce
// window must not drop what was typed. These pin schedule + flush behavior.
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn()
}))
vi.mock('@/stores/manuscriptStore', () => ({
  useManuscriptStore: vi.fn()
}))
vi.mock('@/stores/snapshotStore', () => ({
  useSnapshotStore: vi.fn()
}))
vi.mock('@/composables/useDialogueIndexer', () => ({
  useDialogueIndexer: vi.fn()
}))

function setupMocks() {
  const projectStore = {
    currentProjectId: 'p1',
    saveDocumentNow: vi.fn().mockResolvedValue(undefined),
    updateContent: vi.fn()
  }
  const manuscriptStore = {
    activeSubsectionId: null,
    activeSectionId: null,
    updateSubsectionData: vi.fn().mockResolvedValue(undefined),
    updateSectionData: vi.fn().mockResolvedValue(undefined),
    subsections: []
  }
  const snapshotStore = { saveNewSnapshot: vi.fn().mockResolvedValue(undefined) }
  const dialogueIndexer = { reindexSubsection: vi.fn(() => Promise.resolve()) }
  useProjectStore.mockReturnValue(projectStore)
  useManuscriptStore.mockReturnValue(manuscriptStore)
  useSnapshotStore.mockReturnValue(snapshotStore)
  useDialogueIndexer.mockReturnValue(dialogueIndexer)
  return { projectStore, manuscriptStore, snapshotStore }
}

describe('useFlowSave debounce + flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    setupMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const editorRef = { value: { getHTML: () => '<p>hello</p>' } }

  it('does not save before the 10s debounce elapses', async () => {
    const { projectStore } = setupMocks()
    useFlowSave(editorRef).scheduleSave()
    await vi.advanceTimersByTimeAsync(9999)
    expect(projectStore.saveDocumentNow).not.toHaveBeenCalled()
  })

  it('saves once the debounce elapses', async () => {
    const { projectStore } = setupMocks()
    useFlowSave(editorRef).scheduleSave()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(projectStore.saveDocumentNow).toHaveBeenCalledTimes(1)
  })

  it('reschedules the timer on repeated keystrokes', async () => {
    const { projectStore } = setupMocks()
    const saver = useFlowSave(editorRef)
    saver.scheduleSave()
    await vi.advanceTimersByTimeAsync(9000)
    saver.scheduleSave()
    await vi.advanceTimersByTimeAsync(9000)
    expect(projectStore.saveDocumentNow).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(projectStore.saveDocumentNow).toHaveBeenCalledTimes(1)
  })

  it('flushSave persists pending work immediately (unmount path)', async () => {
    const { projectStore } = setupMocks()
    const saver = useFlowSave(editorRef)
    saver.scheduleSave()
    await vi.advanceTimersByTimeAsync(1000)
    await saver.flushSave()
    expect(projectStore.saveDocumentNow).toHaveBeenCalledTimes(1)
  })

  it('flushSave with nothing pending writes nothing', async () => {
    const { projectStore } = setupMocks()
    const saver = useFlowSave(editorRef)
    await saver.flushSave()
    expect(projectStore.saveDocumentNow).not.toHaveBeenCalled()
  })
})
