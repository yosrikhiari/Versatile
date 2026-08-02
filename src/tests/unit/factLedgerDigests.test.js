/**
 * The fact ledger reads digests instead of re-deriving them.
 *
 * This is the change that makes whole-manuscript analysis tractable. The loop
 * was one sequential, awaited LLM call per scene; with local inference
 * serialised to a single in-flight request that is roughly `n x 20s` — about
 * 3.3 hours for 300 chapters, every time the beta reader ran.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAiGenerateJson = vi.fn()
const mockGetProjectDigests = vi.fn()

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...a) => mockAiGenerateJson(...a)
}))
vi.mock('@/services/db-digests', () => ({
  getProjectDigests: (...a) => mockGetProjectDigests(...a)
}))

let extractAllFacts, buildSceneDigest
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mockAiGenerateJson.mockResolvedValue({
    facts: { characters: ['FromLLM'], locations: [], events: [], objects: [], timeline: '' }
  })
  mockGetProjectDigests.mockResolvedValue([])
  extractAllFacts = (await import('@/composables/betareader/factLedger')).extractAllFacts
  buildSceneDigest = (await import('@/services/generation/sceneDigest')).buildSceneDigest
})

const scenes = [
  { id: 's1', sceneNumber: 1, title: 'One', content: 'Kaelen crossed the shattered stone alone.' },
  { id: 's2', sceneNumber: 2, title: 'Two', content: 'The guardian spoke from the dark.' }
]

function digestFor(scene, extra = {}) {
  return buildSceneDigest({
    projectId: 'p1',
    subsectionId: scene.id,
    prose: scene.content,
    structured: {
      summary: `Summary of ${scene.title}`,
      usedEntities: { characterNames: ['Kaelen'], locationNames: ['Chamber'] },
      keyFacts: [`Fact from ${scene.title}`],
      metadataStatus: 'ok'
    },
    scene,
    ...extra
  })
}

describe('digest-backed fact ledger', () => {
  it('makes zero LLM calls when every scene has a fresh digest', async () => {
    mockGetProjectDigests.mockResolvedValue(scenes.map((s) => digestFor(s)))

    const ledger = await extractAllFacts(scenes, {}, 'p1')

    expect(mockAiGenerateJson).not.toHaveBeenCalled()
    expect(ledger).toHaveLength(2)
    expect(ledger.every((l) => l.fromDigest)).toBe(true)
    expect(ledger[0].facts.characters).toEqual(['Kaelen'])
    expect(ledger[0].facts.events).toEqual(['Fact from One'])
  })

  it('calls the model only for scenes whose digest is missing', async () => {
    mockGetProjectDigests.mockResolvedValue([digestFor(scenes[0])])

    const ledger = await extractAllFacts(scenes, {}, 'p1')

    // O(dirty), not O(n) — one call for one uncovered scene.
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1)
    expect(ledger[0].fromDigest).toBe(true)
    expect(ledger[1].fromDigest).toBe(false)
    expect(ledger[1].facts.characters).toEqual(['FromLLM'])
  })

  it('recomputes a scene whose prose changed after its digest was built', async () => {
    mockGetProjectDigests.mockResolvedValue(scenes.map((s) => digestFor(s)))
    const edited = [
      { ...scenes[0], content: 'Kaelen crossed the stone, and hesitated.' },
      scenes[1]
    ]

    const ledger = await extractAllFacts(edited, {}, 'p1')

    // The hash no longer matches, so the stale digest must not be trusted.
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(1)
    expect(ledger[0].fromDigest).toBe(false)
    expect(ledger[1].fromDigest).toBe(true)
  })

  it('falls back to the old behaviour with no projectId', async () => {
    const ledger = await extractAllFacts(scenes, {})
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    expect(mockGetProjectDigests).not.toHaveBeenCalled()
    expect(ledger.every((l) => !l.fromDigest)).toBe(true)
  })

  it('falls back to the old behaviour when the digest lookup fails', async () => {
    mockGetProjectDigests.mockRejectedValue(new Error('db closed'))
    const ledger = await extractAllFacts(scenes, {}, 'p1')
    // Degrading to the previous cost is acceptable; failing the scan is not.
    expect(mockAiGenerateJson).toHaveBeenCalledTimes(2)
    expect(ledger).toHaveLength(2)
  })

  it('keeps the ledger shape identical on both paths', async () => {
    mockGetProjectDigests.mockResolvedValue([digestFor(scenes[0])])
    const ledger = await extractAllFacts(scenes, {}, 'p1')
    for (const entry of ledger) {
      expect(entry).toMatchObject({
        sceneId: expect.any(String),
        sceneTitle: expect.any(String),
        sceneNumber: expect.any(Number)
      })
      for (const k of ['characters', 'locations', 'events', 'objects']) {
        expect(Array.isArray(entry.facts[k])).toBe(true)
      }
      expect(typeof entry.facts.timeline).toBe('string')
    }
  })
})
