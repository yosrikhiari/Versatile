export function createGraphTool(memory: any) {
  const graphBuilder = memory.instances.graphBuilder

  return {
    buildPreliminaryEdges(projectId: any, volumeId: any, plan: any) {
      return graphBuilder.buildPreliminaryEdges(projectId, volumeId, plan)
    }
  }
}
