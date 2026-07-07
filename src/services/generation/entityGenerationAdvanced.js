/**
 * Advanced entity generation: character from idea, characters/locations from plot thread.
 * Extracted from entityGeneration.js.
 */
import { aiGenerate } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'
import { useGraphContext } from '../../composables/useGraphContext'
import { useNetworkSuggestions } from '../../composables/useNetworkSuggestions'
import { getEmbedding, cosineSimilarity } from '../ollamaService'
import {
  retryWithBackoff,
  sanitizeJsonResponse,
  getProjectContext,
  getExistingEntitiesContext
} from '../ai/aiHelpers'
import { getEmbeddingStorageKey } from '../../config/storageKeys'

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

// --- Embedding helpers ---

async function getIdeaEmbedding(idea) {
  const text = idea
  const cacheKey = `idea_${btoa(String.fromCodePoint(...new TextEncoder().encode(text))).slice(0, 32)}`
  const storageKey = getEmbeddingStorageKey(cacheKey)

  const cached = localStorage.getItem(storageKey)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {
      localStorage.removeItem(storageKey)
    }
  }
  try {
    const embedding = await getEmbedding('idea', 0, text)
    if (embedding) {
      localStorage.setItem(storageKey, JSON.stringify(embedding))
    }
    return embedding
  } catch {
    return null
  }
}

// --- Helper functions ---

function parseCharacterResponse(response) {
  const parsed = sanitizeJsonResponse(response)
  if (!parsed || (!parsed.name && !parsed.Name)) {
    throw new Error('Invalid JSON')
  }
  return {
    name: parsed.name || parsed.Name || 'Unnamed Character',
    role: parsed.role || parsed.Role || '',
    goal: parsed.goal || parsed.Goal || '',
    voice: parsed.voice || parsed.Voice || '',
    notes: parsed.notes || parsed.Notes || '',
    sampleDialogue: parsed.sampleDialogue || parsed.SampleDialogue || ''
  }
}

function parseCharacterArrayResponse(response) {
  let parsed = sanitizeJsonResponse(response)
  if (!parsed) {
    throw new Error('Invalid JSON')
  }
  if (!Array.isArray(parsed)) {
    parsed = [parsed]
  }
  return parsed.map((p) => ({
    name: p.name || p.Name || 'Unnamed Character',
    role: p.role || p.Role || '',
    goal: p.goal || p.Goal || '',
    voice: p.voice || p.Voice || '',
    notes: p.notes || p.Notes || '',
    sampleDialogue: p.sampleDialogue || p.SampleDialogue || ''
  }))
}

function handleGenerationError(error) {
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

async function getIdeaRelationshipContext(text, existingCharacters) {
  if (!existingCharacters || existingCharacters.length === 0) return ''

  const { getRelationshipContext } = useGraphContext()
  const { loadEmbeddings, getEntityEmbedding } = useNetworkSuggestions()
  await loadEmbeddings()

  const embedding = await getIdeaEmbedding(text)
  if (!embedding) return ''

  const similarities = existingCharacters.map((char) => {
    const charEmb = getEntityEmbedding('character', char.id)
    return { id: char.id, score: charEmb ? cosineSimilarity(embedding, charEmb) : 0 }
  })
  similarities.sort((a, b) => b.score - a.score)
  const topIds = similarities
    .slice(0, 3)
    .filter((s) => s.score > 0)
    .map((s) => ({ type: 'character', id: s.id }))

  if (topIds.length === 0) return ''

  const relationshipContext = await getRelationshipContext(topIds, 2)
  if (!relationshipContext) return ''

  return `\n\nRelationship context:\n${relationshipContext}\n`
}

// --- System prompts ---

const IDEA_CHARACTER_SYSTEM_PROMPT = `You are a creative character designer. Given a character idea or description, you expand it into a full character profile that stays true to the user's intent while adding depth and detail.`

const LOCATION_SYSTEM_PROMPT = `You generate diverse, unique fictional locations. Vary: genre, time period, culture, environment type (urban, rural, underwater, airborne, underground, cosmic). Avoid generic fantasy tropes.`

/**
 * Generates a character from a short idea/description.
 * @param {string} characterIdea - The core idea for the character.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @param {Array} [existingCharacters=[]] - Existing characters for relationship context.
 * @returns {Promise<GeneratedCharacter>} The generated character.
 * @throws {Error} If generation or parsing fails.
 */
export async function generateCharacterFromIdea(characterIdea, manuscriptContext = null, existingCharacters = []) {
  const entityContext = await getExistingEntitiesContext()
  const relationshipContextSection = await getIdeaRelationshipContext(characterIdea, existingCharacters)

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const userPrompt = `Generate a full character profile from this idea/description:

CHARACTER IDEA: "${characterIdea}"

Create a complete character as JSON with these keys: name, role, goal, voice, notes, sampleDialogue.
All values must be strings. No markdown.

IMPORTANT:
- Stay true to the user's description - keep the core essence
- Expand it with details that support the description
- The goal should flow naturally from the role and description
- Make the voice distinctive and match their personality
- Add notes that provide backstory depth

${entityContext}${relationshipContextSection}${contextInstruction}

Example outputs:
- Idea: "A cynical detective hunting a killer" \u2192 name: "Mara Vance", role: "jaded PI", goal: "catch the killer before her past resurfaces", voice: "snappy, noir, observational", notes: "lost her brother to the same killer years ago"
- Idea: "The loyal friend who betrays for money" \u2192 name: "Cal Blackwood", role: "best friend", goal: "get the money to save his dying daughter", voice: "warm, reassuring, slight guilt in tone", notes: "secretly gambled away the inheritance"`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, IDEA_CHARACTER_SYSTEM_PROMPT, { feature: FEATURES.WORLDBUILDING })
    )
    return parseCharacterResponse(response)
  } catch (error) {
    handleGenerationError(error)
  }
}

