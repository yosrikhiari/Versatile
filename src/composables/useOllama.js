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
  retryWithBackoff,
  sanitizeJsonResponse,
  getProjectContext,
  getExistingEntitiesContext,
  sleep,
  randomJitter,
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

// --- Legacy re-exports (still used by some components) ---
export { getStoredOpenAIKey, setStoredOpenAIKey, setPromptedForOpenAI } from '../services/ollamaService'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { hasOpenAIKey, hasPromptedForOpenAI } from '../services/ollamaService'
import { retryWithBackoff } from '../services/ai/aiHelpers'
export { hasOpenAIKey, hasPromptedForOpenAI }

const TEST_PROMPT = `Respond with 'OK' only. No other text.`

export async function testOllamaConnection() {
  if (hasOpenAIKey()) {
    return { success: true, message: 'Using OpenAI' }
  }

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(TEST_PROMPT, 'You are a helpful assistant.', { feature: FEATURES.CONTENT })
    )
    const trimmed = response.trim().toUpperCase()
    return { success: trimmed === 'OK', message: trimmed }
  } catch {
    if (hasPromptedForOpenAI()) {
      return { success: false, message: 'Ollama unavailable. OpenAI not configured.' }
    }
    return { success: false, message: 'Connection failed' }
  }
}

export function saveOpenAIKey(key) {
  const { setStoredOpenAIKey, setPromptedForOpenAI } = require('../services/ollamaService')
  setStoredOpenAIKey(key)
  setPromptedForOpenAI()
}

export function isUsingOpenAI() {
  return hasOpenAIKey()
}
