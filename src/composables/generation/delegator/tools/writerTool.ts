export function createWriterTool(memory: any) {
  const writer = memory.instances.writer

  return {
    writeScene(params: any) {
      return writer.writeScene(params)
    },

    writeSceneStructured(params: any) {
      return writer.writeSceneStructured(params)
    }
  }
}
