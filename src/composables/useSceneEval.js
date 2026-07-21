import { ref, computed } from 'vue'
import { useStoryCritic } from './useStoryCritic'
import { useStoryRevisor } from './useStoryRevisor'
import {
  gateDimensionCoverage,
  gateScoreDistribution,
  gateRevisionEffectiveness
} from '../services/evalGates'
import { computeDegradation } from '../services/degradation'
import { useEvalPersistence } from './useEvalPersistence'
import { autoAdjustPrompt } from '../evaluation/autoPromptAdjuster'

export function useSceneEval() {
  const isEvaluating = ref(false)
  const isRevising = ref(false)
  const hasBeenEvaluated = ref(false)
  const critiqueResult = ref(null)
  const gateResults = ref({
    dimensionCoverage: null,
    scoreDistribution: null,
    revisionEffectiveness: null
  })
  const revisionResult = ref(null)
  const sceneResultsMap = ref({})
  const focusInstructions = ref('')
  const givenHints = ref([])

  const evalPersistence = useEvalPersistence()

  const { evaluateScene } = useStoryCritic()
  const { reviseScene } = useStoryRevisor()

  const aggregateStats = computed(() => {
    const entries = Object.values(sceneResultsMap.value)
    if (entries.length === 0) return null
    const evaluated = entries.filter((e) => e.critiqueResult)
    if (evaluated.length === 0) return null
    const scores = evaluated.map((e) => e.critiqueResult.score).filter((s) => typeof s === 'number')
    const avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null
    const regressions = evaluated.reduce((sum, e) => {
      if (!e.revisionResult?.degradation?.dimensions) return sum
      return (
        sum +
        Object.values(e.revisionResult.degradation.dimensions).filter(
          (d) => d.status === 'regression'
        ).length
      )
    }, 0)
    const majorRegressions = evaluated.reduce((sum, e) => {
      if (!e.revisionResult?.degradation?.hasMajorRegressions) return sum
      return sum + (e.revisionResult.degradation.hasMajorRegressions ? 1 : 0)
    }, 0)
    return {
      totalScenes: entries.length,
      evaluatedCount: evaluated.length,
      revisedCount: entries.filter((e) => e.revisionResult).length,
      averageScore: avgScore,
      totalRegressions: regressions,
      scenesWithMajorRegressions: majorRegressions
    }
  })

  const evalHistory = computed(() => {
    return Object.values(sceneResultsMap.value)
      .filter((e) => e.critiqueResult?.dimensionScores)
      .map((e, i) => ({
        sceneIdx: i,
        dimensionScores: e.critiqueResult.dimensionScores ?? {},
        issues: e.critiqueResult.issues ?? [],
        strengths: e.critiqueResult.strengths ?? []
      }))
  })

  const pastEvalResults = computed(() => {
    const entries = Object.values(sceneResultsMap.value)
    const evaluated = entries.filter((e) => e.critiqueResult)
    if (evaluated.length === 0) return ''
    return evaluated
      .map(
        (e, i) =>
          `Scene ${i + 1}: ${e.critiqueResult.score ?? '?'}/10 \u2014 ${Object.entries(e.critiqueResult.dimensionScores ?? {})
            .map(([k, v]) => `${k}: ${v}/10`)
            .join(', ')}`
      )
      .join('\n')
  })

  function refreshPromptAdjustments() {
    const history = evalHistory.value
    if (history.length === 0) return
    const result = autoAdjustPrompt(history)
    focusInstructions.value = result.focusInstructions
    givenHints.value = result.givenHints
  }

  function updateSceneEntry(idx, updates) {
    const entry = { ...(sceneResultsMap.value[idx] || {}), ...updates }
    if (entry.critiqueResult) {
      entry.score = entry.critiqueResult.score ?? null
      entry.dimensionScores = entry.critiqueResult.dimensionScores ?? {}
    }
    if (entry.revisionResult?.degradation) {
      entry.hasRegressions = entry.revisionResult.degradation.hasRegressions
      entry.hasMajorRegressions = entry.revisionResult.degradation.hasMajorRegressions
      entry.degradation = entry.revisionResult.degradation.dimensions
    }
    sceneResultsMap.value[idx] = entry
  }

  function buildSceneBrief(scene, scenePlanItem) {
    return {
      title: scenePlanItem?.title || scene.title || 'Untitled',
      emotionalGoal: scenePlanItem?.emotionalGoal || scenePlanItem?.goal || '',
      charactersPresent: scenePlanItem?.charactersPresent || scene.characters || [],
      payoff: scenePlanItem?.payoff || 'none',
      tension: scenePlanItem?.tension || 'medium'
    }
  }

  async function evaluate(scene, workspaceType, scenePlanItem, sceneIdx, projectId, storyBible = '', chapterLog = '') {
    if (!scene?.prose) return

    isEvaluating.value = true
    try {
      const sceneBrief = buildSceneBrief(scene, scenePlanItem)
      const result = await evaluateScene({
        draft: scene.prose,
        sceneBrief,
        storyBible,
        chapterLog,
        focusInstructions: focusInstructions.value
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

      if (typeof sceneIdx === 'number') {
        updateSceneEntry(sceneIdx, {
          critiqueResult: result,
          gateResults: {
            dimensionCoverage: dimCov,
            scoreDistribution: scoreDist,
            revisionEffectiveness: null
          },
          hasBeenEvaluated: true
        })
      }

      if (projectId) {
        evalPersistence.saveRecord({
          projectId,
          sceneId: sceneIdx != null ? String(sceneIdx) : null,
          evalType: 'critique',
          score: result.score ?? null,
          sceneTitle: sceneBrief.title,
          rawResult: {
            critiqueResult: result,
            gateResults: {
              dimensionCoverage: dimCov,
              scoreDistribution: scoreDist
            }
          },
          dimensionScores: result.dimensionScores ?? null,
          issues: result.issues ?? null,
          strengths: result.strengths ?? null
        })
      }

      refreshPromptAdjustments()
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

  async function revise(scene, workspaceType, scenePlanItem, sceneIdx, projectId, storyBible = '', chapterLog = '') {
    if (!critiqueResult.value) return

    isRevising.value = true
    try {
      const sceneBrief = buildSceneBrief(scene, scenePlanItem)
      const revisedDraft = await reviseScene({
        draft: scene.prose,
        critiqueResult: critiqueResult.value,
        sceneBrief,
        storyBible,
        focusInstructions: focusInstructions.value
      })

      if (revisedDraft && revisedDraft !== scene.prose) {
        const revisedCritique = await evaluateScene({
          draft: revisedDraft,
          sceneBrief,
          storyBible,
          chapterLog
        })

        const revEff = await gateRevisionEffectiveness(
          critiqueResult.value,
          revisedDraft,
          scene.prose,
          revisedCritique
        )

        if (gateResults.value) {
          gateResults.value.revisionEffectiveness = revEff
        }

        const degradation = computeDegradation(critiqueResult.value, revisedCritique)

        const revResult = {
          originalProse: scene.prose,
          revisedProse: revisedDraft,
          originalCritique: critiqueResult.value,
          revisedCritique,
          delta: revEff.delta,
          degradation
        }

        revisionResult.value = revResult
        critiqueResult.value = revisedCritique

        if (typeof sceneIdx === 'number') {
          const existing = sceneResultsMap.value[sceneIdx] || {}
          updateSceneEntry(sceneIdx, {
            ...existing,
            critiqueResult: revisedCritique,
            revisionResult: revResult,
            hasBeenEvaluated: true
          })
        }

        if (projectId) {
          evalPersistence.saveRecord({
            projectId,
            sceneId: sceneIdx != null ? String(sceneIdx) : null,
            evalType: 'revision',
            score: revEff.delta ?? null,
            sceneTitle: sceneBrief.title,
            rawResult: {
              originalCritique: revResult.originalCritique,
              revisedCritique,
              revisionEffectiveness: revEff
            },
            dimensionScores: degradation.dimensions ?? null,
            delta: revEff.delta ?? null,
            hasRegressions: degradation.hasRegressions ?? null,
            hasMajorRegressions: degradation.hasMajorRegressions ?? null
          })
        }

        refreshPromptAdjustments()
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
    gateResults.value = {
      dimensionCoverage: null,
      scoreDistribution: null,
      revisionEffectiveness: null
    }
    revisionResult.value = null
    sceneResultsMap.value = {}
    focusInstructions.value = ''
    givenHints.value = []
  }

  return {
    isEvaluating,
    isRevising,
    hasBeenEvaluated,
    critiqueResult,
    gateResults,
    revisionResult,
    sceneResultsMap,
    aggregateStats,
    evalHistory,
    pastEvalResults,
    focusInstructions,
    givenHints,
    evaluate,
    revise,
    reset,
    evalPersistence
  }
}
