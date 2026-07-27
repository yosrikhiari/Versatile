import { ref, computed } from 'vue'
import { useStoryCritic } from './useStoryCritic'
import { useStoryRevisor } from './useStoryRevisor'
import {
  gateDimensionCoverage,
  gateScoreDistribution,
  gateRevisionEffectiveness,
  gateProseQuality
} from '../services/evalGates'
import { computeDegradation } from '../services/degradation'
import { useEvalPersistence } from './useEvalPersistence'
import { useAutoPromptAdjuster } from './useAutoPromptAdjuster'

interface CritiqueResult {
  pass: boolean
  score: number | null
  dimensionScores: Record<string, number | null>
  issues: Array<{ severity: string; type: string; description: string }>
  strengths: string[]
  evalUnavailable?: boolean
}

interface GateCoverageResult {
  pass: boolean
  failOn: string
  missing: string[]
  warnings: string[]
}

interface GateScoreResult {
  pass: boolean
  failOn?: string
  flags: string[]
}

interface RevisionEffectivenessResult {
  pass: boolean
  failOn?: string
  delta: number
  regressions: string[]
}

interface GateResults {
  dimensionCoverage: GateCoverageResult | null
  scoreDistribution: GateScoreResult | null
  proseQuality: { pass: boolean; failOn: string; flags: string[] } | null
  revisionEffectiveness: RevisionEffectivenessResult | null
}

interface DegradationInfo {
  dimensions: Record<string, { before: number | null; after: number | null; delta: number; status: string }>
  hasRegressions: boolean
  hasMajorRegressions: boolean
}

interface RevisionResult {
  originalProse: string
  revisedProse: string
  originalCritique: CritiqueResult
  revisedCritique: CritiqueResult
  delta: number
  degradation: DegradationInfo
}

interface SceneEntry {
  critiqueResult?: CritiqueResult
  revisionResult?: RevisionResult
  gateResults?: GateResults
  hasBeenEvaluated?: boolean
  score?: number | null
  dimensionScores?: Record<string, number | null>
  hasRegressions?: boolean
  hasMajorRegressions?: boolean
  degradation?: Record<string, { before: number | null; after: number | null; delta: number; status: string }>
}

interface SceneInfo {
  title?: string
  prose?: string
  characters?: string[]
  [key: string]: any
}

interface ScenePlanItem {
  title?: string
  emotionalGoal?: string
  goal?: string
  charactersPresent?: string[]
  payoff?: string
  tension?: string
  [key: string]: any
}

