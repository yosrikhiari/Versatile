/**
 * Spark generation functions: prompts, outlines, content (regular + streaming).
 * Extracted from useOllama.js.
 */
import { aiGenerate, aiStream } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'
import { retryWithBackoff, sanitizeJsonResponse } from '../ai/aiHelpers'

/**
 * @typedef {Object} SparkBlueprint
 * @property {string} title
 * @property {string} openingBeat
 * @property {string} turningPoint
 * @property {string} confrontationBeat
 * @property {string} closingBeat
 * @property {string} sensoryAnchor
 * @property {string} dialogueHook
 * @property {string} writingNotes
 */

/**
 * @typedef {Object} GeneratedContentResult
 * @property {string} text - The generated fiction prose.
 * @property {string|null} error - Any error encountered during generation.
 */

function buildContextString(category, description) {
  const parts = []
  if (category) parts.push(`Category: ${category}`)
  if (description) parts.push(`Description: ${description}`)
  return parts.length > 0 ? `\n\n${parts.join('\n')}` : ''
}

const SPARK_SYSTEM_PROMPT = `You are a creative writing prompt generator for fiction writers.
You generate short, specific, evocative prompts that inspire a writer 
to write a scene themselves. You never write the scene for them.
You always return only the prompt text, nothing else. 
Maximum 3 sentences. No preamble. No explanation.`

const BLUEPRINT_SYSTEM_PROMPT = `You are a JSON generator. Output ONLY valid JSON. No markdown, no explanation.`

function getDefaultBlueprint(idea) {
  return {
    title: idea.length > 30 ? idea.substring(0, 30) + '...' : idea,
    openingBeat: 'A character faces a pivotal moment.',
    turningPoint: 'Something changes or is revealed.',
    confrontationBeat: 'The tension reaches its peak.',
    closingBeat: 'The scene ends with unresolved tension.',
    sensoryAnchor: 'A vivid detail grounds the reader.',
    dialogueHook: 'A moment to write toward.',
    writingNotes: "Focus on the character's emotional journey."
  }
}

/**
 * Generates a short, evocative spark prompt.
 * @param {string} type - The type of prompt (seed, scenario, whatif, obstacle).
 * @param {string[]} [characterNames=[]] - Optional list of character names.
 * @param {boolean} [relateToProject=false] - Whether to relate the prompt to the current project context.
 * @param {Object} [manuscriptContext=null] - Optional context from the manuscript.
 * @returns {Promise<string>} The generated prompt string.
 */
export async function generateSparkPrompt(
  type,
  characterNames = [],
  relateToProject = false,
  manuscriptContext = null,
  { projectCategory, projectDescription } = {}
) {
  const typeDescriptions = {
    seed: 'story seed — a compelling situation or world detail',
    scenario: 'character scenario — a specific emotional situation a character faces',
    whatif: 'what-if — an unexpected twist or reversal',
    obstacle: 'obstacle — a moment where the character fails or is blocked'
  }

  const projectContext = buildContextString(projectCategory, projectDescription)

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nThe following excerpts are from the writer's manuscript. Notice unresolved tensions, established character voices, and open questions. Generate a prompt that could naturally develop from this context.\n\n${manuscriptContext.contextText}`
  }

  let userPrompt
  if (relateToProject && characterNames.length > 0) {
    userPrompt = `Generate a ${typeDescriptions[type]} prompt for a fiction writer.${projectContext}${contextInstruction}
Their story involves these characters: ${characterNames.join(', ')}. 
Make the prompt specific to these characters.`
  } else {
    userPrompt = `Generate a ${typeDescriptions[type]} fiction writing prompt.${projectContext}${contextInstruction}
Make it vivid and specific. Do not write the scene.`
  }

  return aiGenerate(userPrompt, SPARK_SYSTEM_PROMPT, { feature: FEATURES.SPARK })
}

/**
 * Generates a structured scene outline/blueprint based on an idea and tone.
 * @param {string} idea - The core idea for the scene.
 * @param {string} tone - The tone of the scene.
 * @param {string[]} [characterNames=[]] - Unused argument, kept for signature consistency.
 * @param {string} [targetLength='full'] - Unused argument, kept for signature consistency.
 * @param {Object} [manuscriptContext=null] - Optional context from the manuscript.
 * @returns {Promise<SparkBlueprint>} The generated scene blueprint object.
 * @throws {Error} If generation fails.
 */
