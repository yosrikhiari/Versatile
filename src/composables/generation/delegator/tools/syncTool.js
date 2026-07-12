export function createSyncTool(memory) {
  const sync = memory.instances.sync

  return {
    discoverSync(structured) {
      return sync.discoverSync(structured)
    },

    commitSync(params) {
      return sync.commitSync(params)
    },
  }
}
