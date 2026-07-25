/**
 * useOllama.js — Barrel re-export.
 *
 * This file used to contain ~1119 lines of mixed generation, analysis,
 * entity detection, helpers, and retry logic. It has been split into
 * focused domain modules under src/services/.
 *
 * All existing imports from this file continue to work unchanged.
 */

// --- AI helpers ---
export {
  sanitizeJsonResponse,
  getProjectContext,
  FIELD_LENGTH_CONSTRAINTS
} from '../services/ai/aiHelpers'

// --- Spark generation ---
export {
  generateSparkPrompt,
  generateOutline,
  generateContent,
  generateContentStreaming
} from '../services/generation/sparkGeneration'

// --- Entity generation & enhancement ---
export {
  generateRandomCharacter,
  generateCharacterFromIdea,
  generateRandomLocation,
  generateRandomPlotThread,
  enhanceCharacter,
  enhanceExistingCharacter,
  enhanceSingleField,
  generateTraitSuggestions,
  generateCharactersForPlotThread,
  generateLocationsForPlotThread,
  enhanceLocation,
  enhancePlotThread,
  useCompactConversation
} from '../services/generation/entityGeneration'

// --- Polish analysis ---
export { analyzePolish } from '../services/generation/polishAnalysis'

// --- Entity detection ---
export { detectEntities } from '../services/generation/entityDetection'

import { hasOpenAIKey, setStoredOpenAIKey, setPromptedForOpenAI } from '../services/ollamaService'

// testOllamaConnection now lives in services/ollamaService (M-7.4); re-exported
// here so existing composable-path importers keep working.
export { testOllamaConnection } from '../services/ollamaService'

export async function saveOpenAIKey(key) {
  await setStoredOpenAIKey(key)
  setPromptedForOpenAI()
}

export async function isUsingOpenAI() {
  return await hasOpenAIKey()
}
