import { generateEntity } from '../pipeline'

export async function generateRandomLocation(manuscriptContext = null) {
  return generateEntity('location', '', { manuscriptContext })
}
