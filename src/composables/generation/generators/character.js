import { generateEntity } from '../pipeline'

export async function generateRandomCharacter(manuscriptContext = null, partialData = null) {
  let instructions = ''
  if (partialData) {
    const fields = Object.entries(partialData)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: "${v}"`)
    if (fields.length > 0) {
      instructions = `The user has already provided these character details. Stay consistent with them and generate the remaining missing fields naturally. Do NOT change the provided values.\n${fields.join('\n')}`
    }
  }
  return generateEntity('character', instructions, { manuscriptContext })
}
