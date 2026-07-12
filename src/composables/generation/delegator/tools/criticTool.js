export function createCriticTool(memory) {
  const critic = memory.instances.critic

  return {
    evaluateScene(params) {
      return critic.evaluateScene(params)
    },

    checkContradictions(params) {
      return critic.checkContradictions(params)
    },
  }
}
