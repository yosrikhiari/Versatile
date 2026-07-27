import { ActiveLearningService } from '../../../evaluation/ActiveLearningService'

export class ActiveLearningBridge {
  private service: any
  private sceneEvalResults: any
  private promptAdjuster: any
  private workspaceType: any
  private batchCount: any
  private lastFullAnalysisBatch: any
  private fullAnalysisInterval: any

  constructor({ sceneEvalResults, promptAdjuster, workspaceType }: any) {
    this.service = new ActiveLearningService()
    this.sceneEvalResults = sceneEvalResults
    this.promptAdjuster = promptAdjuster
    this.workspaceType = workspaceType
    this.batchCount = 0
    this.lastFullAnalysisBatch = 0
    this.fullAnalysisInterval = 3
  }

  afterBatchEval(evalHistory: any) {
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
