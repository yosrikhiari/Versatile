import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Regression cover for the path that carries imported research into generated
// prose. Every one of these guards a wiring bug rather than an algorithm: the
// retrieval, fusion, reranking and citation code all worked and was all
// unreachable, because `buildRetrievalContext` was called with a literal
// `undefined` for its rag options at every call site in the app.

vi.mock('@/services/researchDb', () => ({
  semanticSearch: vi.fn(),
  searchLexical: vi.fn(),
  getAllResearchDocuments: vi.fn()
}))

vi.mock('@/services/embeddingService', () => ({
  getEmbedding: vi.fn()
}))

vi.mock('@/services/rerankingService', () => ({
  rerankChunks: vi.fn(async ({ chunks }) => chunks)
}))

const SCENE = {
  title: 'The harbour master refuses the manifest',
  goal: 'Establish that the cargo cannot be logged',
  charactersPresent: ['Idris', 'Sena'],
  location: 'Kepler Docks'
}

function chunk(id, documentId, text, score = 0.9) {
  return { id, documentId, text, _score: score }
}

describe('multiHopRetrieval document scoping', () => {
  let multiHopRetrieval, researchDb, embeddingService

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    researchDb = await import('@/services/researchDb')
    embeddingService = await import('@/services/embeddingService')
    embeddingService.getEmbedding.mockResolvedValue(null)
    researchDb.getAllResearchDocuments.mockResolvedValue([])
    ;({ multiHopRetrieval } = await import('@/services/ragMultiHopRetrieval'))
  })

  it('returns chunks from every document when no scope is given', async () => {
    researchDb.searchLexical.mockResolvedValue([
      chunk('c1', 'doc-a', 'Harbour tariffs were paid in salt.'),
      chunk('c2', 'doc-b', 'The manifest listed nine crates.')
    ])
    researchDb.semanticSearch.mockResolvedValue([])

    const results = await multiHopRetrieval({ queries: ['harbour manifest'], projectId: 'p1' })

    expect(results.map((r) => r.documentId).sort()).toEqual(['doc-a', 'doc-b'])
  })

  it('drops chunks from documents outside the requested scope', async () => {
    researchDb.searchLexical.mockResolvedValue([
      chunk('c1', 'doc-a', 'Harbour tariffs were paid in salt.'),
      chunk('c2', 'doc-b', 'The manifest listed nine crates.')
    ])
    researchDb.semanticSearch.mockResolvedValue([])

    const results = await multiHopRetrieval({
      queries: ['harbour manifest'],
      projectId: 'p1',
      documentIds: ['doc-b']
    })

    expect(results).toHaveLength(1)
    expect(results[0].documentId).toBe('doc-b')
  })

  it('matches document ids across number/string forms', async () => {
    researchDb.searchLexical.mockResolvedValue([chunk('c1', 7, 'Numeric Dexie key.')])
    researchDb.semanticSearch.mockResolvedValue([])

    const results = await multiHopRetrieval({
      queries: ['harbour manifest'],
      projectId: 'p1',
      documentIds: ['7']
    })

    expect(results).toHaveLength(1)
  })

  it('over-fetches when scoped so a narrow selection is not starved', async () => {
    researchDb.searchLexical.mockResolvedValue([])
    researchDb.semanticSearch.mockResolvedValue([])

    await multiHopRetrieval({
      queries: ['harbour manifest'],
      projectId: 'p1',
      topK: 5,
      documentIds: ['doc-b']
    })

    // Scoping filters AFTER ranking, so an unwidened search would return the top
    // 5 chunks of the whole corpus and then throw most of them away.
    expect(researchDb.searchLexical).toHaveBeenCalledWith('p1', 'harbour manifest', 25)
  })
})

