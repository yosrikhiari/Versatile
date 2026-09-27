import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/composables/useStoryDocuments', () => ({ useStoryDocuments: vi.fn(() => ({})) }))
vi.mock('@/composables/generation/utils', async (orig) => ({
  ...(await orig()),
  computeSummary: vi.fn(async () => 'rewritten summary')
}))
vi.mock('@/composables/generation/context/sceneContext', async (orig) => ({
  ...(await orig()),
  buildRetrievalContext: vi.fn(async () => ''),
  buildExistingEntitiesBlob: vi.fn(() => '[]')
}))

const { ConsistencyService } =
  await import('@/composables/generation/consistency/ConsistencyService')

function service(structured) {
  const writtenScenes = ref([
    {
      title: 'S1',
      prose: 'old',
      summary: 'old',
      chapterId: 3,
      keyFacts: ['Ada owns a knife'],
      sceneNumber: 1
    }
  ])
  const svc = new ConsistencyService({
    writeParams: ref({ storyArc: {}, storyContract: 'c' }),
    scenePlan: ref([{ title: 'S1', sceneNumber: 1 }]),
    chapterPlan: ref([]),
    spineArray: ref([]),
    autoMode: ref(true),
    writtenScenes,
    consistencyReport: ref(null),
    phase: ref(''),
    progress: {},
    storyBibleStore: { characters: [], locations: [], plotThreads: [] },
    critic: {},
    writer: { writeSceneStructured: vi.fn(async () => ({ prose: 'new prose', structured })) },
    manuscriptStore: { updateSubsectionData: vi.fn() },
    updateGenRunStage: vi.fn(),
    actLog: {}
  })
  return { svc, writtenScenes }
}

describe('a continuity fix-rewrite keeps the scene in the fact ledger (§35)', () => {
  it('keeps chapterId, and takes the rewrite facts when the writer returns them', async () => {
    const { svc, writtenScenes } = service({ keyFacts: ['Ada lost the knife'] })
    await svc.rewriteSceneForConsistency('p', 0, 'fix it', '')
    expect(writtenScenes.value[0]).toMatchObject({
      chapterId: 3,
      keyFacts: ['Ada lost the knife'],
      prose: 'new prose'
    })
  })

  it('keeps the previous facts when the rewrite returns none', async () => {
    const { svc, writtenScenes } = service({})
    await svc.rewriteSceneForConsistency('p', 0, 'fix it', '')
    expect(writtenScenes.value[0]).toMatchObject({ chapterId: 3, keyFacts: ['Ada owns a knife'] })
  })
})