export async function generateOutline(
  idea,
  tone,
  _characterNames = [],
  _targetLength = 'full',
  manuscriptContext = null,
  { projectCategory, projectDescription } = {}
) {
  const projectContext = buildContextString(projectCategory, projectDescription)

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nThe following excerpts establish the current narrative momentum. Generate a scene blueprint that feels like a natural next beat.\n\n${manuscriptContext.contextText}`
  }

  const userPrompt = `Write one JSON object only. Keys: title, openingBeat, turningPoint, confrontationBeat, closingBeat, sensoryAnchor, dialogueHook, writingNotes. All values must be strings in quotes. No extra text.
  
Idea: ${idea}
Tone: ${tone}${projectContext}${contextInstruction}`

  try {
    const response = await aiGenerate(userPrompt, BLUEPRINT_SYSTEM_PROMPT, {
      feature: FEATURES.SPARK
    })
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      return getDefaultBlueprint(idea, tone)
    }

    const requiredKeys = [
      'title',
      'openingBeat',
      'turningPoint',
      'confrontationBeat',
      'closingBeat',
      'sensoryAnchor',
      'dialogueHook',
      'writingNotes'
    ]
    const hasRequiredKeys = requiredKeys.every((key) => key in parsed && parsed[key])

    if (!hasRequiredKeys) {
      return getDefaultBlueprint(idea, tone)
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

/**
 * Generates fiction prose based on an idea, tone, and character context.
 * @param {string} idea - The scene idea.
 * @param {string} tone - The desired tone.
 * @param {string[]} [characterNames=[]] - Optional list of character names.
 * @param {string} [targetLength='short'] - 'short' or 'full'.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedContentResult>} The generated content result.
 * @throws {Error} If generation fails.
 */
export async function generateContent(
  idea,
  tone,
  characterNames = [],
  targetLength = 'short',
  manuscriptContext = null,
  { projectCategory, projectDescription, profileContextString } = {}
) {
  const lengthInstructions =
    targetLength === 'short'
      ? 'Write a short scene of about 300-500 words.'
      : 'Write a full chapter of about 1500-2000 words.'

  const projectContext = buildContextString(projectCategory, projectDescription)
  const systemPrompt =
    'You are a creative fiction writer. Write engaging prose.' +
    (profileContextString ? '\n\n' + profileContextString : '')

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nThe following excerpts establish the current narrative. Write prose that continues naturally from this context.\n\n${manuscriptContext.contextText}`
  }

  const userPrompt = `Write fiction in third person. ${lengthInstructions}
Include sensory details, dialogue, and emotional interiority.
No preamble. No explanation. Just the story.

Tone: ${tone}
${characterNames.length > 0 ? 'Characters: ' + characterNames.join(', ') : ''}
Scene idea: ${idea}${projectContext}${contextInstruction}`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, systemPrompt, { feature: FEATURES.CONTENT })
    )
    return { text: response, error: null }
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(
      isApiError
        ? error.message
        : 'Generation failed. Ensure Ollama is running and your model is loaded.'
    )
  }
}

/**
 * Streams generated fiction prose.
 * @param {string} idea - The scene idea.
 * @param {string} tone - The desired tone.
 * @param {string[]} [characterNames=[]] - Optional list of character names.
 * @param {string} [targetLength='short'] - 'short' or 'full'.
 * @param {Function} onProgress - Callback function for streaming progress.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedContentResult>} The generated content result.
 * @throws {Error} If generation fails.
 */
export async function generateContentStreaming(
  idea,
  tone,
  characterNames = [],
  targetLength = 'short',
  onProgress = null,
  manuscriptContext = null,
  { projectCategory, projectDescription, profileContextString } = {}
) {
  const lengthInstructions =
    targetLength === 'short'
      ? 'Write a short scene of about 300-500 words.'
      : 'Write a full chapter of about 1500-2000 words.'

  const projectContext = buildContextString(projectCategory, projectDescription)
  const systemPrompt =
    'You are a creative fiction writer. Write engaging prose.' +
    (profileContextString ? '\n\n' + profileContextString : '')

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nThe following excerpts establish the current narrative. Write prose that continues naturally from this context.\n\n${manuscriptContext.contextText}`
  }

  const userPrompt = `Write fiction in third person. ${lengthInstructions}
Include sensory details, dialogue, and emotional interiority.
No preamble. No explanation. Just the story.

Tone: ${tone}
${characterNames.length > 0 ? 'Characters: ' + characterNames.join(', ') : ''}
Scene idea: ${idea}${projectContext}${contextInstruction}`

  try {
    const response = await retryWithBackoff(() =>
      aiStream(userPrompt, systemPrompt, onProgress, { feature: FEATURES.CONTENT })
    )
    return { text: response, error: null }
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(
      isApiError
        ? error.message
        : 'Generation failed. Ensure Ollama is running and your model is loaded.'
    )
  }
}

export { getDefaultBlueprint }
