import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEmbeddingService = { getEmbedding: vi.fn() }
const mockResearchDb = {
  semanticSearch: vi.fn(),
  searchLexical: vi.fn(),
  getAllChunksForProject: vi.fn()
}
const mockAiGenerate = vi.fn()

vi.mock('@/services/embeddingService', () => mockEmbeddingService)
vi.mock('@/services/researchDb', () => mockResearchDb)
vi.mock('@/services/aiService', () => ({ aiGenerate: (...args) => mockAiGenerate(...args) }))

const SOURCE_CHUNKS = [
  {
    id: 1,
    projectId: 'p1',
    documentTitle: 'Source A',
    content: 'The ancient forest held secrets.',
    _score: 0.82
  },
  {
    id: 2,
    projectId: 'p1',
    documentTitle: 'Source B',
    content: 'The sword was forged in dragonfire.',
    _score: 0.67
  }
]

describe('ragCitationInjector', () => {
  let buildRagCitations, getCitationSummary
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('@/services/ragCitationInjector')
    buildRagCitations = mod.buildRagCitations
    getCitationSummary = mod.getCitationSummary
  })

  it('buildRagCitations formats chunks into citation lines', () => {
    const result = buildRagCitations(SOURCE_CHUNKS)
    expect(result).toContain('[source:Source A]')
    expect(result).toContain('The ancient forest held secrets.')
    expect(result).toContain('[source:Source B]')
  })

  it('buildRagCitations handles empty array', () => {
    expect(buildRagCitations([])).toBe('')
  })

  it('buildRagCitations falls back to documentId when title missing', () => {
    const chunks = [{ id: 3, content: 'Just content', documentId: 'doc-3' }]
    const result = buildRagCitations(chunks)
    expect(result).toContain('[source:doc-3]')
  })

  it('buildRagCitations falls back to French default when no source info', () => {
    const chunks = [{ id: 4, content: 'Just content' }]
    const result = buildRagCitations(chunks)
    expect(result).toContain('[source:source inconnu]')
  })

  it('buildRagCitations deduplicates by source + first 80 chars', () => {
    const chunks = [
      { id: 1, documentTitle: 'Doc', content: 'The ancient forest held secrets.' },
      { id: 2, documentTitle: 'Doc', content: 'The ancient forest held secrets.' }
    ]
    const result = buildRagCitations(chunks)
    expect(result).toContain('[source:Doc]')
    expect((result.match(/\[source:Doc\]/g) || []).length).toBe(1)
  })

  it('getCitationSummary returns formatted source titles', () => {
    const result = getCitationSummary(SOURCE_CHUNKS)
    expect(result).toContain('- "Source A"')
    expect(result).toContain('- "Source B"')
  })

  it('getCitationSummary returns empty string for empty input', () => {
    expect(getCitationSummary([])).toBe('')
  })
})

describe('ragMultiHopRetrieval', () => {
  let multiHopRetrieval
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('@/services/ragMultiHopRetrieval')
    multiHopRetrieval = mod.multiHopRetrieval
  })

  it('returns fused results from semantic and lexical search', async () => {
    const queryEmbedding = new Float32Array([0.1, 0.2, 0.3])
    mockEmbeddingService.getEmbedding.mockResolvedValue(queryEmbedding)
    mockResearchDb.semanticSearch.mockResolvedValue([
      { id: 1, title: 'Found', content: 'Semantic match', _score: 0.72 }
    ])
    mockResearchDb.searchLexical.mockResolvedValue([
      { id: 2, title: 'Found', content: 'Lexical match', _score: 0.25 }
    ])

    const result = await multiHopRetrieval({
      queries: ['ancient forest sword'],
      projectId: 'p1'
    })

    expect(mockEmbeddingService.getEmbedding).toHaveBeenCalled()
    expect(mockResearchDb.semanticSearch).toHaveBeenCalledWith('p1', queryEmbedding, 5)
    expect(mockResearchDb.searchLexical).toHaveBeenCalledWith('p1', 'ancient forest sword', 5)
    expect(result.length).toBeGreaterThanOrEqual(1)
    const scores = result.map((c) => c._score)
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(0.72)
  })

  it('returns empty for empty queries', async () => {
    const result = await multiHopRetrieval({ queries: [], projectId: 'p1' })
    expect(result).toEqual([])
  })

  it('returns empty when embedding service returns null', async () => {
    mockEmbeddingService.getEmbedding.mockResolvedValue(null)
    mockResearchDb.searchLexical.mockResolvedValue([])

    const result = await multiHopRetrieval({
      queries: ['test query'],
      projectId: 'p1'
    })

    expect(result).toEqual([])
  })

  it('deduplicates chunks by id', async () => {
    const queryEmbedding = new Float32Array([0.1, 0.2, 0.3])
    mockEmbeddingService.getEmbedding.mockResolvedValue(queryEmbedding)
    mockResearchDb.semanticSearch.mockResolvedValue([
      { id: 1, title: 'Dup', content: 'Same chunk', _score: 0.72 }
    ])
    mockResearchDb.searchLexical.mockResolvedValue([
      { id: 1, title: 'Dup', content: 'Same chunk', _score: 0.72 }
    ])

    const result = await multiHopRetrieval({
      queries: ['test query'],
      projectId: 'p1'
    })

    expect(result.length).toBe(1)
  })

  it('applies score threshold filtering', async () => {
    const queryEmbedding = new Float32Array([0.1, 0.2, 0.3])
    mockEmbeddingService.getEmbedding.mockResolvedValue(queryEmbedding)
    mockResearchDb.semanticSearch.mockResolvedValue([
      { id: 1, title: 'Low', content: 'Below threshold', _score: 0.1 }
    ])
    mockResearchDb.searchLexical.mockResolvedValue([])

    const result = await multiHopRetrieval({
      queries: ['test query'],
      projectId: 'p1',
      minScore: 0.45
    })

    expect(result).toEqual([])
  })
})

