import { ActiveLearningService } from '../../../evaluation/ActiveLearningService.js'

export class ActiveLearningBridge {
  constructor({ sceneEvalResults, promptAdjuster, workspaceType }) {
    this.service = new ActiveLearningService()
    this.sceneEvalResults = sceneEvalResults
    this.promptAdjuster = promptAdjuster
    this.workspaceType = workspaceType
    this.batchCount = 0
    this.lastFullAnalysisBatch = 0
    this.fullAnalysisInterval = 3
  }

  afterBatchEval(evalHistory) {
    this.batchCount++

    const { focusInstructions, givenHints } = this.promptAdjuster.updateAdjustments(evalHistory)

    const batchesSinceLastFull = this.batchCount - this.lastFullAnalysisBatch
    let analysis = null
    if (batchesSinceLastFull >= this.fullAnalysisInterval && evalHistory.length >= 5) {
      analysis = this.service.analyzeAndAdjust({
        evalHistory,
        workspaceType: this.workspaceType?.value,
        options: { pastGivenHints: this.promptAdjuster.allGivenHints.value }
      })
      this.lastFullAnalysisBatch = this.batchCount
    }

    return { focusInstructions, givenHints, analysis }
  }

  reset() {
    this.batchCount = 0
    this.lastFullAnalysisBatch = 0
  }
}
