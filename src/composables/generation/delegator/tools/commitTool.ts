export function createCommitTool(memory: any) {
  const svc = memory.instances.commitService

  return {
    buildCheckpointState() {
      return svc.buildCheckpointState()
    },

    persistCheckpoint(projectId: any) {
      return svc.persistCheckpoint(projectId)
    },

    commitAndStoreScene(scene: any, fullProse: any, sectionIdx: any, sections: any, projectId: any, structured: any) {
      return svc.commitAndStoreScene(scene, fullProse, sectionIdx, sections, projectId, structured)
    }
  }
}
