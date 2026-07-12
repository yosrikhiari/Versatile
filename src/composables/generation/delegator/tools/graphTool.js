export function createGraphTool(memory) {
  const graphBuilder = memory.instances.graphBuilder

  return {
    buildPreliminaryEdges(projectId, volumeId, plan) {
      return graphBuilder.buildPreliminaryEdges(projectId, volumeId, plan)
    },
  }
}
