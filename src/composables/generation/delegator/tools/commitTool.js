export function createCommitTool(memory) {
  const svc = memory.instances.commitService

  return {
    buildCheckpointState() {
      return svc.buildCheckpointState()
    },

    persistCheckpoint(projectId) {
      return svc.persistCheckpoint(projectId)
    },

    commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId, structured) {
      return svc.commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId, structured)
    }
  }
}
