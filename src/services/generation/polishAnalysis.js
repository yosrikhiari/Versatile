/**
 * Polish analysis function.
 * Extracted from useOllama.js.
 */
import { aiGenerate } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'
import { retryWithBackoff, sanitizeJsonResponse } from '../ai/aiHelpers'

const POLISH_SYSTEM_PROMPT = `You are a fiction editor. You do not check grammar or punctuation.
You analyze prose craft only. You always respond in valid JSON only.
No preamble. No markdown. No explanation outside the JSON.`

export async function analyzePolish(paragraphText, activeLenses = {}) {
  const lensDefinitions = {
    weak_verb: 'weak verb constructions or weak verb choices ("was walking" instead of "paced")',
    repetition: 'the same word used more than once within 3 sentences',
    pacing: 'excessive adverbs or uniform sentence length in an action beat',
    antecedent: 'unclear pronoun references ("she told her" — who is who?)'
  }

  const activeLensesList = Object.entries(activeLenses)
    .filter(([_, active]) => active)
    .map(([lens]) => `- ${lens}: ${lensDefinitions[lens]}`)

  if (activeLensesList.length === 0) {
    return { issues: [], overallNote: 'No lenses selected for analysis.' }
  }

  const userPrompt = `Analyze this paragraph for the following issues only: 

${activeLensesList.join('\n')}

Paragraph:
"${paragraphText}"

Return this exact JSON structure:
{
  "issues": [
    {
      "type": "weak_verb | repetition | pacing | antecedent",
      "original": "the exact phrase from the text",
      "suggestion": "suggested replacement or fix",
      "reason": "one sentence explanation, fiction-craft focused"
    }
  ],
  "overallNote": "one sentence of overall craft feedback for this paragraph"
}

If no issues are found, return: { "issues": [], "overallNote": "..." }`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, POLISH_SYSTEM_PROMPT, { feature: FEATURES.POLISH })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }
    return parsed
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
