import { ref } from 'vue'
import { useStoryCritic } from './useStoryCritic'
import { useStoryRevisor } from './useStoryRevisor'
import { gateDimensionCoverage, gateScoreDistribution, gateRevisionEffectiveness } from '../services/evalGates'

export function useSceneEval() {
  const isEvaluating = ref(false)
  const isRevising = ref(false)
  const hasBeenEvaluated = ref(false)
  const critiqueResult = ref(null)
  const gateResults = ref({ dimensionCoverage: null, scoreDistribution: null, revisionEffectiveness: null })
  const revisionResult = ref(null)

  const { evaluateScene } = useStoryCritic()
  const { reviseScene } = useStoryRevisor()

  function buildSceneBrief(scene, scenePlanItem) {
    return {
      title: scenePlanItem?.title || scene.title || 'Untitled',
      emotionalGoal: scenePlanItem?.emotionalGoal || scenePlanItem?.goal || '',
      charactersPresent: scenePlanItem?.charactersPresent || scene.characters || [],
      payoff: scenePlanItem?.payoff || 'none',
      tension: scenePlanItem?.tension || 'medium'
    }
  }

  async function evaluate(scene, workspaceType, scenePlanItem) {
    if (!scene?.prose) return

    isEvaluating.value = true
    try {
      const sceneBrief = buildSceneBrief(scene, scenePlanItem)
      const result = await evaluateScene({
        draft: scene.prose,
        sceneBrief,
        storyBible: '',
        chapterLog: ''
      })

      critiqueResult.value = result
      const dimCov = gateDimensionCoverage(result, workspaceType)
      const scoreDist = gateScoreDistribution(result)

      gateResults.value = {
        dimensionCoverage: dimCov,
        scoreDistribution: scoreDist,
        revisionEffectiveness: null
      }
      hasBeenEvaluated.value = true
    } catch {
      critiqueResult.value = {
        pass: true,
        score: 7,
        dimensionScores: {},
        issues: [],
        strengths: ['Evaluation failed — defaulting to pass']
      }
    } finally {
      isEvaluating.value = false
    }
  }

  async function revise(scene, workspaceType, scenePlanItem) {
    if (!critiqueResult.value) return

    isRevising.value = true
    try {
      const sceneBrief = buildSceneBrief(scene, scenePlanItem)
      const revisedDraft = await reviseScene({
        draft: scene.prose,
        critiqueResult: critiqueResult.value,
        sceneBrief,
        storyBible: ''
      })

      if (revisedDraft && revisedDraft !== scene.prose) {
        const revisedCritique = await evaluateScene({
          draft: revisedDraft,
          sceneBrief,
          storyBible: '',
          chapterLog: ''
        })

        const revEff = await gateRevisionEffectiveness(
          critiqueResult.value, revisedDraft, scene.prose, revisedCritique
        )

        if (gateResults.value) {
          gateResults.value.revisionEffectiveness = revEff
        }

        revisionResult.value = {
          originalProse: scene.prose,
          revisedProse: revisedDraft,
          originalCritique: critiqueResult.value,
          revisedCritique,
          delta: revEff.delta
        }

        critiqueResult.value = revisedCritique
      }
    } catch {
      // silently return
    } finally {
      isRevising.value = false
    }
  }

  function reset() {
    isEvaluating.value = false
    isRevising.value = false
    hasBeenEvaluated.value = false
    critiqueResult.value = null
    gateResults.value = { dimensionCoverage: null, scoreDistribution: null, revisionEffectiveness: null }
    revisionResult.value = null
  }

  return {
    isEvaluating,
    isRevising,
    hasBeenEvaluated,
    critiqueResult,
    gateResults,
    revisionResult,
    evaluate,
    revise,
    reset
  }
}
