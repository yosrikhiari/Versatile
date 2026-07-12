export function createDirectorTool(memory) {
  const director = memory.instances.director

  return {
    generateStoryPlan(params) {
      return director.generateStoryPlan(params)
    }
  }
}
