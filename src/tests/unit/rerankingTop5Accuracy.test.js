import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/ollama', () => ({
  getOllamaEndpoint: vi.fn(() => '/ollama')
}))

const mockGetEmbedding = vi.fn()
vi.mock('@/services/embeddingService', () => ({
  getEmbedding: mockGetEmbedding
}))

function makeChunks(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `chunk-${i}`,
    text: `Irrelevant filler text number ${i}.`
  }))
}

describe('rerankChunks — top-5 accuracy improvement', () => {
  let rerankChunks

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/services/rerankingService')
    rerankChunks = mod.rerankChunks
  })

  it('promotes the single relevant chunk from position 7 into top 5 via Ollama rerank', async () => {
    const chunks = makeChunks(10)
    chunks[6] = { id: 'the-target', text: 'Dragonfire sword origin and history.' }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 6, relevance_score: 0.97 },
            ...Array.from({ length: 5 }, (_, i) => ({
              index: i < 6 ? i : i + 1,
              relevance_score: 0.1 + (5 - i) * 0.02
            }))
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await rerankChunks({ chunks, query: 'dragonfire sword', topN: 5, minScore: 0 })

    expect(result).toHaveLength(5)
    const targetPos = result.findIndex((c) => c.id === 'the-target')
    expect(targetPos).toBeGreaterThanOrEqual(0)
    expect(targetPos).toBeLessThan(5)
    expect(targetPos).toBe(0)

    fetchSpy.mockRestore()
  })

  it('promotes relevant chunk into top 5 via embedding fallback', async () => {
    const chunks = makeChunks(10)
    chunks[8] = { id: 'the-target', text: 'Ancient dragon lore and magical swords.' }

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Ollama down'))

    const queryVec = new Float32Array([0.5, 0.5, 0.5])
    const targetVec = new Float32Array([0.49, 0.49, 0.49])
    const noiseVec = new Float32Array([0.1, 0, 0])
    mockGetEmbedding.mockImplementation(async (text) => {
      if (text === 'dragon lore') return queryVec
      if (text === chunks[8].text) return targetVec
      return noiseVec
    })

    const result = await rerankChunks({ chunks, query: 'dragon lore', topN: 5, minScore: 0 })

    expect(result).toHaveLength(5)
    const targetPos = result.findIndex((c) => c.id === 'the-target')
    expect(targetPos).toBeGreaterThanOrEqual(0)
    expect(targetPos).toBeLessThan(5)

    fetchSpy.mockRestore()
  })

  it('filters low-scoring chunks from top N via minScore', async () => {
    const chunks = [
      { id: 'a', text: 'Direct match about dragonfire sword.' },
      { id: 'b', text: 'Also very relevant dragon content.' },
      { id: 'c', text: 'Somewhat related fantasy.' },
      { id: 'd', text: 'Unrelated cooking recipe.' },
      { id: 'e', text: 'Unrelated gardening tips.' }
    ]

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { index: 0, relevance_score: 0.95 },
            { index: 1, relevance_score: 0.91 },
            { index: 2, relevance_score: 0.12 },
            { index: 3, relevance_score: 0.05 },
            { index: 4, relevance_score: 0.03 }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await rerankChunks({ chunks, query: 'dragonfire sword', topN: 5, minScore: 0.3 })

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')

    fetchSpy.mockRestore()
  })
})
