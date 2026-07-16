/**
 * Entity detection from manuscript text.
 * Extracted from useOllama.js.
 */
import { aiGenerate } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'
import { sanitizeJsonResponse } from '../ai/aiHelpers'

export async function detectEntities(manuscriptText) {
  const DETECT_SYSTEM_PROMPT = `You are a fiction analysis assistant. Analyze the given manuscript text and extract:
- Characters: people mentioned (with inferred role and goal if detectable)
- Locations: places mentioned (with brief description if detectable)
- Plot Threads: unresolved tensions, goals, conflicts, or mysteries

You always respond in valid JSON only. No preamble. No markdown. No explanation outside the JSON.`

  const userPrompt = `Analyze this manuscript and extract entities.

Manuscript:
"""
${manuscriptText}
"""

Return this exact JSON structure:
{
  "characters": [{ "name": "character name", "role": "their role or relation", "goal": "their goal or motivation if inferable" }],
  "locations": [{ "name": "place name", "description": "brief description of the location" }],
  "plotThreads": [{ "title": "tension or conflict description", "status": "open" }]
}

If no entities of a type are found, return an empty array for that key.
Be concise and only extract what is clearly present in the text.`

  try {
    const response = await aiGenerate(userPrompt, DETECT_SYSTEM_PROMPT, {
      feature: FEATURES.WORLDBUILDING
    })
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }
    return {
      characters: parsed.characters || [],
      locations: parsed.locations || [],
      plotThreads: parsed.plotThreads || []
    }
  } catch (error) {
    if (error.message === 'Invalid JSON') {
      throw new Error('Model returned malformed JSON. The response could not be parsed.')
    }
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(
      isApiError
        ? error.message
        : 'Generation failed. Ensure Ollama is running and your model is loaded.'
    )
  }
}