describe('buildRetrievalContext research wiring', () => {
  let sceneContext, ragMultiHop

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock('@/services/ragMultiHopRetrieval', () => ({
      multiHopRetrieval: vi.fn()
    }))
    ragMultiHop = await import('@/services/ragMultiHopRetrieval')
    sceneContext = await import('@/composables/generation/context/sceneContext')
  })

  afterEach(() => {
    vi.doUnmock('@/services/ragMultiHopRetrieval')
  })

  it('retrieves nothing when no rag options are supplied', async () => {
    const context = await sceneContext.buildRetrievalContext(SCENE, [], 5, undefined)

    expect(ragMultiHop.multiHopRetrieval).not.toHaveBeenCalled()
    expect(context).toBe('')
  })

  it('appends labelled research citations when rag options are supplied', async () => {
    ragMultiHop.multiHopRetrieval.mockResolvedValue([
      {
        id: 'c1',
        documentId: 'doc-a',
        documentTitle: 'Port Authority Handbook',
        text: 'Cargo without a manifest is impounded within six hours.'
      }
    ])

    const context = await sceneContext.buildRetrievalContext(SCENE, [], 5, {
      projectId: 'p1',
      enabled: true,
      documentIds: []
    })

    expect(ragMultiHop.multiHopRetrieval).toHaveBeenCalledTimes(1)
    expect(context).toContain('[source:Port Authority Handbook]')
    expect(context).toContain('impounded within six hours')
  })

  it('forwards the document scope to retrieval', async () => {
    ragMultiHop.multiHopRetrieval.mockResolvedValue([])

    await sceneContext.buildRetrievalContext(SCENE, [], 5, {
      projectId: 'p1',
      enabled: true,
      documentIds: ['doc-b', 'doc-c']
    })

    expect(ragMultiHop.multiHopRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', documentIds: ['doc-b', 'doc-c'] })
    )
  })

  it('skips retrieval when research is explicitly disabled', async () => {
    await sceneContext.buildRetrievalContext(SCENE, [], 5, {
      projectId: 'p1',
      enabled: false,
      documentIds: []
    })

    expect(ragMultiHop.multiHopRetrieval).not.toHaveBeenCalled()
  })

  it('keeps continuity context when retrieval throws', async () => {
    ragMultiHop.multiHopRetrieval.mockRejectedValue(new Error('ollama down'))

    const priorScenes = [
      { sceneNumber: 1, title: 'Arrival', prose: 'The ship docked at dawn.', summary: 'Docking.' }
    ]
    const context = await sceneContext.buildRetrievalContext(SCENE, priorScenes, 5, {
      projectId: 'p1',
      enabled: true
    })

    expect(context).toContain('The ship docked at dawn.')
  })

  it('builds research-only context for callers that already have continuity', async () => {
    ragMultiHop.multiHopRetrieval.mockResolvedValue([
      {
        id: 'c1',
        documentId: 'doc-a',
        documentTitle: 'Tide Tables',
        text: 'Spring tides run four hours late in the eastern basin.'
      }
    ])

    const priorScenes = [
      { sceneNumber: 1, title: 'Arrival', prose: 'The ship docked at dawn.', summary: 'Docking.' }
    ]
    const context = await sceneContext.buildResearchContext(SCENE, {
      projectId: 'p1',
      enabled: true
    })

    expect(context).toContain('[source:Tide Tables]')
    // Research only — the caller supplies its own neighbouring prose.
    expect(context).not.toContain(priorScenes[0].prose)
  })
})

describe('resolveResearchScope', () => {
  let researchScope

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    researchScope = await import('@/services/researchScope')
  })

  it('defaults to enabled with every document when nothing is specified', () => {
    expect(researchScope.resolveResearchScope(undefined)).toEqual({
      enabled: true,
      documentIds: []
    })
  })

  it('honours an explicit disable', () => {
    expect(researchScope.resolveResearchScope({ enabled: false }).enabled).toBe(false)
  })

  it('falls back to the global preference when enabled is omitted', () => {
    localStorage.setItem('versatile_research_enabled', 'false')
    expect(researchScope.resolveResearchScope({ documentIds: [] }).enabled).toBe(false)
  })

  it('an explicit enable overrides the global preference', () => {
    localStorage.setItem('versatile_research_enabled', 'false')
    expect(researchScope.resolveResearchScope({ enabled: true }).enabled).toBe(true)
  })

  it('treats an empty id list as "all documents"', () => {
    expect(researchScope.resolveResearchScope({ documentIds: [] }).documentIds).toEqual([])
  })

  it('buildRagOptions returns undefined when research is off', () => {
    expect(researchScope.buildRagOptions('p1', { enabled: false })).toBeUndefined()
  })

  it('buildRagOptions returns undefined without a project', () => {
    expect(researchScope.buildRagOptions(null, { enabled: true })).toBeUndefined()
  })

  it('buildRagOptions carries the project and scope through', () => {
    expect(researchScope.buildRagOptions('p1', { enabled: true, documentIds: [3] })).toEqual({
      projectId: 'p1',
      enabled: true,
      documentIds: [3],
      topK: undefined
    })
  })
})

describe('resolveEmbeddingConfig', () => {
  let embeddingConfig

  beforeEach(async () => {
    vi.resetModules()
    localStorage.clear()
    embeddingConfig = await import('@/services/embeddingConfig')
  })

  it('falls back to the shipped defaults with no saved settings', () => {
    const config = embeddingConfig.resolveEmbeddingConfig()
    expect(config.provider).toBe('ollama')
    expect(config.model).toBe('nomic-embed-text')
  })

  it('reads the user-selected model so index and queries agree', () => {
    localStorage.setItem(
      'versatile_settings',
      JSON.stringify({ embeddingProvider: 'mistral', embeddingModel: 'mistral-embed' })
    )
    embeddingConfig.invalidateEmbeddingConfig()

    const config = embeddingConfig.resolveEmbeddingConfig()
    expect(config.provider).toBe('mistral')
    expect(config.model).toBe('mistral-embed')
  })

  it('lets an explicit override win', () => {
    localStorage.setItem(
      'versatile_settings',
      JSON.stringify({ embeddingProvider: 'mistral', embeddingModel: 'mistral-embed' })
    )
    embeddingConfig.invalidateEmbeddingConfig()

    const config = embeddingConfig.resolveEmbeddingConfig({ model: 'nomic-embed-text' })
    expect(config.model).toBe('nomic-embed-text')
    expect(config.provider).toBe('mistral')
  })

  it('survives a corrupt settings blob', () => {
    localStorage.setItem('versatile_settings', '{not json')
    embeddingConfig.invalidateEmbeddingConfig()

    expect(embeddingConfig.resolveEmbeddingConfig().model).toBe('nomic-embed-text')
  })
})