export function useSceneEval() {
  const isEvaluating = ref(false)
  const isRevising = ref(false)
  const hasBeenEvaluated = ref(false)
  const critiqueResult = ref<CritiqueResult | null>(null)
  const gateResults = ref<GateResults>({
    dimensionCoverage: null,
    scoreDistribution: null,
    proseQuality: null,
    revisionEffectiveness: null
  })
  const revisionResult = ref<RevisionResult | null>(null)
  const sceneResultsMap = ref<Record<string | number, SceneEntry>>({})

  const evalPersistence = useEvalPersistence()
  const promptAdjuster = useAutoPromptAdjuster()

  const { evaluateScene } = useStoryCritic()
  const { reviseScene } = useStoryRevisor()

  const aggregateStats = computed(() => {
    const entries: SceneEntry[] = Object.values(sceneResultsMap.value)
    if (entries.length === 0) return null
    const evaluated = entries.filter((e: SceneEntry) => e.critiqueResult)
    if (evaluated.length === 0) return null
    const scores = evaluated.map((e: SceneEntry) => e.critiqueResult!.score).filter((s: any) => typeof s === 'number')
    const avgScore =
      scores.length > 0
        ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 10) / 10
        : null
    const regressions = evaluated.reduce((sum: number, e: SceneEntry) => {
      if (!e.revisionResult?.degradation?.dimensions) return sum
      return (
        sum +
        Object.values(e.revisionResult.degradation.dimensions).filter(
          (d: any) => d.status === 'regression'
        ).length
      )
    }, 0)
    const majorRegressions = evaluated.reduce((sum: number, e: SceneEntry) => {
      if (!e.revisionResult?.degradation?.hasMajorRegressions) return sum
      return sum + (e.revisionResult.degradation.hasMajorRegressions ? 1 : 0)
    }, 0)
    return {
      totalScenes: entries.length,
      evaluatedCount: evaluated.length,
      revisedCount: entries.filter((e: SceneEntry) => e.revisionResult).length,
      averageScore: avgScore,
      totalRegressions: regressions,
      scenesWithMajorRegressions: majorRegressions
    }
  })

  const evalHistory = computed(() => {
    return Object.values(sceneResultsMap.value)
      .filter((e: SceneEntry) => e.critiqueResult?.dimensionScores)
      .map((e: SceneEntry, i: number) => ({
        sceneIdx: i,
        dimensionScores: e.critiqueResult!.dimensionScores ?? {},
        issues: e.critiqueResult!.issues ?? [],
        strengths: e.critiqueResult!.strengths ?? []
      }))
  })

  const pastEvalResults = computed(() => {
    const entries: SceneEntry[] = Object.values(sceneResultsMap.value)
    const evaluated = entries.filter((e: SceneEntry) => e.critiqueResult)
    if (evaluated.length === 0) return ''
    return evaluated
      .map(
        (e: SceneEntry, i: number) =>
          `Scene ${i + 1}: ${e.critiqueResult!.score ?? '?'}/10 \u2014 ${Object.entries(
            e.critiqueResult!.dimensionScores ?? {}
          )
            .map(([k, v]: [string, any]) => `${k}: ${v}/10`)
            .join(', ')}`
      )
      .join('\n')
  })

  function refreshPromptAdjustments() {
    promptAdjuster.updateAdjustments(evalHistory.value)
  }

  function updateSceneEntry(idx: string | number, updates: Partial<SceneEntry>) {
    const existing = sceneResultsMap.value[idx] || {}
    const entry: SceneEntry = { ...existing, ...updates }
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

  function buildSceneBrief(scene: SceneInfo, scenePlanItem: ScenePlanItem | undefined) {
    return {
      title: scenePlanItem?.title || scene.title || 'Untitled',
      emotionalGoal: scenePlanItem?.emotionalGoal || scenePlanItem?.goal || '',
      charactersPresent: scenePlanItem?.charactersPresent || scene.characters || [],
      payoff: scenePlanItem?.payoff || 'none',
      tension: scenePlanItem?.tension || 'medium'
    }
  }

  async function evaluate(
    scene: SceneInfo,
    workspaceType: string,
    scenePlanItem: ScenePlanItem | undefined,
    sceneIdx: number,
    projectId: string | undefined,
    storyBible = '',
    chapterLog = '',
    extraFocusInstructions?: string
  ) {
    if (!scene?.prose) return

    isEvaluating.value = true
    try {
      const sceneBrief = buildSceneBrief(scene, scenePlanItem)
      const baseFocus = promptAdjuster.focusInstructions.value
      const mergedFocus = extraFocusInstructions
        ? baseFocus
          ? `${baseFocus}\n\n${extraFocusInstructions}`
          : extraFocusInstructions
        : baseFocus
      const result = await evaluateScene({
        draft: scene.prose ?? '',
        sceneBrief,
        storyBible,
        chapterLog,
        existingEntitiesJson: undefined,
        focusInstructions: mergedFocus
      })

      critiqueResult.value = result as CritiqueResult
      const dimCov = gateDimensionCoverage(result, workspaceType)
      const scoreDist = gateScoreDistribution(result)
      const proseQ = gateProseQuality(result, 0, 0)

      gateResults.value = {
        dimensionCoverage: dimCov,
        scoreDistribution: scoreDist,
        proseQuality: proseQ,
        revisionEffectiveness: null
      }
      hasBeenEvaluated.value = true

      if (typeof sceneIdx === 'number') {
        updateSceneEntry(sceneIdx, {
          critiqueResult: result as CritiqueResult,
          gateResults: {
            dimensionCoverage: dimCov,
            scoreDistribution: scoreDist,
            proseQuality: proseQ,
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
              scoreDistribution: scoreDist,
              proseQuality: proseQ
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
      } as CritiqueResult
    } finally {
      isEvaluating.value = false
    }
  }

  async function revise(
    scene: SceneInfo,
    workspaceType: string,
    scenePlanItem: ScenePlanItem | undefined,
    sceneIdx: number,
    projectId: string | undefined,
    storyBible = '',
    chapterLog = ''
  ) {
    if (!critiqueResult.value) return

    isRevising.value = true
    try {
      const sceneBrief = buildSceneBrief(scene, scenePlanItem)
      const revisedDraft = await reviseScene({
        draft: scene.prose ?? '',
        critiqueResult: critiqueResult.value,
        sceneBrief,
        storyBible,
        existingEntitiesJson: undefined,
        focusInstructions: promptAdjuster.focusInstructions.value
      })

      if (revisedDraft && revisedDraft !== scene.prose) {
        const revisedCritique = await evaluateScene({
          draft: revisedDraft,
          sceneBrief,
          storyBible,
          chapterLog,
          existingEntitiesJson: undefined,
          focusInstructions: undefined
        })

        const revEff = await gateRevisionEffectiveness(
          critiqueResult.value,
          revisedDraft,
          scene.prose ?? '',
          revisedCritique
        )

        if (gateResults.value) {
          gateResults.value.revisionEffectiveness = revEff
        }

        const degradation = computeDegradation(critiqueResult.value, revisedCritique)

        const revResult: RevisionResult = {
          originalProse: scene.prose ?? '',
          revisedProse: revisedDraft,
          originalCritique: critiqueResult.value,
          revisedCritique: revisedCritique as CritiqueResult,
          delta: revEff.delta,
          degradation
        }

        revisionResult.value = revResult
        critiqueResult.value = revisedCritique as CritiqueResult

        if (typeof sceneIdx === 'number') {
          const existing = sceneResultsMap.value[sceneIdx] || {}
          updateSceneEntry(sceneIdx, {
            ...existing,
            critiqueResult: revisedCritique as CritiqueResult,
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
      proseQuality: null,
      revisionEffectiveness: null
    }
    revisionResult.value = null
    sceneResultsMap.value = {}
    promptAdjuster.reset()
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
    focusInstructions: promptAdjuster.focusInstructions,
    givenHints: promptAdjuster.givenHints,
    evaluate,
    revise,
    reset,
    evalPersistence
  }
}
