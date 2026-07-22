import { ref, computed } from 'vue'
import { useDriftMonitor } from './useDriftMonitor'

export function useDriftTriggeredEval(sceneEval) {
  const driftMonitor = useDriftMonitor()
  const triggeredActions = ref([])
  const isChecking = ref(false)
  const lastCheckResult = ref(null)

  const recentTriggers = computed(() => {
    return [...triggeredActions.value].reverse().slice(0, 10)
  })

  const hasRecentTriggers = computed(() => triggeredActions.value.length > 0)

  async function check({
    projectId,
    scenes,
    workspaceType,
    scenePlanItems,
    storyBible,
    chapterLog
  }) {
    if (!projectId || !scenes?.length || !sceneEval) {
      lastCheckResult.value = { triggered: false, reason: 'missing params' }
      return lastCheckResult.value
    }

    isChecking.value = true
    try {
      const report = await driftMonitor.analyze(projectId)
      if (!report || !driftMonitor.hasDrift.value) {
        lastCheckResult.value = { triggered: false, reason: 'no drift' }
        return lastCheckResult.value
      }

      const regressions = driftMonitor.flaggedRegressions.value.filter((r) =>
        !r.workspaceType || r.workspaceType === workspaceType
      )

      if (!regressions.length) {
        lastCheckResult.value = { triggered: false, reason: 'no regressions for workspace' }
        return lastCheckResult.value
      }

      const regressedDims = [...new Set(regressions.map((r) => r.dimension))]
      const extraFocus = `The following dimensions have regressed: ${regressedDims.join(', ')}. Pay special attention to improving these in the evaluation.`

      const reEvaluated = []
      for (const [index, scene] of scenes.entries()) {
        const scenePlanItem = scenePlanItems?.[index] || undefined
        await sceneEval.evaluate(
          scene,
          workspaceType,
          scenePlanItem,
          index,
          projectId,
          storyBible || '',
          chapterLog || '',
          extraFocus
        )
        reEvaluated.push({ sceneIndex: index, sceneTitle: scene.title || `Scene ${index}` })
      }

      const action = {
        timestamp: new Date().toISOString(),
        regressedDims,
        reEvaluatedScenes: reEvaluated.length,
        workspaceType
      }
      triggeredActions.value.push(action)

      lastCheckResult.value = { triggered: true, action }
      return lastCheckResult.value
    } catch (err) {
      lastCheckResult.value = { triggered: false, reason: err.message || String(err) }
      return lastCheckResult.value
    } finally {
      isChecking.value = false
    }
  }

  function clearTriggers() {
    triggeredActions.value = []
    lastCheckResult.value = null
    driftMonitor.clear()
  }

  return {
    driftMonitor,
    triggeredActions,
    isChecking,
    lastCheckResult,
    recentTriggers,
    hasRecentTriggers,
    check,
    clearTriggers
  }
}
