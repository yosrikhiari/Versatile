import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStoryCritic } from '../composables/useStoryCritic'
import * as evalDimensions from '../config/evalDimensions'

vi.mock('../services/aiService', () => {
  const aiGenerate = vi.fn()
  // The critic now uses structured output; mock it to delegate to the same
  // aiGenerate spy and parse its JSON, so existing assertions still hold.
  const aiGenerateStructured = async (...args) => {
    const r = await aiGenerate(...args)
    if (r && typeof r === 'object') return r
    const cleaned = String(r)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('structured parse failed')
    return JSON.parse(m[0])
  }
  return { aiGenerate, aiGenerateStructured }
})

// Only `getDimensionNames` is stubbed — the rest of the module stays real.
// Replacing the whole module left `getDefaultThreshold` undefined, and
// evaluateScene calls it right after building dimensionScores: it threw, the
// outer catch swallowed it, and every case returned the evalUnavailable shape
// with no dimensionScores at all. The assertions were testing the error path.
vi.mock('../config/evalDimensions', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getDimensionNames: vi.fn() }
})

vi.mock('../config/ai', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, FEATURES: { STORY_GENERATION: 'story_generation' } }
})

vi.mock('../stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    activeWorkspaceType: 'creative',
    // evaluateScene reads activePrompts.critic — supply a minimal stub.
    getActivePrompts: vi.fn(() => ({ critic: 'You are a story critic.' }))
  }))
}))

const mockCreativeDims = ['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing']

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalDimensions.getDimensionNames).mockReturnValue(mockCreativeDims)
})

// These tests cover the COMBINED critic (one call, five scores) and the
// pipeline wired to it; its mocks answer in that shape. The focused critic is
// the default since §24 and has its own tests (criticIsolation.test.js), so
// pin the combined one here rather than let the default change what is tested.
beforeEach(() => {
  localStorage.setItem('versatile_critic_focused', 'false')
})
describe('useStoryCritic — dimensionScores extraction', () => {
  async function assertDimensionScores(aiResponseText, expectations) {
    const { aiGenerate } = await import('../services/aiService')
    vi.mocked(aiGenerate).mockResolvedValue(aiResponseText)

    const critic = useStoryCritic()
    const result = await critic.evaluateScene({
      draft: 'Once upon a time...',
      sceneBrief: {
        title: 'Test',
        emotionalGoal: 'joy',
        charactersPresent: ['Hero'],
        payoff: 'win',
        tension: 'medium'
      },
      storyBible: '',
      chapterLog: ''
    })

    for (const [dim, expected] of Object.entries(expectations)) {
      expect(result.dimensionScores[dim]).toBe(expected)
    }
  }

  it('extracts all valid dimension scores from LLM response', async () => {
    const aiResponse = JSON.stringify({
      pass: false,
      score: 6,
      issues: [{ type: 'continuity', severity: 'major' }],
      strengths: [],
      dimensionScores: {
        continuity: 4,
        voice: 7,
        emotional_goal: 6,
        show_tell: 8,
        pacing: 5
      }
    })

    await assertDimensionScores(aiResponse, {
      continuity: 4,
      voice: 7,
      emotional_goal: 6,
      show_tell: 8,
      pacing: 5
    })
  })

  it('sets out-of-range scores to null', async () => {
    const aiResponse = JSON.stringify({
      dimensionScores: {
        continuity: 0,
        voice: 11,
        emotional_goal: -1,
        show_tell: 15,
        pacing: 5
      }
    })

    await assertDimensionScores(aiResponse, {
      continuity: null,
      voice: null,
      emotional_goal: null,
      show_tell: null,
      pacing: 5
    })
  })

  it('sets missing dimensions to null', async () => {
    const aiResponse = JSON.stringify({
      dimensionScores: {
        continuity: 8,
        voice: 7
      }
    })

    await assertDimensionScores(aiResponse, {
      continuity: 8,
      voice: 7,
      emotional_goal: null,
      show_tell: null,
      pacing: null
    })
  })

  it('handles non-numeric scores as null', async () => {
    const aiResponse = JSON.stringify({
      dimensionScores: {
        continuity: 'good',
        voice: null,
        emotional_goal: undefined,
        show_tell: true,
        pacing: 5
      }
    })

    await assertDimensionScores(aiResponse, {
      continuity: null,
      voice: null,
      emotional_goal: null,
      show_tell: null,
      pacing: 5
    })
  })

  it('handles missing dimensionScores field gracefully', async () => {
    const aiResponse = JSON.stringify({
      score: 6,
      issues: []
    })

    await assertDimensionScores(aiResponse, {
      continuity: null,
      voice: null,
      emotional_goal: null,
      show_tell: null,
      pacing: null
    })
  })

  it('handles workspace-specific dimension names (legal)', async () => {
    const legalDims = ['legal_accuracy', 'clarity', 'compliance', 'argument_strength']
    vi.mocked(evalDimensions.getDimensionNames).mockReturnValue(legalDims)
    const { useProjectStore } = await import('../stores/projectStore')
    vi.mocked(useProjectStore).mockReturnValue({
      activeWorkspaceType: 'legal',
      getActivePrompts: vi.fn(() => ({ critic: 'You are a legal critic.' }))
    })

    const aiResponse = JSON.stringify({
      dimensionScores: {
        legal_accuracy: 9,
        clarity: 8,
        compliance: 7,
        argument_strength: 9
      }
    })

    const { aiGenerate } = await import('../services/aiService')
    vi.mocked(aiGenerate).mockResolvedValue(aiResponse)

    const critic = useStoryCritic()
    const result = await critic.evaluateScene({
      draft: 'Legal text...',
      sceneBrief: {
        title: 'Test',
        emotionalGoal: '',
        charactersPresent: [],
        payoff: '',
        tension: ''
      },
      storyBible: '',
      chapterLog: ''
    })

    expect(result.dimensionScores).toEqual({
      legal_accuracy: 9,
      clarity: 8,
      compliance: 7,
      argument_strength: 9
    })
  })

  it('passes a valid score of 1 (minimum) without conversion', async () => {
    const aiResponse = JSON.stringify({
      dimensionScores: {
        continuity: 1,
        voice: 5,
        emotional_goal: 10,
        show_tell: 3,
        pacing: 2
      }
    })

    await assertDimensionScores(aiResponse, { continuity: 1, pacing: 2 })
    const { aiGenerate } = await import('../services/aiService')
    expect(vi.mocked(aiGenerate)).toHaveBeenCalledTimes(1)
  })
})

