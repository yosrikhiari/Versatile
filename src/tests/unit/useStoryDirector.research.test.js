import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockGetAllChunks = vi.fn()
const mockProjectStore = { activeWorkspaceType: 'creative', currentProjectId: 'proj-1' }

const mockAiStream = vi.fn(async (user, system, onChunk, opts) => {
  const res = await mockAiGenerate(user, system, opts)
  onChunk(res)
  return res
})

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args),
  aiGenerateStructured: async (...args) => {
    const r = await mockAiGenerate(...args)
    if (r && typeof r === 'object') return r
    const cleaned = String(r)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('structured parse failed')
    return JSON.parse(m[0])
  }
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDER_DEFAULT: 'ollama',
  PROVIDERS: { OLLAMA: 'ollama' },
  FEATURE_DEFAULTS: { story_generation: { provider: 'ollama', model: null } },
  EMBEDDING_DEFAULTS: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    threshold: 0.75,
    batchSize: 32
  },
  EMBEDDING_PROVIDERS: { OLLAMA: 'ollama' },
  RESEARCH_CHUNKS_DEFAULT: 8
}))

vi.mock('@/services/researchDb', () => ({
  getAllChunksForProject: (...args) => mockGetAllChunks(...args)
}))
// Keep retrieval lexical-only and fast/deterministic (no real embedding calls).
vi.mock('@/services/embeddingService', () => ({ getEmbedding: async () => null }))
vi.mock('@/services/ollamaService', () => ({ cosineSimilarity: () => 0 }))

vi.mock('@/stores/projectStore', () => ({ useProjectStore: () => mockProjectStore }))
vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: { creative: { director: 'You are a story architect. JSON only.' } }
}))

let useStoryDirector
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useStoryDirector')
  useStoryDirector = mod.useStoryDirector
})

const goal = {
  premise: 'A quest',
  genre: 'Fantasy',
  tone: 'Dark',
  wordTarget: 4000,
  horizon: 'long_term'
}

function validPlan() {
  return JSON.stringify({
    chapters: [
      {
        chapterNumber: 1,
        title: 'Ch1',
        emotionalTarget: 'Hope',
        estimatedWords: 4000,
        scenes: [{ sceneNumber: 1, title: 'S1', arcPosition: 'setup', obstacle: 'ob' }]
      }
    ],
    storyArc: { premise: 'A quest' }
  })
}

const chunks = [
  { id: 1, documentId: 10, text: 'ALPHA_DOC dragons and ancient runes' },
  { id: 2, documentId: 20, text: 'BETA_DOC starships and warp cores' },
  { id: 3, documentId: 30, text: 'GAMMA_DOC courtly romance and letters' }
]

function systemPromptOf(callIndex = 0) {
  return mockAiGenerate.mock.calls[callIndex][1]
}

describe('generateStoryPlan — research scope selection', () => {
  beforeEach(() => {
    mockGetAllChunks.mockResolvedValue(chunks)
    mockAiGenerate.mockResolvedValue(validPlan())
  })

  it('restricts research context to the selected documents', async () => {
    const { generateStoryPlan } = useStoryDirector()
    await generateStoryPlan({ goal, evidence: '', research: { enabled: true, documentIds: [20] } })
    const sys = systemPromptOf()
    expect(sys).toContain('## Research Context')
    expect(sys).toContain('BETA_DOC')
    expect(sys).not.toContain('ALPHA_DOC')
    expect(sys).not.toContain('GAMMA_DOC')
  })

  it('uses every document when no documentIds are given', async () => {
    const { generateStoryPlan } = useStoryDirector()
    await generateStoryPlan({ goal, evidence: '', research: { enabled: true, documentIds: [] } })
    const sys = systemPromptOf()
    expect(sys).toContain('ALPHA_DOC')
    expect(sys).toContain('BETA_DOC')
    expect(sys).toContain('GAMMA_DOC')
  })

  it('omits research entirely when disabled, even if documents exist', async () => {
    const { generateStoryPlan } = useStoryDirector()
    await generateStoryPlan({
      goal,
      evidence: '',
      research: { enabled: false, documentIds: [10, 20] }
    })
    const sys = systemPromptOf()
    expect(sys).not.toContain('## Research Context')
    expect(sys).not.toContain('ALPHA_DOC')
  })

  it('falls back to all documents when research option is omitted (backward compatible)', async () => {
    const { generateStoryPlan } = useStoryDirector()
    await generateStoryPlan({ goal, evidence: '' })
    const sys = systemPromptOf()
    expect(sys).toContain('ALPHA_DOC')
    expect(sys).toContain('BETA_DOC')
  })

  it('selecting a document with no chunks yields no research context', async () => {
    const { generateStoryPlan } = useStoryDirector()
    await generateStoryPlan({ goal, evidence: '', research: { enabled: true, documentIds: [999] } })
    const sys = systemPromptOf()
    expect(sys).not.toContain('## Research Context')
  })

  it('ranks a large research corpus without blocking (freeze regression guard)', async () => {
    // The old per-chunk df recomputation was O(N²) and froze the Planning phase.
    // 3000 chunks must rank in well under the naive-quadratic time.
    const big = Array.from({ length: 3000 }, (_, i) => ({
      id: i + 1,
      documentId: 1,
      text: `chunk ${i} quest fantasy dark dragons ${i % 7 === 0 ? 'spaceships' : 'castle'}`
    }))
    mockGetAllChunks.mockResolvedValue(big)
    const { generateStoryPlan } = useStoryDirector()
    const started = performance.now()
    await generateStoryPlan({ goal, evidence: '', research: { enabled: true, documentIds: [1] } })
    const elapsed = performance.now() - started
    // Generous budget: the linear path finishes in tens of ms; the old quadratic
    // path on 3000 chunks took many seconds.
    expect(elapsed).toBeLessThan(2000)
    expect(systemPromptOf()).toContain('## Research Context')
  })
})
