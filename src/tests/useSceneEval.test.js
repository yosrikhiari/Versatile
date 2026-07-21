import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEvaluateScene = vi.fn()
const mockReviseScene = vi.fn()

vi.mock('../composables/useStoryCritic', () => ({
  useStoryCritic: () => ({
    evaluateScene: mockEvaluateScene
  })
}))

vi.mock('../composables/useStoryRevisor', () => ({
  useStoryRevisor: () => ({
    reviseScene: mockReviseScene
  })
}))

vi.mock('../services/evalGates', async () => {
  const actual = await vi.importActual('../services/evalGates')
  return {
    ...actual,
    gateRevisionEffectiveness: vi.fn().mockResolvedValue({
      pass: true,
      delta: 2,
      regressions: []
    })
  }
})

import { useSceneEval } from '../composables/useSceneEval'

const mockCreativeScene = {
  title: 'Opening Scene',
  prose:
    'Once upon a time there was a story with enough words to pass the prose check and get evaluated properly.',
  characters: ['Hero', 'Villain']
}

const mockPlanItem = {
  title: 'Opening Scene',
  emotionalGoal: 'intrigue',
  charactersPresent: ['Hero', 'Villain'],
  payoff: 'sets up conflict',
  tension: 'medium'
}

const critiqueResponse = {
  pass: true,
  score: 8,
  dimensionScores: {
    continuity: 7,
    voice: 8,
    emotional_goal: 9,
    show_tell: 6,
    pacing: 8
  },
  issues: [
    { type: 'continuity', severity: 'minor', feedback: 'ok' },
    { type: 'voice', severity: 'minor', feedback: 'ok' },
    { type: 'emotional_goal', severity: 'minor', feedback: 'ok' },
    { type: 'show_tell', severity: 'minor', feedback: 'ok' },
    { type: 'pacing', severity: 'minor', feedback: 'ok' }
  ],
  strengths: ['Good opening hook']
}

const betterCritiqueResponse = {
  pass: true,
  score: 9,
  dimensionScores: {
    continuity: 8,
    voice: 9,
    emotional_goal: 10,
    show_tell: 7,
    pacing: 9
  },
  issues: [],
  strengths: ['Tight pacing', 'Strong voice']
}

