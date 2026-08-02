/**
 * The salvage path in `writeSceneStructured`.
 *
 * This is the exact bug from planning/CONTEXT-STARVATION-LOOP.md. The repetition
 * guard threw; the catch returned the identical prose one line later with
 * EMPTY_METADATA; `discoverSync` then found nothing to commit, so thirteen
 * committed scenes produced zero characters, locations, plot threads, or graph
 * edges — and with `keyFacts` empty, every following scene was written against
 * the same context as the one before it.
 *
 * Two properties are pinned here:
 *   1. prose that fails its OWN validation is never returned
 *   2. prose salvaged for any OTHER reason still gets its metadata extracted
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockAiStream = vi.fn()
const mockAiGenerateJson = vi.fn()
const mockGuardScene = vi.fn()

vi.mock('@/composables/useAiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args),
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))

vi.mock('@/guardrails/integration/composableGuardrails', () => ({
  guardScene: (...args) => mockGuardScene(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDERS: { OLLAMA: 'ollama' },
  PROVIDER_DEFAULT: 'ollama',
  FEATURE_DEFAULTS: {},
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({
    activeWorkspaceType: 'creative',
    getActivePrompts: vi.fn(() => ({ writer: 'Write vivid prose.' })),
    promptOverrides: { writer: '', critic: '', revisor: '', director: '' }
  })
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: { creative: { writer: 'Write vivid prose.' } }
}))

let useStoryWriter
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  mockGuardScene.mockResolvedValue(undefined)
  useStoryWriter = (await import('@/composables/useStoryWriter')).useStoryWriter
})

const sceneBrief = {
  sceneNumber: 1,
  title: 'The Chamber',
  emotionalGoal: 'Dread',
  whatChanges: 'Kaelen meets the guardian',
  charactersPresent: ['Kaelen'],
  estimatedWords: 400
}
const storyArc = { premise: 'A map', genre: 'Fantasy', tone: 'Dark', centralConflict: 'Truth' }

/** The literal failure shape: a sentence emitted until the token ceiling. */
const LOOPING_PROSE =
  Array.from({ length: 40 }, (_, i) => `Kaelen crossed the ${i} chamber holding the map.`).join(
    ' '
  ) +
  ' ' +
  Array.from({ length: 60 }, () => 'He had no illusions of being any different.').join(' ')

/**
 * Prose varied enough that no 6-gram recurs — the index is woven through each
 * sentence rather than appended to a fixed template. A template like
 * `Sentence ${i} carries its own distinct clause` looks varied but shares the
 * 6-gram "carries its own distinct clause and" across every line, which the
 * repetition guard correctly rejects.
 */
function variedSentence(i) {
  return `The lantern${i} guttered while Kaelen counted ${i} slow steps toward door${i}.`
}
const CLEAN_PROSE = Array.from({ length: 90 }, (_, i) => variedSentence(i)).join(' ')
const LONG_PROSE = Array.from({ length: 200 }, (_, i) => variedSentence(i)).join('\n\n')

const RICH_METADATA = {
  summary: 'Kaelen meets the guardian.',
  usedEntities: { characterNames: ['Kaelen'], locationNames: [], plotThreadTitles: [] },
  newEntities: {
    characters: [{ name: 'The Guardian', role: 'antagonist' }],
    locations: [{ name: 'Sacred Chamber' }],
    plotThreads: []
  },
  networkEvents: [{ type: 'relationship', from: 'Kaelen', to: 'The Guardian', label: 'confronts' }],
  keyFacts: ['Kaelen has entered the sacred chamber.']
}

