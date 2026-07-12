import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAiGenerateJson } = vi.hoisted(() => ({
  mockAiGenerateJson: vi.fn()
}))

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: mockAiGenerateJson
}))

vi.mock('@/services/researchDb', () => ({
  semanticSearch: vi.fn(),
  searchLexical: vi.fn(),
  getAllChunksForProject: vi.fn()
}))

vi.mock('@/services/embeddingService', () => ({
  getEmbedding: vi.fn()
}))

describe('formatCitationContext', () => {
  let formatCitationContext

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/ragCitationInjector')
    formatCitationContext = mod.formatCitationContext
  })

  it('formats chunks into citation lines', () => {
    const chunks = [
      { documentTitle: 'Source A', text: 'The ancient forest held secrets.' },
      { documentTitle: 'Source B', text: 'The sword was forged in dragonfire.' }
    ]
    const result = formatCitationContext(chunks)
    expect(result).toContain('[source:Source A]')
    expect(result).toContain('The ancient forest held secrets.')
    expect(result).toContain('[source:Source B]')
  })

  it('handles empty array', () => {
    expect(formatCitationContext([])).toBe('')
  })

  it('handles null', () => {
    expect(formatCitationContext(null)).toBe('')
  })

  it('falls back to documentId when documentTitle is missing', () => {
    const chunks = [{ documentId: 'd1', text: 'Just content' }]
    const result = formatCitationContext(chunks)
    expect(result).toContain('[source:d1]')
  })

  it('falls back to source inconnu when no title or id', () => {
    const chunks = [{ text: 'Content without source' }]
    const result = formatCitationContext(chunks)
    expect(result).toContain('[source:source inconnu]')
  })
})

describe('getCitationSummary', () => {
  let getCitationSummary

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/ragCitationInjector')
    getCitationSummary = mod.getCitationSummary
  })

  it('returns bullet list of unique document titles', () => {
    const chunks = [
      { documentTitle: 'Doc A' },
      { documentTitle: 'Doc B' },
      { documentTitle: 'Doc A' }
    ]
    const result = getCitationSummary(chunks)
    expect(result).toContain('- "Doc A"')
    expect(result).toContain('- "Doc B"')
    expect((result.match(/- "/g) || []).length).toBe(2)
  })

  it('falls back to documentId when no title', () => {
    const chunks = [{ documentId: 'd1' }]
    const result = getCitationSummary(chunks)
    expect(result).toContain('- "d1"')
  })

  it('returns empty string for empty input', () => {
    expect(getCitationSummary([])).toBe('')
  })

  it('returns empty string for null', () => {
    expect(getCitationSummary(null)).toBe('')
  })
})

describe('multiHopRetrieval', () => {
  let multiHopRetrieval

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/ragMultiHopRetrieval')
    multiHopRetrieval = mod.multiHopRetrieval
  })

  it('returns empty for missing projectId', async () => {
    const result = await multiHopRetrieval({ queries: ['test'] })
    expect(result).toEqual([])
  })

  it('returns empty for empty queries array', async () => {
    const result = await multiHopRetrieval({ queries: [], projectId: 'p1' })
    expect(result).toEqual([])
  })

  it('returns empty for empty query texts', async () => {
    const result = await multiHopRetrieval({ queries: [''], projectId: 'p1' })
    expect(result).toEqual([])
  })

  it('returns fused results from lexical and semantic search', async () => {
    const { getEmbedding } = await import('@/services/embeddingService')
    getEmbedding.mockResolvedValue(new Float32Array([0.1, 0.2, 0.3]))

    const { searchLexical, semanticSearch } = await import('@/services/researchDb')
    searchLexical.mockResolvedValue([
      { id: 1, text: 'Research doc 1', _score: 0.9, documentId: 'd1' }
    ])
    semanticSearch.mockResolvedValue([
      { id: 2, text: 'Semantic result', _score: 0.7, documentId: 'd2' }
    ])

    const result = await multiHopRetrieval({
      projectId: 'p1',
      queries: ['ancient forest sword']
    })

    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('handles empty lexical and semantic results', async () => {
    const { getEmbedding } = await import('@/services/embeddingService')
    getEmbedding.mockResolvedValue(new Float32Array([0.1, 0.2]))

    const { searchLexical, semanticSearch } = await import('@/services/researchDb')
    searchLexical.mockResolvedValue([])
    semanticSearch.mockResolvedValue([])

    const result = await multiHopRetrieval({
      projectId: 'p1',
      queries: ['test query']
    })
    expect(result).toEqual([])
  })

  it('handles embedding failure gracefully', async () => {
    const { getEmbedding } = await import('@/services/embeddingService')
    getEmbedding.mockRejectedValue(new Error('Embedding failed'))

    const { searchLexical } = await import('@/services/researchDb')
    searchLexical.mockResolvedValue([
      { id: 1, text: 'Lexical match', _score: 0.3, documentId: 'd1' }
    ])

    const result = await multiHopRetrieval({
      projectId: 'p1',
      queries: ['test query']
    })
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})

describe('useQueryRewriter', () => {
  let useQueryRewriter

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/composables/rag/useQueryRewriter')
    useQueryRewriter = mod.useQueryRewriter
  })

  it('returns queries from aiGenerateJson', async () => {
    mockAiGenerateJson.mockResolvedValue({
      queries: ['ancient forest lore', 'dragonfire sword history']
    })

    const result = await useQueryRewriter('Scene in ancient forest with dragonfire sword')

    expect(result.queries).toHaveLength(2)
    expect(result.queries[0]).toBe('ancient forest lore')
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1)
  })

  it('returns empty queries when scene brief is too short', async () => {
    const result = await useQueryRewriter('Short')
    expect(result.queries).toEqual([])
  })

  it('limits to 3 queries', async () => {
    mockAiGenerateJson.mockResolvedValue({
      queries: ['q1', 'q2', 'q3', 'q4', 'q5']
    })

    const result = await useQueryRewriter(
      'A scene with many different aspects to research thoroughly for writing.'
    )
    expect(result.queries).toHaveLength(3)
  })

  it('handles aiGenerateJson throwing', async () => {
    mockAiGenerateJson.mockRejectedValue(new Error('API error'))

    const result = await useQueryRewriter(
      'A scene that needs research queries generated for context.'
    )
    expect(result.queries).toEqual([])
  })
})

