export function createConsistencyTool(memory: any) {
  const svc = memory.instances.consistencyService

  return {
    rewriteSceneForConsistency(projectId: any, sceneIndex: any, instruction: any, storyBibleDocs: any) {
      return svc.rewriteSceneForConsistency(projectId, sceneIndex, instruction, storyBibleDocs)
    },

    maybeRunIncrementalConsistency(writtenUpToIndex: any) {
      return svc.maybeRunIncrementalConsistency(writtenUpToIndex)
    },

    runTerminalConsistencyAudit(projectId: any, currentTaskId: any) {
      return svc.runTerminalConsistencyAudit(projectId, currentTaskId)
    }
  }
}