describe('useQueryRewriter', () => {
  let useQueryRewriter
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('@/composables/rag/useQueryRewriter')
    useQueryRewriter = mod.useQueryRewriter
  })

  it('returns queries from aiGenerateJson', async () => {
    mockAiGenerate.mockResolvedValue(
      JSON.stringify({ queries: ['ancient forest lore', 'dragonfire sword history'] })
    )

    const result = await useQueryRewriter('The dragon sword lies hidden in the ancient forest.')

    expect(result.queries).toEqual(['ancient forest lore', 'dragonfire sword history'])
    expect(mockAiGenerate).toHaveBeenCalledTimes(1)
  })

  it('returns single query in array', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ queries: ['ancient forest lore'] }))

    const result = await useQueryRewriter('The dragon sword lies hidden in the ancient forest.')

    expect(result.queries).toEqual(['ancient forest lore'])
  })

  it('returns empty queries when brief is too short', async () => {
    const result = await useQueryRewriter('Short')
    expect(result.queries).toEqual([])
  })

  it('returns empty queries on JSON parse failure', async () => {
    mockAiGenerate.mockResolvedValue('invalid json')

    const result = await useQueryRewriter('A sufficiently long scene brief for testing purposes.')
    expect(result.queries).toEqual([])
  })

  it('handles aiGenerate returning null', async () => {
    mockAiGenerate.mockResolvedValue(null)

    const result = await useQueryRewriter('A sufficiently long scene brief for testing purposes.')
    expect(result.queries).toEqual([])
  })
})

describe('useRagSelfRefine', () => {
  let useRagSelfRefine
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('@/composables/rag/useRagSelfRefine')
    useRagSelfRefine = mod.useRagSelfRefine
  })

  it('returns original text when context is too short', async () => {
    const result = await useRagSelfRefine('Short text.', 'Tiny ctx')
    expect(result.revisedText).toBe('Short text.')
    expect(result.rounds).toBe(0)
  })

  it('skips refinement when judge approves', async () => {
    const prose = 'A scene '.repeat(20)
    const context = 'Context block '.repeat(20)
    mockAiGenerate.mockResolvedValueOnce(
      JSON.stringify({ needsRevision: false, reason: '', missingElements: [] })
    )

    const result = await useRagSelfRefine(prose, context)
    expect(result.rounds).toBe(0)
    expect(result.revisedText).toBe(prose)
  })

  it('rewrites and re-judges when judge flags revision', async () => {
    const prose = 'The ancient forest held secrets unknown to mortals.'
    const context = 'Context block '.repeat(20)
    mockAiGenerate
      .mockResolvedValueOnce(
        JSON.stringify({
          needsRevision: true,
          reason: 'Missing dragonfire origin',
          missingElements: ['dragonfire']
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          revisedScene: 'The dragonfire sword, forged in ancient flames, lay hidden in the forest.'
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({ needsRevision: false, reason: '', missingElements: [] })
      )

    const result = await useRagSelfRefine(prose, context)
    expect(result.rounds).toBe(1)
    expect(mockAiGenerate).toHaveBeenCalledTimes(3)
    expect(result.revisedText).toBe(
      'The dragonfire sword, forged in ancient flames, lay hidden in the forest.'
    )
  })

  it('stops after max rounds even if judge still flags revision', async () => {
    const prose = 'A scene '.repeat(20)
    const context = 'Context block '.repeat(20)
    mockAiGenerate
      .mockResolvedValueOnce(
        JSON.stringify({
          needsRevision: true,
          reason: 'Missing elements',
          missingElements: ['details']
        })
      )
      .mockResolvedValueOnce(JSON.stringify({ revisedScene: 'Revised version with more details.' }))
      .mockResolvedValueOnce(
        JSON.stringify({
          needsRevision: true,
          reason: 'Still missing',
          missingElements: ['more details']
        })
      )
      .mockResolvedValueOnce(JSON.stringify({ revisedScene: 'Revised version with more details.' }))

    const result = await useRagSelfRefine(prose, context)
    expect(result.rounds).toBe(2)
    expect(result.revisedText).toBe('Revised version with more details.')
  })

  it('returns original text when aiGenerate throws', async () => {
    const prose = 'A scene '.repeat(20)
    const context = 'Context block '.repeat(20)
    mockAiGenerate.mockRejectedValue(new Error('API error'))

    const result = await useRagSelfRefine(prose, context)
    expect(result.revisedText).toBe(prose)
    expect(result.rounds).toBe(0)
  })

  it('returns original text when judge returns unparseable JSON', async () => {
    const prose = 'A scene '.repeat(20)
    const context = 'Context block '.repeat(20)
    mockAiGenerate.mockResolvedValue('not json at all')

    const result = await useRagSelfRefine(prose, context)
    expect(result.revisedText).toBe(prose)
    expect(result.rounds).toBe(0)
  })
})
