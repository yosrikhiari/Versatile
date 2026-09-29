import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { createSceneGate } from '@/composables/generation/writing/sceneGate'

// §47: the writer copied the preceding scene's ending it was shown. Every
// strategy drafts through draftAttempt, so the guard lives there.
const tail =
  'The air was thick with the scent of damp earth and crushed grass, and I moved through the undergrowth with the weight of my own silence pressing against me like a hand on my chest.'

function gate(prose) {
  const record = vi.fn()
  const g = createSceneGate({
    currentTaskId: 't',
    abort: { signal: () => undefined },
    actLog: { appendThought: vi.fn(), addPhase: vi.fn(), updatePhase: vi.fn() },
    autoMode: ref(false),
    critic: {},
    evalUnavailableCount: ref(0),
    gate: async () => {},
    liveDraft: { reset: vi.fn() },
    promptAdjuster: {},
    rejectedPatterns: ref([]),
    runHealth: { record },
    scenePlan: ref([]),
    settings: {},
    spineContext: ref(''),
    storyBibleStore: {},
    throwIfAborted: () => {},
    workspaceType: { value: 'novel' },
    writeParams: ref({}),
    writer: { writeSceneStructured: async () => ({ prose, structured: {} }) },
    writtenScenes: ref([]),
    currentSceneResult: ref(null),
    persistCritiqueEval: () => {}
  })
  return { g, record }
}

const args = (embeddingContext) => ({
  scene: { title: 'When Night Came', sceneNumber: 3 },
  sceneIndex: 2,
  scenePhase: 0,
  storyArc: null,
  chapterLog: '',
  storyBible: '',
  storyContract: '',
  sceneEntitiesJson: '',
  embeddingContext,
  attempt: 0,
  maxAttempts: 1
})

describe('draftAttempt removes prose copied from the context it was shown (§47)', () => {
  it('drops the copied sentences and counts it in runHealth', async () => {
    const { g, record } = gate(`${tail}\n\nNight came on quickly, and Weena slept.`)
    const out = await g.draftAttempt(args(`HOW THE PRECEDING SCENES END:\n${tail}`))
    expect(out).toMatchObject({ ok: true, prose: 'Night came on quickly, and Weena slept.' })
    expect(record).toHaveBeenCalledWith(
      'copied_context',
      expect.objectContaining({ stage: 'writer', sceneIndex: 2 })
    )
  })

  it('leaves new prose alone', async () => {
    const { g, record } = gate('Night came on quickly, and Weena slept.')
    const out = await g.draftAttempt(args(`HOW THE PRECEDING SCENES END:\n${tail}`))
    expect(out.prose).toBe('Night came on quickly, and Weena slept.')
    expect(record).not.toHaveBeenCalled()
  })
})