describe('useSceneEval', () => {
  let evalComposable

  beforeEach(() => {
    vi.clearAllMocks()
    mockEvaluateScene.mockResolvedValue(critiqueResponse)
    mockReviseScene.mockResolvedValue(
      'Revised prose with improvements and more words for better quality.'
    )
    evalComposable = useSceneEval()
  })

  describe('initial state', () => {
    it('starts with correct default values', () => {
      expect(evalComposable.isEvaluating.value).toBe(false)
      expect(evalComposable.isRevising.value).toBe(false)
      expect(evalComposable.hasBeenEvaluated.value).toBe(false)
      expect(evalComposable.critiqueResult.value).toBeNull()
      expect(evalComposable.gateResults.value).toEqual({
        dimensionCoverage: null,
        scoreDistribution: null,
        revisionEffectiveness: null
      })
      expect(evalComposable.revisionResult.value).toBeNull()
    })
  })

  describe('evaluate', () => {
    it('returns early when scene has no prose', async () => {
      await evalComposable.evaluate({ title: 'Empty' }, 'creative')
      expect(mockEvaluateScene).not.toHaveBeenCalled()
      expect(evalComposable.critiqueResult.value).toBeNull()
    })

    it('calls evaluateScene and updates critiqueResult', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)

      expect(mockEvaluateScene).toHaveBeenCalledTimes(1)
      expect(mockEvaluateScene).toHaveBeenCalledWith({
        draft: mockCreativeScene.prose,
        sceneBrief: expect.objectContaining({
          title: 'Opening Scene',
          emotionalGoal: 'intrigue',
          charactersPresent: ['Hero', 'Villain']
        }),
        storyBible: '',
        chapterLog: '',
        focusInstructions: ''
      })

      expect(evalComposable.critiqueResult.value).toEqual(critiqueResponse)
      expect(evalComposable.hasBeenEvaluated.value).toBe(true)
    })

    it('computes gate results after evaluation', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)

      const gates = evalComposable.gateResults.value
      expect(gates.dimensionCoverage).not.toBeNull()
      expect(gates.scoreDistribution).not.toBeNull()
      expect(gates.revisionEffectiveness).toBeNull()
    })

    it('sets isEvaluating correctly', async () => {
      const promise = evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      expect(evalComposable.isEvaluating.value).toBe(true)
      await promise
      expect(evalComposable.isEvaluating.value).toBe(false)
    })

    it('handles evaluateScene failure gracefully', async () => {
      mockEvaluateScene.mockRejectedValueOnce(new Error('API error'))
      await evalComposable.evaluate(mockCreativeScene, 'creative')

      expect(evalComposable.critiqueResult.value).toEqual({
        pass: true,
        score: 7,
        dimensionScores: {},
        issues: [],
        strengths: ['Evaluation failed — defaulting to pass']
      })
    })

    it('builds scene brief with fallback values', async () => {
      const minimalScene = { prose: 'Some prose here for testing purposes.' }
      await evalComposable.evaluate(minimalScene, 'creative')

      expect(mockEvaluateScene).toHaveBeenCalledWith({
        draft: minimalScene.prose,
        sceneBrief: expect.objectContaining({
          title: 'Untitled',
          emotionalGoal: '',
          charactersPresent: []
        }),
        storyBible: '',
        chapterLog: '',
        focusInstructions: ''
      })
    })

    it('accepts scene without scenePlanItem', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative')
      expect(mockEvaluateScene).toHaveBeenCalled()
      expect(evalComposable.critiqueResult.value).toEqual(critiqueResponse)
    })
  })

  describe('revise', () => {
    it('returns early if no critique exists', async () => {
      await evalComposable.revise(mockCreativeScene, 'creative')
      expect(mockReviseScene).not.toHaveBeenCalled()
    })

    it('calls reviseScene with critiqueResult', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      await evalComposable.revise(mockCreativeScene, 'creative', mockPlanItem)

      expect(mockReviseScene).toHaveBeenCalledWith({
        draft: mockCreativeScene.prose,
        critiqueResult: critiqueResponse,
        sceneBrief: expect.objectContaining({ title: 'Opening Scene' }),
        storyBible: '',
        focusInstructions: ''
      })
    })

    it('updates revisionResult after revision', async () => {
      mockReviseScene.mockResolvedValue(
        'Revised prose with improvements and more words for better quality.'
      )
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      await evalComposable.revise(mockCreativeScene, 'creative', mockPlanItem)

      expect(evalComposable.revisionResult.value).not.toBeNull()
      expect(evalComposable.revisionResult.value.originalProse).toBe(mockCreativeScene.prose)
      expect(evalComposable.revisionResult.value.revisedProse).toBe(
        'Revised prose with improvements and more words for better quality.'
      )
      expect(evalComposable.revisionResult.value.delta).toBe(2)
    })

    it('does not create revisionResult if revision is unchanged', async () => {
      mockReviseScene.mockResolvedValue(mockCreativeScene.prose)
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      await evalComposable.revise(mockCreativeScene, 'creative', mockPlanItem)

      expect(evalComposable.revisionResult.value).toBeNull()
    })

    it('stores degradation data in revisionResult', async () => {
      mockReviseScene.mockResolvedValue(
        'Revised prose with improvements and more words for better quality.'
      )
      mockEvaluateScene
        .mockResolvedValueOnce(critiqueResponse)
        .mockResolvedValueOnce(betterCritiqueResponse)
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      await evalComposable.revise(mockCreativeScene, 'creative', mockPlanItem)

      const result = evalComposable.revisionResult.value
      expect(result.degradation).not.toBeNull()
      expect(result.degradation.dimensions).not.toBeNull()
      expect(result.degradation.hasRegressions).toBe(false)
      expect(result.degradation.hasMajorRegressions).toBe(false)
    })

    it('detects per-dimension degradation after revision', async () => {
      const regressedCritique = {
        pass: true,
        score: 6,
        dimensionScores: {
          continuity: 6,
          voice: 8,
          emotional_goal: 4,
          show_tell: 6,
          pacing: 7
        },
        issues: [{ type: 'continuity', severity: 'major', feedback: 'worse' }],
        strengths: []
      }

      mockReviseScene.mockResolvedValue(
        'Revised prose with worse quality to test regression detection.'
      )
      mockEvaluateScene
        .mockResolvedValueOnce(critiqueResponse)
        .mockResolvedValueOnce(regressedCritique)
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      await evalComposable.revise(mockCreativeScene, 'creative', mockPlanItem)

      const result = evalComposable.revisionResult.value
      expect(result.degradation.hasRegressions).toBe(true)
      expect(result.degradation.hasMajorRegressions).toBe(true)

      const dims = result.degradation.dimensions
      expect(dims.continuity.status).toBe('regressed')
      expect(dims.continuity.delta).toBe(-1)
      expect(dims.continuity.before).toBe(7)
      expect(dims.continuity.after).toBe(6)

      expect(dims.emotional_goal.status).toBe('major_regression')
      expect(dims.emotional_goal.delta).toBe(-5)

      expect(dims.voice.status).toBe('unchanged')
      expect(dims.voice.delta).toBe(0)
    })
  })

  describe('evalHistory and prompt adjustments', () => {
    it('computes evalHistory from sceneResultsMap after evaluate with sceneIdx', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem, 0)

      expect(evalComposable.evalHistory.value).toHaveLength(1)
      expect(evalComposable.evalHistory.value[0]).toMatchObject({
        sceneIdx: 0,
        dimensionScores: critiqueResponse.dimensionScores,
        issues: critiqueResponse.issues,
        strengths: critiqueResponse.strengths
      })
    })

    it('formats pastEvalResults string after evaluate', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem, 0)

      const result = evalComposable.pastEvalResults.value
      expect(result).toContain('Scene 1:')
      expect(result).toContain('8/10')
      expect(result).toContain('show_tell: 6/10')
    })

    it('populates focusInstructions and givenHints after evaluate with sceneIdx', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem, 0)

      expect(evalComposable.focusInstructions.value).toBeTruthy()
      expect(evalComposable.focusInstructions.value).toContain('FOCUS AREAS')
      expect(evalComposable.givenHints.value.length).toBeGreaterThan(0)
    })

    it('passes focusInstructions to evaluateScene on subsequent evaluations', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem, 0)
      expect(evalComposable.focusInstructions.value).toBeTruthy()

      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem, 1)

      const secondCallArgs = mockEvaluateScene.mock.calls[1][0]
      expect(secondCallArgs.focusInstructions).toBe(evalComposable.focusInstructions.value)
    })

    it('passes focusInstructions to reviseScene', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem, 0)
      expect(evalComposable.focusInstructions.value).toBeTruthy()

      await evalComposable.revise(mockCreativeScene, 'creative', mockPlanItem)

      const reviseCallArgs = mockReviseScene.mock.calls[0][0]
      expect(reviseCallArgs.focusInstructions).toBe(evalComposable.focusInstructions.value)
    })
  })

  describe('reset', () => {
    it('restores all refs to initial values', async () => {
      await evalComposable.evaluate(mockCreativeScene, 'creative', mockPlanItem)
      expect(evalComposable.hasBeenEvaluated.value).toBe(true)

      evalComposable.reset()

      expect(evalComposable.isEvaluating.value).toBe(false)
      expect(evalComposable.isRevising.value).toBe(false)
      expect(evalComposable.hasBeenEvaluated.value).toBe(false)
      expect(evalComposable.critiqueResult.value).toBeNull()
      expect(evalComposable.gateResults.value).toEqual({
        dimensionCoverage: null,
        scoreDistribution: null,
        revisionEffectiveness: null
      })
      expect(evalComposable.revisionResult.value).toBeNull()
      expect(evalComposable.focusInstructions.value).toBe('')
      expect(evalComposable.givenHints.value).toEqual([])
    })
  })
})
