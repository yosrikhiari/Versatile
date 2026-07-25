import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetOllamaEndpoint } = vi.hoisted(() => ({
  mockGetOllamaEndpoint: vi.fn(() => '/ollama')
}))

vi.mock('@/config/ollama', () => ({
  getOllamaEndpoint: mockGetOllamaEndpoint
}))

const { mockGetEmbedding } = vi.hoisted(() => ({
  mockGetEmbedding: vi.fn()
}))

vi.mock('@/services/embeddingService', () => ({
  getEmbedding: mockGetEmbedding
}))

vi.mock('@/services/researchDb', () => ({
  semanticSearch: vi.fn(),
  searchLexical: vi.fn(),
  getAllResearchDocuments: vi.fn()
}))

describe('rerankChunks', () => {
  let rerankChunks

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/rerankingService')
    rerankChunks = mod.rerankChunks
  })

  it('returns empty for empty chunks', async () => {
    const result = await rerankChunks({ chunks: [], query: 'test' })
    expect(result).toEqual([])
  })

  it('returns chunks with 0 score for empty query', async () => {
    const chunks = [{ id: 1, text: 'Hello' }]
    const result = await rerankChunks({ chunks, query: '' })
    expect(result).toHaveLength(1)
    expect(result[0]._rerankScore).toBe(0)
  })

  it('falls back to embeddings when Ollama rerank fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    mockGetEmbedding
      .mockResolvedValueOnce(new Float32Array([0.1, 0.2, 0.3]))
      .mockResolvedValueOnce(new Float32Array([0.4, 0.5, 0.6]))
      .mockResolvedValueOnce(new Float32Array([0.1, 0.1, 0.1]))

    const chunks = [
      { id: 1, text: 'Dragonfire sword' },
      { id: 2, text: 'Ancient forest' },
      { id: 3, text: 'Unrelated recipe' }
    ]

    const result = await rerankChunks({ chunks, query: 'sword dragon', topN: 3, minScore: 0 })

    expect(result).toHaveLength(3)
    expect(result[0]._rerankScore).toBeGreaterThanOrEqual(0)
    expect(fetchSpy).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('returns original order on total failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))
    mockGetEmbedding.mockRejectedValue(new Error('Embedding failed too'))

    const chunks = [
      { id: 1, text: 'First' },
      { id: 2, text: 'Second' }
    ]

    const result = await rerankChunks({ chunks, query: 'test', topN: 2, minScore: 0 })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
    expect(result[0]._rerankScore).toBe(0)
    expect(result[1]._rerankScore).toBe(0)
    fetchSpy.mockRestore()
  })

  it('uses Ollama rerank API when available', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'jina/jina-reranker-v2-base-multilingual',
          results: [
            { index: 1, relevance_score: 0.95 },
            { index: 0, relevance_score: 0.23 },
            { index: 2, relevance_score: 0.12 }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const chunks = [
      { id: 'a', text: 'Ancient forest lore' },
      { id: 'b', text: 'Dragonfire sword origin' },
      { id: 'c', text: 'Village customs' }
    ]

    const result = await rerankChunks({
      chunks,
      query: 'dragonfire sword origin',
      topN: 2,
      minScore: 0
    })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('b')
    expect(result[0]._rerankScore).toBe(0.95)
    expect(result[1].id).toBe('a')
    expect(result[1]._rerankScore).toBe(0.23)

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(callBody.model).toBe('jina/jina-reranker-v2-base-multilingual')
    expect(callBody.query).toBe('dragonfire sword origin')
    expect(callBody.top_n).toBe(2)
    expect(callBody.documents).toEqual([
      'Ancient forest lore',
      'Dragonfire sword origin',
      'Village customs'
    ])
    fetchSpy.mockRestore()
  })

  it('filters chunks below minScore', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 0, relevance_score: 0.9 },
            { index: 1, relevance_score: 0.1 },
            { index: 2, relevance_score: 0.5 }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const chunks = [
      { id: 'a', text: 'Very relevant' },
      { id: 'b', text: 'Irrelevant' },
      { id: 'c', text: 'Somewhat relevant' }
    ]

    const result = await rerankChunks({ chunks, query: 'test', topN: 3, minScore: 0.3 })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('c')
    fetchSpy.mockRestore()
  })

  it('uses content field when text is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ index: 0, relevance_score: 0.95 }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const chunks = [{ id: 'x', content: 'Some content' }]
    const result = await rerankChunks({ chunks, query: 'test', topN: 1, minScore: 0 })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('x')

    const callBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    expect(callBody.documents).toEqual(['Some content'])
    fetchSpy.mockRestore()
  })
})

describe('multiHopRetrieval rerank option', () => {
  let multiHopRetrieval

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/ragMultiHopRetrieval')
    multiHopRetrieval = mod.multiHopRetrieval
  })

  it('passes rerank=false by default', async () => {
    const { getEmbedding } = await import('@/services/embeddingService')
    getEmbedding.mockResolvedValue(new Float32Array([0.1, 0.2, 0.3]))

    const { searchLexical, semanticSearch } = await import('@/services/researchDb')
    searchLexical.mockResolvedValue([{ id: 1, text: 'Match', _score: 0.9, documentId: 'd1' }])
    semanticSearch.mockResolvedValue([])

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fail'))

    const result = await multiHopRetrieval({ projectId: 'p1', queries: ['test'], rerank: false })

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('calls rerankChunks when rerank=true', async () => {
    const { getEmbedding } = await import('@/services/embeddingService')
    getEmbedding.mockResolvedValue(new Float32Array([0.1, 0.2, 0.3]))

    const { searchLexical, semanticSearch } = await import('@/services/researchDb')
    searchLexical.mockResolvedValue([{ id: 1, text: 'Match one', _score: 0.9, documentId: 'd1' }])
    semanticSearch.mockResolvedValue([])

    const { getAllResearchDocuments } = await import('@/services/researchDb')
    getAllResearchDocuments.mockResolvedValue([])

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ index: 0, relevance_score: 0.8 }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await multiHopRetrieval({ projectId: 'p1', queries: ['test'], rerank: true })

    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(fetchSpy).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
