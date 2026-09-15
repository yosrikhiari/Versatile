import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const svc = vi.hoisted(() => ({
  search: vi.fn(async () => []),
  rerank: vi.fn(async ({ chunks, topN }) =>
    chunks.slice(0, topN).map((c, i) => ({ ...c, _rerankScore: 1 - i * 0.1, _rerankIndex: i }))
  ),
  generate: vi.fn(
    async () => 'Ines doubts him at the docks [1] and says so in the customs house [2].'
  )
}))

vi.mock('@/services/storyVectorIndex', async (orig) => ({
  ...(await orig()),
  searchStorySemantic: (...a) => svc.search(...a)
}))
vi.mock('@/services/rerankingService', () => ({ rerankChunks: (...a) => svc.rerank(...a) }))
vi.mock('@/services/aiService', () => ({ aiGenerate: (...a) => svc.generate(...a) }))

import {
  useStoryAssistantStore,
  buildRagContext,
  buildRagPrompt,
  citedIn,
  MAX_CONTEXT_CHUNKS
} from '@/stores/useStoryAssistantStore'
import StoryAssistantChat from '@/components/assistant/StoryAssistantChat.vue'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useProjectStore } from '@/stores/projectStore'

const HITS = [
  {
    kind: 'subsection',
    refId: 's1',
    title: 'Low tide',
    text: 'Ines doubts Halim at the docks.',
    score: 0.9
  },
  {
    kind: 'subsection',
    refId: 's3',
    title: 'Customs',
    text: 'She says so in the customs house.',
    score: 0.8
  },
  { kind: 'character', refId: 'c1', title: 'Halim', text: 'caravan master', score: 0.7 }
]

describe('story assistant — pure pieces', () => {
  it('numbers the context and caps it', () => {
    const many = Array.from({ length: MAX_CONTEXT_CHUNKS + 3 }, (_, i) => ({
      kind: 'subsection',
      refId: `s${i}`,
      title: `Scene ${i}`,
      text: 'x'.repeat(2000),
      score: 1
    }))
    const { context, citations } = buildRagContext(many)
    expect(citations).toHaveLength(MAX_CONTEXT_CHUNKS)
    expect(context.startsWith('[1] Scene: Scene 0')).toBe(true)
    expect(context.length).toBeLessThan(MAX_CONTEXT_CHUNKS * 1000)
  })

  it('builds a prompt that forbids invention and asks for [n] citations', () => {
    const { system, user } = buildRagPrompt('who doubts whom?', '[1] Scene: x\ntext')
    expect(system).toMatch(/ONLY the numbered excerpts/)
    expect(system).toMatch(/do not invent/)
    expect(user).toContain('[1] Scene: x')
    expect(user).toContain('who doubts whom?')
  })

  it('extracts the citations the answer used, in first-mention order, once each', () => {
    const { citations } = buildRagContext(HITS)
    const used = citedIn('see [2], then [1], and [2] again; [9] is not real', citations)
    expect(used.map((c) => c.refId)).toEqual(['s3', 's1'])
  })
})

describe('useStoryAssistantStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    svc.search.mockResolvedValue(HITS)
    useProjectStore().currentProjectId = 'p1'
    const m = useManuscriptStore()
    m.subsections.push(
      { id: 's1', sectionId: 'sec1', title: 'Low tide' },
      { id: 's3', sectionId: 'sec1', title: 'Customs' }
    )
  })

  it('asks: retrieves, grounds, answers with the citations actually used', async () => {
    const store = useStoryAssistantStore()
    const turn = await store.ask('where does Ines doubt Halim?')
    expect(svc.search).toHaveBeenCalledWith('p1', 'where does Ines doubt Halim?', {
      limit: MAX_CONTEXT_CHUNKS * 2
    })
    const [user, system] = svc.generate.mock.calls[0]
    expect(system).toMatch(/ONLY the numbered excerpts/)
    expect(user).toContain('[1] Scene: Low tide')
    expect(turn.text).toContain('[1]')
    expect(turn.citations.map((c) => c.refId)).toEqual(['s1', 's3'])
    expect(store.turns).toHaveLength(2)
    expect(store.turns[1].text).toBe(turn.text)
  })

  it('reranks only when there are more hits than the window', async () => {
    const store = useStoryAssistantStore()
    await store.ask('q')
    expect(svc.rerank).not.toHaveBeenCalled()
    svc.search.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({ ...HITS[0], refId: `s${i}` }))
    )
    await store.ask('q2')
    expect(svc.rerank).toHaveBeenCalledTimes(1)
    expect(svc.rerank.mock.calls[0][0].topN).toBe(MAX_CONTEXT_CHUNKS)
  })

  it('says so when nothing is indexed, and never calls the model', async () => {
    svc.search.mockResolvedValue([])
    const store = useStoryAssistantStore()
    const turn = await store.ask('anything')
    expect(turn.text).toMatch(/Nothing in the indexed story/)
    expect(svc.generate).not.toHaveBeenCalled()
  })

  it('a citation opens the scene; entities are handed back to the caller', () => {
    const store = useStoryAssistantStore()
    const m = useManuscriptStore()
    expect(store.openCitation({ n: 1, kind: 'subsection', refId: 's3' })).toEqual({ handled: true })
    expect(m.activeSubsectionId).toBe('s3')
    expect(m.activeSectionId).toBe('sec1')
    expect(store.openCitation({ n: 2, kind: 'character', refId: 'c1' })).toEqual({ handled: false })
  })

  it('surfaces a model failure on the turn', async () => {
    svc.generate.mockRejectedValueOnce(new Error('ollama down'))
    const store = useStoryAssistantStore()
    const turn = await store.ask('q')
    expect(turn.error).toBe('ollama down')
    expect(store.lastError).toBe('ollama down')
    expect(store.isAnswering).toBe(false)
  })
})

describe('StoryAssistantChat', () => {
  const stubs = {
    Modal: { template: '<div><slot /></div>', props: ['show'] },
    BaseIcon: { template: '<i />' }
  }
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    svc.search.mockResolvedValue(HITS)
    useProjectStore().currentProjectId = 'p1'
    useManuscriptStore().subsections.push({ id: 's1', sectionId: 'sec1', title: 'Low tide' })
  })

  it('asks, renders the answer with citation chips, and a chip opens the scene', async () => {
    const w = mount(StoryAssistantChat, { props: { show: true }, global: { stubs } })
    await w.find('input').setValue('where does Ines doubt Halim?')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.findAll('[data-test="turn-user"]')).toHaveLength(1)
    expect(w.find('[data-test="turn-assistant"]').text()).toContain('doubts him at the docks')
    expect(w.find('[data-test="cite-1"]').text()).toContain('Scene · Low tide')
    await w.find('[data-test="cite-1"]').trigger('click')
    expect(useManuscriptStore().activeSubsectionId).toBe('s1')
    expect(w.emitted('close')).toBeTruthy()
    expect(w.emitted('navigate')).toBeFalsy()
  })

  it('an entity citation is handed up as navigate', async () => {
    svc.generate.mockResolvedValueOnce('He is the caravan master [3].')
    const w = mount(StoryAssistantChat, { props: { show: true }, global: { stubs } })
    await w.find('input').setValue('who is Halim?')
    await w.find('form').trigger('submit')
    await flushPromises()
    await w.find('[data-test="cite-3"]').trigger('click')
    expect(w.emitted('navigate')[0][0]).toMatchObject({ kind: 'character', refId: 'c1' })
  })
})
