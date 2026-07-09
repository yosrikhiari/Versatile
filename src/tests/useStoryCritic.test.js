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

vi.mock('../config/evalDimensions', () => ({
  getDimensionNames: vi.fn()
}))

vi.mock('../config/ai', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, FEATURES: { STORY_GENERATION: 'story_generation' } }
})

vi.mock('../stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    activeWorkspaceType: 'creative'
  }))
}))

const mockCreativeDims = ['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing']

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(evalDimensions.getDimensionNames).mockReturnValue(mockCreativeDims)
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
    vi.mocked(useProjectStore).mockReturnValue({ activeWorkspaceType: 'legal' })

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
