export function createSyncTool(memory: any) {
  const sync = memory.instances.sync

  return {
    discoverSync(structured: any) {
      return sync.discoverSync(structured)
    },

    commitSync(params: any) {
      return sync.commitSync(params)
    }
  }
}
