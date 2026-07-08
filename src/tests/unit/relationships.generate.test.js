import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAiGenerateJson = vi.fn()
const mockAddRels = vi.fn(async () => [])
const mockAddEdges = vi.fn(async () => [])
const mockGetRels = vi.fn(async () => [])
const mockGetEdges = vi.fn(async () => [])

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))
vi.mock('@/config/ai', () => ({ FEATURES: { NETWORK: 'network' } }))
vi.mock('@/services/dbService', () => ({
  addCharacterRelationshipsBatch: (...a) => mockAddRels(...a),
  addGraphEdgesBatch: (...a) => mockAddEdges(...a),
  getCharacterRelationships: (...a) => mockGetRels(...a),
  getGraphEdges: (...a) => mockGetEdges(...a)
}))

let generateRelationships
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mockAddRels.mockResolvedValue([])
  mockAddEdges.mockResolvedValue([])
  mockGetRels.mockResolvedValue([])
  mockGetEdges.mockResolvedValue([])
  const mod = await import('@/composables/generation/generators/relationships')
  generateRelationships = mod.generateRelationships
})

const cast = {
  projectId: 'p1',
  characters: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ],
  locations: [{ id: 10, name: 'The Keep' }],
  plotThreads: [{ id: 100, title: 'The Prophecy' }],
  synopsis: 's',
  genre: 'Fantasy',
  tone: 'Dark'
}

describe('generateRelationships — robustness & diagnosability', () => {
  it('returns too_few_characters without calling the model', async () => {
    const res = await generateRelationships({ ...cast, characters: [{ id: 1, name: 'Solo' }] })
    expect(res).toMatchObject({ characterRelationships: 0, graphEdges: 0, reason: 'too_few_characters' })
    expect(mockAiGenerateJson).not.toHaveBeenCalled()
  })

  it('retries once then reports ai_failed when the model keeps failing', async () => {
    mockAiGenerateJson.mockRejectedValue(new Error('boom'))
    const res = await generateRelationships(cast)
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    expect(res.reason).toBe('ai_failed')
    expect(res.characterRelationships).toBe(0)
  })

  it('retries once then reports ai_empty when the model returns nothing usable', async () => {
    mockAiGenerateJson.mockResolvedValue({ characterRelationships: [] })
    const res = await generateRelationships(cast)
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    expect(res.reason).toBe('ai_empty')
    expect(res.characterRelationships).toBe(0)
  })

  it('recovers on the second attempt when the first is empty', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({ characterRelationships: [] })
      .mockResolvedValueOnce({
        characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }]
      })
    const res = await generateRelationships(cast)
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    expect(res.characterRelationships).toBe(1)
    expect(res.reason).toBe('ok')
    expect(mockAddRels).toHaveBeenCalledTimes(1)
  })

  it('reports all_dropped when the model names entities that are not in the cast', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characterRelationships: [{ from: 'Alice', to: 'Ghost', type: 'ally' }]
    })
    const res = await generateRelationships(cast)
    // Non-empty AI result, but every edge dropped on name reconciliation.
    expect(res.characterRelationships).toBe(0)
    expect(res.graphEdges).toBe(0)
    expect(res.dropped).toBe(1)
    expect(res.reason).toBe('all_dropped')
    // Did not retry — the first attempt had connections.
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1)
  })

  it('persists and reports ok on a good result', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }],
      characterLocations: [{ character: 'Alice', location: 'The Keep', relationship: 'home' }]
    })
    const res = await generateRelationships(cast)
    expect(res.reason).toBe('ok')
    expect(res.characterRelationships).toBe(1)
    expect(res.graphEdges).toBe(1)
    expect(mockAddRels).toHaveBeenCalledTimes(1)
    expect(mockAddEdges).toHaveBeenCalledTimes(1)
  })
})