describe('useStoryCritic — a critique with no judgement is not a verdict', () => {
  const brief = {
    title: 'Test',
    emotionalGoal: 'joy',
    charactersPresent: ['Hero'],
    payoff: 'win',
    tension: 'medium'
  }

  it('requires every field in the schema it sends, with the dimensions named', async () => {
    const { aiGenerate } = await import('../services/aiService')
    vi.mocked(aiGenerate).mockResolvedValue(
      JSON.stringify({
        score: 8,
        dimensionScores: { continuity: 8, voice: 8, emotional_goal: 8, show_tell: 8, pacing: 8 },
        issues: [],
        strengths: [],
        pass: true
      })
    )
    await useStoryCritic().evaluateScene({
      draft: 'x',
      sceneBrief: brief,
      storyBible: '',
      chapterLog: ''
    })
    const opts = vi.mocked(aiGenerate).mock.calls[0][2]
    expect(opts.schema.required).toEqual(
      expect.arrayContaining(['score', 'dimensionScores', 'issues', 'strengths', 'pass'])
    )
    expect(opts.schema.properties.dimensionScores.required).toEqual(mockCreativeDims)
    expect(Object.keys(opts.schema.properties)[0]).toBe('score')
  })

  it('retries once, then reports evalUnavailable instead of fabricating a 7', async () => {
    // What qwen3:8b returned on 30 of 30 scenes of a real run under the
    // optional-field schema. The old parse made this `score: 7, issues: []`
    // and the verdict passed on the self-reported score.
    const { aiGenerate } = await import('../services/aiService')
    vi.mocked(aiGenerate).mockResolvedValue(JSON.stringify({ pass: true, strengths: ['vivid'] }))

    const result = await useStoryCritic().evaluateScene({
      draft: 'x',
      sceneBrief: brief,
      storyBible: '',
      chapterLog: ''
    })
    expect(vi.mocked(aiGenerate)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(aiGenerate).mock.calls[1][0]).toMatch(/omitted "score" and "dimensionScores"/)
    expect(result.evalUnavailable).toBe(true)
    expect(result.score).toBeNull()
    expect(result.strengths).toEqual(['vivid'])
  })

  it('accepts the retry when it carries a judgement', async () => {
    const { aiGenerate } = await import('../services/aiService')
    vi.mocked(aiGenerate)
      .mockResolvedValueOnce(JSON.stringify({ pass: true, strengths: [] }))
      .mockResolvedValueOnce(
        JSON.stringify({
          score: 6,
          dimensionScores: { continuity: 8, voice: 6, emotional_goal: 7, show_tell: 6, pacing: 7 },
          issues: [{ type: 'voice', severity: 'minor', description: 'flat' }],
          strengths: [],
          pass: false
        })
      )
    const result = await useStoryCritic().evaluateScene({
      draft: 'x',
      sceneBrief: brief,
      storyBible: '',
      chapterLog: ''
    })
    expect(result.evalUnavailable).toBeUndefined()
    expect(result.score).toBe(6)
    expect(result.dimensionScores.voice).toBe(6)
    expect(result.pass).toBe(false)
  })

  it('derives a missing overall score from the dimension scores, never from a constant', async () => {
    const { aiGenerate } = await import('../services/aiService')
    vi.mocked(aiGenerate).mockResolvedValue(
      JSON.stringify({
        dimensionScores: { continuity: 9, voice: 8, emotional_goal: 8, show_tell: 8, pacing: 7 },
        issues: [],
        strengths: [],
        pass: true
      })
    )
    const result = await useStoryCritic().evaluateScene({
      draft: 'x',
      sceneBrief: brief,
      storyBible: '',
      chapterLog: ''
    })
    expect(vi.mocked(aiGenerate)).toHaveBeenCalledTimes(1)
    expect(result.score).toBe(8)
    expect(result.evalUnavailable).toBeUndefined()
  })
})
