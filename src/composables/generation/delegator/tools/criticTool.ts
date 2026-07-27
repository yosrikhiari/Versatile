export function createCriticTool(memory: any) {
  const critic = memory.instances.critic

  return {
    evaluateScene(params: any) {
      return critic.evaluateScene(params)
    },

    checkContradictions(params: any) {
      return critic.checkContradictions(params)
    }
  }
}
