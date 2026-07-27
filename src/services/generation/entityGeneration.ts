import { useContextCompactor } from '../../composables/useContextCompactor'
import { generateEntity } from '../../composables/generation'
import type {
  GeneratedCharacter,
  GeneratedLocation
} from './entityGenerationAdvanced'

interface ManuscriptContext {
  contextText?: string
}

export interface GeneratedPlotThread {
  title: string
  notes: string
  characters: string[]
  locations: string[]
}

export async function generateRandomCharacter(
  manuscriptContext: ManuscriptContext | null = null,
  partialData: Record<string, any> | null = null
): Promise<GeneratedCharacter> {
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

  return result as GeneratedCharacter
}

export async function generateRandomLocation(
  manuscriptContext: ManuscriptContext | null = null
): Promise<GeneratedLocation> {
  return generateEntity('location', '', { manuscriptContext }) as Promise<GeneratedLocation>
}

export async function generateRandomPlotThread(
  manuscriptContext: ManuscriptContext | null = null
): Promise<GeneratedPlotThread> {
  return generateEntity('plotThread', '', { manuscriptContext }) as Promise<GeneratedPlotThread>
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
