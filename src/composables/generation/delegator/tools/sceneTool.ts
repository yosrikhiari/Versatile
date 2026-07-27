export function createSceneTool(memory: any) {
  const svc = memory.instances.sceneInteractionService

  return {
    confirmSync(params: any) {
      return svc.confirmSync(params)
    },

    approveScene() {
      return svc.approveScene()
    },

    rejectScene() {
      return svc.rejectScene()
    },

    rerequestScene(edits: any) {
      return svc.rerequestScene(edits)
    },

    regenerateScene(projectId: any, sceneIndex: any) {
      return svc.regenerateScene(projectId, sceneIndex)
    }
  }
}