describe('useRagSelfRefine', () => {
  let useRagSelfRefine

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/composables/rag/useRagSelfRefine')
    useRagSelfRefine = mod.useRagSelfRefine
  })

  it('returns original text when sceneText is empty', async () => {
    const result = await useRagSelfRefine(
      '',
      'Some research context that has enough words to pass the minimum threshold for testing purposes and validation.'
    )
    expect(result).toEqual({ revisedText: '', rounds: 0 })
  })

  it('returns original text when contextBlock is too short', async () => {
    const result = await useRagSelfRefine('Some scene text here.', 'Too short')
    expect(result).toEqual({ revisedText: 'Some scene text here.', rounds: 0 })
  })

  it('returns original text when judge says no revision needed', async () => {
    mockAiGenerateJson.mockResolvedValue({
      needsRevision: false,
      reason: 'Scene properly reflects research.',
      missingElements: []
    })

    const text = 'A scene '.repeat(20)
    const result = await useRagSelfRefine(
      text,
      'The ancient forest held secrets. The sword was forged in dragonfire. ' +
        'Legends spoke of its power. Many sought it. None found it. ' +
        'The mystery remained for generations. Scholars debated its meaning.'
    )

    expect(result.revisedText).toBe(text)
    expect(result.rounds).toBe(0)
  })

  it('rewrites prose when judge flags missing elements', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({
        needsRevision: true,
        reason: 'Missing dragonfire origin',
        missingElements: ['dragonfire origin']
      })
      .mockResolvedValueOnce({
        revisedScene: 'The dragonfire sword lay hidden.'
      })

    const result = await useRagSelfRefine(
      'Original prose.',
      'The ancient forest of Eldoria concealed many secrets. ' +
        'Legends spoke of a sword forged in dragonfire. ' +
        'Its power was unmatched in all the realms. ' +
        'Few dared to seek it out. The mystery deepened.'
    )

    expect(result.revisedText).toBe('The dragonfire sword lay hidden.')
    expect(result.rounds).toBe(1)
  })

  it('returns original text when aiGenerateJson throws on judge', async () => {
    mockAiGenerateJson.mockRejectedValue(new Error('API error'))

    const text = 'A scene '.repeat(20)
    const result = await useRagSelfRefine(
      text,
      'The ancient forest held secrets. The sword was forged in dragonfire. ' +
        'Legends spoke of its power. Many sought it. None found it. ' +
        'Scholars debated its meaning for generations without conclusion.'
    )

    expect(result.revisedText).toBe(text)
    expect(result.rounds).toBe(0)
  })

  it('returns original text when aiGenerateJson fails on rewrite', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({
        needsRevision: true,
        reason: 'Missing details',
        missingElements: ['details']
      })
      .mockRejectedValueOnce(new Error('Rewrite failed'))

    const text = 'Original scene text for testing purposes that has enough content. '.repeat(5)
    const result = await useRagSelfRefine(
      text,
      'Important research context about the scene should be included in the writing. ' +
        'The details are crucial for maintaining consistency across the narrative. ' +
        'Every element serves a purpose in the story. This context is comprehensive.'
    )

    expect(result.revisedText).toBe(text)
    expect(result.rounds).toBe(1)
  })

  it('stops refinement after max rounds', async () => {
    mockAiGenerateJson.mockResolvedValue({
      needsRevision: true,
      reason: 'Still missing elements',
      missingElements: ['elements']
    })

    const result = await useRagSelfRefine(
      'Scene text that needs revision and editing for better quality. '.repeat(3),
      'Research context provides important background information for the story. ' +
        'Every detail helps build a richer narrative experience for the reader. ' +
        'The author should incorporate these elements naturally into the prose and dialogue.'
    )

    expect(result.rounds).toBe(2)
  })
})