describe('repetition is not salvageable', () => {
  it('rejects looping prose instead of returning it', async () => {
    mockAiGenerate.mockResolvedValue(LOOPING_PROSE)
    const { writeSceneStructured } = useStoryWriter()

    // Before the fix this resolved, handing back the very text the guard
    // rejected. The guard had therefore never rejected anything.
    await expect(writeSceneStructured({ sceneBrief, storyArc })).rejects.toThrow(/repetitive/i)
  })

  it('never runs the data-commit guard on rejected prose', async () => {
    mockAiGenerate.mockResolvedValue(LOOPING_PROSE)
    const { writeSceneStructured } = useStoryWriter()
    await expect(writeSceneStructured({ sceneBrief, storyArc })).rejects.toThrow()
    expect(mockGuardScene).not.toHaveBeenCalled()
  })

  it('accepts clean prose', async () => {
    mockAiGenerate.mockResolvedValue(CLEAN_PROSE)
    mockAiGenerateJson.mockResolvedValue(RICH_METADATA)
    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief, storyArc })
    expect(result.prose).toContain('lantern0')
    expect(result.structured.metadataStatus).toBe('ok')
  })
})

describe('salvaged prose still yields metadata', () => {
  it('extracts entities when a downstream step fails', async () => {
    mockAiGenerate.mockResolvedValue(CLEAN_PROSE)
    mockAiGenerateJson.mockResolvedValue(RICH_METADATA)
    // A guardrail failure is a legitimate salvage case: the prose is fine.
    mockGuardScene.mockRejectedValue(new Error('guardrail unavailable'))

    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief, storyArc })

    expect(result.prose).toContain('lantern0')
    // The whole point: a salvaged scene must still feed the bible and the
    // chapter ledger, or the next scene is written blind.
    expect(result.structured.newEntities.characters).toHaveLength(1)
    expect(result.structured.keyFacts).toEqual(['Kaelen has entered the sacred chamber.'])
    expect(result.structured.networkEvents).toHaveLength(1)
  })

  it('reports metadataStatus so an empty result is not ambiguous', async () => {
    mockAiGenerate.mockResolvedValue(CLEAN_PROSE)
    mockAiGenerateJson.mockRejectedValue(new Error('extractor down'))

    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief, storyArc })

    // Empty, but explicitly because extraction failed — not because the scene
    // genuinely established nothing.
    expect(result.structured.metadataStatus).toBe('failed')
    expect(result.structured.newEntities.characters).toHaveLength(0)
  })

  it('still throws when there is no prose at all to salvage', async () => {
    mockAiGenerate.mockRejectedValue(new Error('provider offline'))
    const { writeSceneStructured } = useStoryWriter()
    await expect(writeSceneStructured({ sceneBrief, storyArc })).rejects.toThrow(/provider offline/)
  })
})

describe('metadata extraction covers the whole scene', () => {
  it('chunks prose past the single-call limit instead of truncating it', async () => {
    // ~14k chars: previously `slice(0, 6000)` made the last ~57% of this scene
    // structurally invisible to entity and fact extraction.
    expect(LONG_PROSE.length).toBeGreaterThan(12000)

    mockAiGenerate.mockResolvedValue(LONG_PROSE)
    mockAiGenerateJson.mockResolvedValue(RICH_METADATA)

    const { writeSceneStructured } = useStoryWriter()
    await writeSceneStructured({ sceneBrief, storyArc })

    expect(mockAiGenerateJson.mock.calls.length).toBeGreaterThan(1)

    // Every chunk must reach the model — the tail is where late-scene facts live.
    const sent = mockAiGenerateJson.mock.calls.map((c) => c[0]).join('\n')
    expect(sent).toContain('lantern0 ')
    expect(sent).toContain('lantern199 ')
  })

  it('unions entities across chunks without duplicating them', async () => {
    mockAiGenerate.mockResolvedValue(LONG_PROSE)
    // Same character reported by every chunk, plus one unique to a later chunk.
    mockAiGenerateJson.mockResolvedValueOnce(RICH_METADATA).mockResolvedValue({
      ...RICH_METADATA,
      newEntities: {
        characters: [{ name: 'The Guardian', role: 'antagonist' }, { name: 'Sofronie' }],
        locations: [],
        plotThreads: []
      }
    })

    const { writeSceneStructured } = useStoryWriter()
    const result = await writeSceneStructured({ sceneBrief, storyArc })

    const names = result.structured.newEntities.characters.map((c) => c.name).sort()
    expect(names).toEqual(['Sofronie', 'The Guardian'])
    expect(result.structured.keyFacts).toEqual(['Kaelen has entered the sacred chamber.'])
  })
})
