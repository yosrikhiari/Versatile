import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAiGenerateJson = vi.fn()
const mockAddRels = vi.fn(async () => [])
const mockAddEdges = vi.fn(async () => [])
const mockGetRels = vi.fn(async () => [])
const mockGetEdges = vi.fn(async () => [])
const mockUpdateRel = vi.fn(async () => undefined)
const mockUpdateEdge = vi.fn(async () => undefined)

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))
vi.mock('@/config/ai', () => ({ FEATURES: { NETWORK: 'network' } }))
vi.mock('@/services/dbService', () => ({
  addCharacterRelationshipsBatch: (...a) => mockAddRels(...a),
  addGraphEdgesBatch: (...a) => mockAddEdges(...a),
  getCharacterRelationships: (...a) => mockGetRels(...a),
  getGraphEdges: (...a) => mockGetEdges(...a),
  updateCharacterRelationship: (...a) => mockUpdateRel(...a),
  updateGraphEdge: (...a) => mockUpdateEdge(...a)
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
    expect(res).toMatchObject({
      characterRelationships: 0,
      graphEdges: 0,
      reason: 'too_few_characters'
    })
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
    mockAiGenerateJson.mockResolvedValueOnce({ characterRelationships: [] }).mockResolvedValueOnce({
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
    // Retried: the cast has a location and a plot thread and the model returned
    // links for neither. Coverage per category decides whether to try again — a
    // bare "total > 0" gate accepted this and left both nodes orphaned.
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
  })

  it('retries when the model covers only the character↔character category', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({
        characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }]
      })
      .mockResolvedValueOnce({
        characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }],
        characterLocations: [{ character: 'Alice', location: 'The Keep' }],
        characterPlotThreads: [{ character: 'Bob', plotThread: 'The Prophecy' }]
      })
    const res = await generateRelationships(cast)
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    // The second attempt's location and plot-thread links are what reach the graph.
    expect(res.graphEdges).toBe(2)
    expect(res.reason).toBe('ok')
  })

  it('keeps the fuller first attempt when the retry comes back thinner', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({
        characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }],
        characterLocations: [{ character: 'Alice', location: 'The Keep' }]
      })
      .mockResolvedValueOnce({
        characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }]
      })
    const res = await generateRelationships(cast)
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    // Attempt 1's location edge survives; a retry must not erase coverage.
    expect(res.graphEdges).toBe(1)
  })

  // The stage watchdog cancels by aborting the signal. Treating that abort as
  // "the model came back empty" fired a second request at a provider the stage
  // no longer owned — and then wrote its result to a stage already marked failed.
  it('stops instead of retrying once the caller aborts', async () => {
    const controller = new AbortController()
    mockAiGenerateJson.mockImplementation(async () => {
      controller.abort()
      throw new Error('Aborted')
    })

    const err = await generateRelationships({ ...cast, signal: controller.signal }).catch((e) => e)

    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1)
    expect(err.name).toBe('AbortError')
    expect(mockAddRels).not.toHaveBeenCalled()
    expect(mockAddEdges).not.toHaveBeenCalled()
  })

  it('forwards a progress hook so the stage can heartbeat on tokens', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }]
    })
    const onProgress = vi.fn()
    await generateRelationships({ ...cast, onProgress })
    expect(mockAiGenerateJson.mock.calls[0][2].onToken).toBe(onProgress)
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

// The base is laid once, and everything after it is a chapter's contribution.
// This stage used to re-derive the whole project's network from the synopsis on
// every run, at temperature 0.5, with no memory of what it decided last time —
// so a second volume re-answered a question the first had already answered,
// differently, and the difference was then discarded by the dedupe.
describe('generateRelationships — seeding', () => {
  it('makes no model call at all when the network already exists', async () => {
    mockGetEdges.mockResolvedValue([{ id: 1, sourceId: '1', targetId: '2' }])
    const res = await generateRelationships({ ...cast, seedOnly: true })
    expect(res.reason).toBe('already_seeded')
    expect(mockAiGenerateJson).not.toHaveBeenCalled()
    expect(mockAddEdges).not.toHaveBeenCalled()
  })

  it('treats existing character relationships as a network too', async () => {
    mockGetRels.mockResolvedValue([{ id: 1, fromCharacterId: 1, toCharacterId: 2, type: 'ally' }])
    const res = await generateRelationships({ ...cast, seedOnly: true })
    expect(res.reason).toBe('already_seeded')
    expect(mockAiGenerateJson).not.toHaveBeenCalled()
  })

  it('lays the base when there is nothing there', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }]
    })
    const res = await generateRelationships({ ...cast, seedOnly: true })
    expect(res.reason).not.toBe('already_seeded')
    expect(mockAiGenerateJson).toHaveBeenCalled()
  })

  it('stamps the opening claims at the chapter it was told', async () => {
    mockAiGenerateJson.mockResolvedValue({
      characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally' }],
      characterLocations: [{ character: 'Alice', location: 'The Keep', relationship: 'home' }]
    })
    await generateRelationships({ ...cast, atChapter: 1, runId: 'run-7', volumeId: 'v1' })
    expect(mockAddEdges.mock.calls[0][1][0]).toMatchObject({
      validFromChapter: 1,
      validUntilChapter: null,
      runId: 'run-7',
      volumeId: 'v1'
    })
  })

  it('closes an earlier claim when a later chapter reverses it', async () => {
    mockGetRels.mockResolvedValue([
      { id: 5, fromCharacterId: 1, toCharacterId: 2, type: 'ally', validFromChapter: 1 }
    ])
    mockAiGenerateJson.mockResolvedValue({
      characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'enemy' }]
    })
    const res = await generateRelationships({ ...cast, atChapter: 13 })
    expect(mockUpdateRel).toHaveBeenCalledWith(5, { validUntilChapter: 12 })
    expect(res.superseded).toBe(1)
    expect(res.characterRelationships).toBe(1)
  })
})
