import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  gateDimensionCoverage,
  gateScoreDistribution,
  gateRevisionEffectiveness
} from '../../services/evalGates'
import { computeDegradation } from '../../services/degradation'

const mockAiGenerate = vi.fn()
const mockAiStream = vi.fn()
const mockAiGenerateJson = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative',
  getActivePrompts: vi.fn(() => ({
    writer: 'You are a creative writer.',
    critic: 'You are a story critic.'
  })),
  promptOverrides: { writer: '', critic: '', revisor: '', director: '' }
}

vi.mock('@/composables/useAiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args),
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDERS: { OLLAMA: 'ollama' },
  PROVIDER_DEFAULT: 'ollama',
  FEATURE_DEFAULTS: {},
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: {
    creative: { writer: 'You are a creative writer.' },
    academic: { writer: 'You are an academic writer.' }
  }
}))

// evalDimensions is a static module (no composable state) — keep it real
vi.unmock('@/config/evalDimensions')

const baseBrief = {
  sceneNumber: 1,
  title: 'The Beginning',
  emotionalGoal: 'Hope',
  whatChanges: 'Hero starts journey',
  charactersPresent: ['John'],
  characterWants: { John: 'Find purpose' },
  setup: 'Establishes world',
  payoff: 'none',
  sensoryAnchor: 'Dawn light',
  tension: 'medium',
  pacing: 'slow',
  estimatedWords: 500
}

const defaultArc = {
  premise: 'Test',
  genre: 'Fantasy',
  tone: 'Dark',
  centralConflict: 'Good vs Evil'
}

const mockMetadata = {
  summary: 'John begins his journey at dawn.',
  usedEntities: { characterNames: ['John'], locationNames: [], plotThreadTitles: [] },
  newEntities: { characters: [], locations: [], plotThreads: [] },
  networkEvents: [],
  keyFacts: []
}

const mockCritique = {
  score: 8,
  pass: true,
  dimensionScores: {
    continuity: 8,
    voice: 7,
    pacing: 9,
    show_tell: 6,
    emotional_goal: 8
  },
  issues: [{ type: 'show_tell', severity: 'minor', text: 'Occasional telling' }],
  strengths: ['Strong pacing', 'Clear emotional arc']
}

