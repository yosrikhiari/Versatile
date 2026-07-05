/**
 * Entity generation and enhancement functions: characters, locations, plot threads.
 * Extracted from useOllama.js.
 *
 * Keeps: random generation, context compaction.
 * Re-exports: enhancement and advanced generation from separated modules.
 */
import { useContextCompactor } from '../../composables/useContextCompactor'
import { generateEntity } from '../../composables/generation'

/**
 * @typedef {Object} GeneratedCharacter
 * @property {string} name
 * @property {string} role
 * @property {string} goal
 * @property {string} voice
 * @property {string} notes
 * @property {string} sampleDialogue
 */

/**
 * @typedef {Object} GeneratedLocation
 * @property {string} name
 * @property {string} description
 * @property {string} notes
 */

/**
 * @typedef {Object} GeneratedPlotThread
 * @property {string} title
 * @property {string} notes
 * @property {string[]} characters
 * @property {string[]} locations
 */

/**
 * Generates a completely random character.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @param {Object} [partialData=null] - Partial data to guide the generation.
 * @returns {Promise<GeneratedCharacter>} The generated character.
 */
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

  const result = await generateEntity('character', instructions, { manuscriptContext })

  return result
}

/**
 * Generates a completely random location.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedLocation>} The generated location.
 */
export async function generateRandomLocation(manuscriptContext = null) {
  return generateEntity('location', '', { manuscriptContext })
}

/**
 * Generates a completely random plot thread.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedPlotThread>} The generated plot thread.
 */
export async function generateRandomPlotThread(manuscriptContext = null) {
  return generateEntity('plotThread', '', { manuscriptContext })
}

// --- Re-exports from separated modules ---

export {
  enhanceCharacter,
  enhanceExistingCharacter,
  enhanceSingleField,
  enhanceLocation,
  enhancePlotThread,
  generateTraitSuggestions,
  extractBracketContent
} from './entityEnhance'

export {
  generateCharacterFromIdea,
  generateCharactersForPlotThread,
  generateLocationsForPlotThread
} from './entityGenerationAdvanced'

// --- Context compaction re-export ---

export function useCompactConversation() {
  const compactor = useContextCompactor()
  return {
    compactConversation: compactor.compactConversation,
    shouldSuggestCompact: compactor.shouldSuggestCompact,
    isCompacting: compactor.isCompacting,
    startConversation: compactor.startConversation,
    addTurn: compactor.addTurn,
    getTurns: compactor.getTurns,
    clearConversation: compactor.clearConversation
  }
}
