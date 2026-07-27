import { generateEntity } from '../pipeline'

export async function generateRandomPlotThread(manuscriptContext = null) {
  return generateEntity('plotThread', '', { manuscriptContext })
}
