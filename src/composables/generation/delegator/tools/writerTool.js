export function createWriterTool(memory) {
  const writer = memory.instances.writer

  return {
    writeScene(params) {
      return writer.writeScene(params)
    },

    writeSceneStructured(params) {
      return writer.writeSceneStructured(params)
    }
  }
}
