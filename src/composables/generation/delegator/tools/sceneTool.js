export function createSceneTool(memory) {
  const svc = memory.instances.sceneInteractionService

  return {
    confirmSync(params) {
      return svc.confirmSync(params)
    },

    approveScene() {
      return svc.approveScene()
    },

    rejectScene() {
      return svc.rejectScene()
    },

    rerequestScene(edits) {
      return svc.rerequestScene(edits)
    },

    regenerateScene(projectId, sceneIndex) {
      return svc.regenerateScene(projectId, sceneIndex)
    }
  }
}
