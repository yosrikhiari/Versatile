export function createDirectorTool(memory: any) {
  const director = memory.instances.director

  return {
    generateStoryPlan(params: any) {
      return director.generateStoryPlan(params)
    }
  }
}