describe('Writer → Critic → Quality Gates pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('produces prose through writer and evaluates it through critic', async () => {
    mockAiGenerate.mockResolvedValue('Once upon a time, John embarked on his journey.')
    mockAiGenerateJson.mockResolvedValueOnce(mockMetadata).mockResolvedValueOnce(mockCritique)

    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const { useStoryCritic } = await import('@/composables/useStoryCritic')

    const writer = useStoryWriter()
    const writerResult = await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc
    })

    expect(writerResult.prose).toBeTruthy()
    expect(writerResult.structured.summary).toBe('John begins his journey at dawn.')

    const critic = useStoryCritic()
    const critique = await critic.evaluateScene({
      draft: writerResult.prose,
      sceneBrief: baseBrief,
      storyBible: JSON.stringify({ characters: [{ name: 'John' }] }),
      chapterLog: '',
      existingEntitiesJson: '',
      focusInstructions: ''
    })

    // `pass` is derived from the dimension scores now, not from `score`. This
    // fixture reports score 8 (above the threshold of 7) but `show_tell: 6`,
    // and one badly weak dimension fails the scene — which is the entire point:
    // the recorded corpus showed good-pass, borderline, and a deliberately
    // broken clear-fail ALL scoring 8/10, so a verdict taken from `score` could
    // not tell them apart. See services/criticVerdict.ts.
    expect(critique.pass).toBe(false)
    expect(critique.verdictReason).toMatch(/show_tell scored 6/)
    expect(critique.weakestDimension).toEqual({ name: 'show_tell', score: 6 })
    // The self-reported score is still recorded, just no longer authoritative.
    expect(critique.score).toBe(8)
    expect(critique.dimensionScores.continuity).toBe(8)
    expect(critique.issues).toHaveLength(1)
    expect(critique.strengths).toHaveLength(2)
  })

  it('passes a scene whose weakest dimension clears the bar', async () => {
    mockAiGenerate.mockResolvedValue('Once upon a time, John embarked on his journey.')
    mockAiGenerateJson.mockResolvedValueOnce(mockMetadata).mockResolvedValueOnce({
      ...mockCritique,
      dimensionScores: { continuity: 8, voice: 7, pacing: 9, show_tell: 7, emotional_goal: 8 }
    })

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const writer = useStoryWriter()
    const writerResult = await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc
    })

    const critique = await useStoryCritic().evaluateScene({
      draft: writerResult.prose,
      sceneBrief: baseBrief,
      storyBible: JSON.stringify({ characters: [{ name: 'John' }] }),
      chapterLog: '',
      existingEntitiesJson: '',
      focusInstructions: ''
    })

    expect(critique.pass).toBe(true)
    expect(critique.weakestDimension.score).toBeGreaterThanOrEqual(7)
  })

  it('writer uses real context fitting and returns structured prose', async () => {
    mockAiGenerate.mockResolvedValue('Chapter 1 prose.')
    mockAiGenerateJson.mockResolvedValue(mockMetadata)

    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const writer = useStoryWriter()

    const result = await writer.writeSceneStructured({
      sceneBrief: { ...baseBrief, estimatedWords: 1200 },
      storyArc: defaultArc,
      storyBible: 'Style Guide: write with vivid sensory detail.',
      storyContract: 'Magic has a cost.'
    })

    expect(result.prose).toBe('Chapter 1 prose.')
    expect(result.structured).toBeDefined()
    expect(result.structured.prose).toBe('Chapter 1 prose.')
  })

  it('quality gates validate critic output end-to-end', async () => {
    mockAiGenerate.mockResolvedValue('Some prose.')
    mockAiGenerateJson.mockResolvedValueOnce(mockMetadata).mockResolvedValueOnce(mockCritique)

    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const { useStoryCritic } = await import('@/composables/useStoryCritic')

    const writer = useStoryWriter()
    const writerResult = await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc
    })

    const critic = useStoryCritic()
    const critique = await critic.evaluateScene({
      draft: writerResult.prose,
      sceneBrief: baseBrief,
      storyBible: '',
      chapterLog: '',
      existingEntitiesJson: '',
      focusInstructions: ''
    })

    const coverage = gateDimensionCoverage(critique)
    expect(coverage.pass).toBe(true)

    const distribution = gateScoreDistribution(critique, { min: 5 })
    expect(distribution.pass).toBe(true)

    const degradation = computeDegradation(critique, critique)
    expect(degradation.hasRegressions).toBe(false)
  })

  it('handles failed critic gracefully (eval unavailable)', async () => {
    mockAiGenerate.mockResolvedValue('Some prose.')
    mockAiGenerateJson
      .mockResolvedValueOnce(mockMetadata)
      .mockRejectedValueOnce(new Error('Critic failed'))

    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const { useStoryCritic } = await import('@/composables/useStoryCritic')

    const writer = useStoryWriter()
    const writerResult = await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc
    })

    const critic = useStoryCritic()
    const critique = await critic.evaluateScene({
      draft: writerResult.prose,
      sceneBrief: baseBrief,
      storyBible: '',
      chapterLog: '',
      existingEntitiesJson: '',
      focusInstructions: ''
    })

    expect(critique.pass).toBe(true)
    expect(critique.score).toBeNull()
    expect(critique.evalUnavailable).toBe(true)
  })

  it('critic parses dimension scores correctly', async () => {
    const mockCritiqueWithDims = {
      score: 6,
      pass: true,
      dimensionScores: {
        continuity: 8,
        voice: 6,
        pacing: 7,
        show_tell: 5,
        emotional_goal: 9
      },
      issues: [{ type: 'show_tell', severity: 'minor', text: 'Some telling' }],
      strengths: ['Consistent worldbuilding']
    }

    mockAiGenerate.mockResolvedValue('Draft prose.')
    mockAiGenerateJson
      .mockResolvedValueOnce(mockMetadata)
      .mockResolvedValueOnce(mockCritiqueWithDims)

    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const { useStoryCritic } = await import('@/composables/useStoryCritic')

    const writer = useStoryWriter()
    const writerResult = await writer.writeSceneStructured({
      sceneBrief: baseBrief,
      storyArc: defaultArc
    })

    const critic = useStoryCritic()
    const critique = await critic.evaluateScene({
      draft: writerResult.prose,
      sceneBrief: baseBrief,
      storyBible: '',
      chapterLog: '',
      existingEntitiesJson: '',
      focusInstructions: ''
    })

    expect(critique.dimensionScores.continuity).toBe(8)
    expect(critique.dimensionScores.voice).toBe(6)
    expect(critique.dimensionScores.pacing).toBe(7)
    expect(critique.dimensionScores.show_tell).toBe(5)
    expect(critique.dimensionScores.emotional_goal).toBe(9)

    const distribution = gateScoreDistribution(critique)
    expect(distribution.pass).toBe(true)
  })
})
