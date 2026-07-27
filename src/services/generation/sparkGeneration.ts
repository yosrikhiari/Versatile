import { aiGenerate, aiStream } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'
import { sanitizeJsonResponse } from '../ai/aiHelpers'

export interface SparkBlueprint {
  title: string
  openingBeat: string
  turningPoint: string
  confrontationBeat: string
  closingBeat: string
  sensoryAnchor: string
  dialogueHook: string
  writingNotes: string
}

interface GeneratedContentResult {
  text: string
  error: string | null
}

function buildContextString(category: string | null | undefined, description: string | null | undefined): string {
  const parts: string[] = []
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

export function getDefaultBlueprint(idea: string, _tone?: string): SparkBlueprint {
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

interface ManuscriptContext {
  contextText?: string
}

interface SparkOptions {
  projectCategory?: string
  projectDescription?: string
}

interface ContentOptions extends SparkOptions {
  profileContextString?: string
}

export async function generateSparkPrompt(
  type: string,
  characterNames: string[] = [],
  relateToProject = false,
  manuscriptContext: ManuscriptContext | null = null,
  { projectCategory, projectDescription }: SparkOptions = {}
): Promise<string> {
  const typeDescriptions: Record<string, string> = {
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

export async function generateOutline(
  idea: string,
  tone: string,
  _characterNames: string[] = [],
  _targetLength: string = 'full',
  manuscriptContext: ManuscriptContext | null = null,
  { projectCategory, projectDescription }: SparkOptions = {}
): Promise<SparkBlueprint> {
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
    const parsed = sanitizeJsonResponse<SparkBlueprint>(response)
    if (!parsed) {
      return getDefaultBlueprint(idea, tone)
    }

    const requiredKeys: (keyof SparkBlueprint)[] = [
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
  } catch (error: any) {
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

export async function generateContent(
  idea: string,
  tone: string,
  characterNames: string[] = [],
  targetLength: string = 'short',
  manuscriptContext: ManuscriptContext | null = null,
  { projectCategory, projectDescription, profileContextString }: ContentOptions = {}
): Promise<GeneratedContentResult> {
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
    const response = await aiGenerate(userPrompt, systemPrompt, { feature: FEATURES.CONTENT })
    return { text: response, error: null }
  } catch (error: any) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(
      isApiError
        ? error.message
        : 'Generation failed. Ensure Ollama is running and your model is loaded.'
    )
  }
}

export async function generateContentStreaming(
  idea: string,
  tone: string,
  characterNames: string[] = [],
  targetLength: string = 'short',
  onProgress: ((text: string) => void) | null = null,
  manuscriptContext: ManuscriptContext | null = null,
  { projectCategory, projectDescription, profileContextString }: ContentOptions = {}
): Promise<GeneratedContentResult> {
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
    const response = await aiStream(userPrompt, systemPrompt, onProgress, {
      feature: FEATURES.CONTENT
    })
    return { text: response, error: null }
  } catch (error: any) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(
      isApiError
        ? error.message
        : 'Generation failed. Ensure Ollama is running and your model is loaded.'
    )
  }
}