/**
 * Generates an array of characters related to a specific plot thread.
 * @param {Object} plotThread - The plot thread to base characters on.
 * @param {number} [count=3] - Number of characters to generate.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @param {Array} [existingCharacters=[]] - Existing characters for relationship context.
 * @returns {Promise<GeneratedCharacter[]>} The generated characters.
 * @throws {Error} If generation fails.
 */
export async function generateCharactersForPlotThread(
  plotThread,
  count = 3,
  manuscriptContext = null,
  existingCharacters = []
) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()

  const plotThreadText = plotThread ? `${plotThread.title} ${plotThread.notes || ''}` : ''
  const relationshipContextSection = await getIdeaRelationshipContext(plotThreadText, existingCharacters)

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const plotThreadInfo = plotThread
    ? `\n\nTarget PLOT THREAD:\n- Title: "${plotThread.title}"\n- Notes: "${plotThread.notes || 'No notes yet'}"`
    : ''

  const userPrompt = `Generate ${count} distinct fictional characters that could appear in or relate to this plot thread.${plotThreadInfo}
Each character must have a unique name, role, goal, voice, notes, and sampleDialogue.

Return JSON array with ${count} character objects:
[{"name": "...", "role": "...", "goal": "...", "voice": "...", "notes": "...", "sampleDialogue": "..."}]

IMPORTANT for each character:
- Character goals should connect to or influence the plot thread
- Vary the relationships to this plot thread: protagonists, antagonists, bystanders, unwilling participants
- Each character's goal should be distinct - some may oppose each other
- Create interesting dynamics: conflicting goals, alliances, hidden agendas
- Goals should relate to the plot thread's conflict/tension${projectContext}${entityContext}${relationshipContextSection}${contextInstruction}

Do NOT generate name, role, goal identical to any existing character. Be creative and distinct.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, IDEA_CHARACTER_SYSTEM_PROMPT, { feature: FEATURES.WORLDBUILDING })
    )
    return parseCharacterArrayResponse(response)
  } catch (error) {
    handleGenerationError(error)
  }
}

/**
 * Generates an array of locations related to a specific plot thread.
 * @param {Object} plotThread - The plot thread to base locations on.
 * @param {number} [count=3] - Number of locations to generate.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedLocation[]>} The generated locations.
 * @throws {Error} If generation fails.
 */
export async function generateLocationsForPlotThread(
  plotThread,
  count = 3,
  manuscriptContext = null
) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const plotThreadInfo = plotThread
    ? `\n\nTarget PLOT THREAD:\n- Title: "${plotThread.title}"\n- Notes: "${plotThread.notes || 'No notes yet'}"`
    : ''

  const userPrompt = `Generate ${count} distinct fictional locations that could appear in or relate to this plot thread.${plotThreadInfo}
Each location must have a unique name, description, and notes.

Return JSON array with ${count} location objects:
[{"name": "...", "description": "...", "notes": "..."}]

IMPORTANT for each location:
- Locations should relate to or be relevant to the plot thread's setting and conflict
- Vary the types: meeting points, key scenes, hideouts, transit areas, etc.
- Each location should feel atmospheric and story-appropriate
- Descriptions should hint at the location's role in the plot${projectContext}${entityContext}${contextInstruction}

Do NOT generate name identical to any existing location. Be creative and distinct.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, LOCATION_SYSTEM_PROMPT, { feature: FEATURES.WORLDBUILDING })
    )

    let parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }

    if (!Array.isArray(parsed)) {
      parsed = [parsed]
    }

    const locations = parsed.map((p) => ({
      name: p.name || p.Name || 'Unnamed Location',
      description: p.description || p.Description || '',
      notes: p.notes || p.Notes || ''
    }))

    return locations
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
