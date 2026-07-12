export function createConsistencyTool(memory) {
  const svc = memory.instances.consistencyService

  return {
    rewriteSceneForConsistency(projectId, sceneIndex, instruction, storyBibleDocs) {
      return svc.rewriteSceneForConsistency(projectId, sceneIndex, instruction, storyBibleDocs)
    },

    maybeRunIncrementalConsistency(writtenUpToIndex) {
      return svc.maybeRunIncrementalConsistency(writtenUpToIndex)
    },

    runTerminalConsistencyAudit(projectId, currentTaskId) {
      return svc.runTerminalConsistencyAudit(projectId, currentTaskId)
    },
  }
}
