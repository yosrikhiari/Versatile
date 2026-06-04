/**
 * Entity generation and enhancement functions: characters, locations, plot threads.
 * Extracted from useOllama.js.
 */
import { aiGenerate } from '../aiService'
import { FEATURES } from '../../config/ai'
import { useProjectStore } from '../../stores/projectStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useGraphContext } from '../../composables/useGraphContext'
import { useNetworkSuggestions } from '../../composables/useNetworkSuggestions'
import { useContextCompactor } from '../../composables/useContextCompactor'
import { generateEntity } from '../../composables/generation'
import { getEmbedding, cosineSimilarity } from '../ollamaService'
import {
  retryWithBackoff,
  sanitizeJsonResponse,
  getProjectContext,
  getExistingEntitiesContext,
  FIELD_LENGTH_CONSTRAINTS
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

/**
 * @typedef {Object} GeneratedPlotThread
 * @property {string} title
 * @property {string} notes
 * @property {string[]} characters
 * @property {string[]} locations
 */

// --- Embedding helpers ---

async function getIdeaEmbedding(idea) {
  const text = idea
  const cacheKey = `idea_${btoa(unescape(encodeURIComponent(text))).slice(0, 32)}`
  const storageKey = getEmbeddingStorageKey(cacheKey)
  
  // STORAGE_KEYS ref
  const cached = localStorage.getItem(storageKey)
  if (cached) {
    try {
      return JSON.parse(cached)
    } catch {
      // STORAGE_KEYS ref
      localStorage.removeItem(storageKey)
    }
  }
  try {
    const embedding = await getEmbedding('idea', 0, text)
    if (embedding) {
      // STORAGE_KEYS ref
      localStorage.setItem(storageKey, JSON.stringify(embedding))
    }
    return embedding
  } catch {
    return null
  }
}

// --- System prompts ---

const CHARACTER_SYSTEM_PROMPT = `You generate diverse, unique fictional characters. Vary: genre (fantasy, sci-fi, noir, romance, horror, historical), time period, culture, personality type, and naming conventions. Names should be culturally appropriate and distinct. Avoid clichés.`

const IDEA_CHARACTER_SYSTEM_PROMPT = `You are a creative character designer. Given a character idea or description, you expand it into a full character profile that stays true to the user's intent while adding depth and detail.`

const LOCATION_SYSTEM_PROMPT = `You generate diverse, unique fictional locations. Vary: genre, time period, culture, environment type (urban, rural, underwater, airborne, underground, cosmic). Avoid generic fantasy tropes.`

const PLOT_SYSTEM_PROMPT = `You generate diverse, compelling plot conflicts. Vary: genre, stakes (personal, societal, cosmic), type (mystery, heist, survival, romance, betrayal, discovery), and moral complexity. Avoid tired tropes.`

// --- Character generation ---

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
  return generateEntity('character', instructions, { manuscriptContext })
}

/**
 * Generates a character from a short idea/description.
 * @param {string} characterIdea - The core idea for the character.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedCharacter>} The generated character.
 * @throws {Error} If generation or parsing fails.
 */
export async function generateCharacterFromIdea(characterIdea, manuscriptContext = null) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()
  const { getRelationshipContext } = useGraphContext()
  const { loadEmbeddings, getEntityEmbedding } = useNetworkSuggestions()

  let relationshipContextSection = ''
  const allCharacters = useStoryBibleStore().characters
  if (allCharacters.length > 0) {
    await loadEmbeddings()

    const ideaEmbedding = await getIdeaEmbedding(characterIdea)
    if (ideaEmbedding) {
      const similarities = allCharacters.map(char => {
        const charEmb = getEntityEmbedding('character', char.id)
        if (!charEmb) return { id: char.id, score: 0 }
        return { id: char.id, score: cosineSimilarity(ideaEmbedding, charEmb) }
      })
      similarities.sort((a, b) => b.score - a.score)
      const topIds = similarities.slice(0, 3)
        .filter(s => s.score > 0)
        .map(s => ({ type: 'character', id: s.id }))

      if (topIds.length > 0) {
        const relationshipContext = await getRelationshipContext(topIds, 2)
        if (relationshipContext) {
          relationshipContextSection = `\n\nRelationship context:\n${relationshipContext}\n`
        }
      }
    }
  }

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
- Idea: "A cynical detective hunting a killer" → name: "Mara Vance", role: "jaded PI", goal: "catch the killer before her past resurfaces", voice: "snappy, noir, observational", notes: "lost her brother to the same killer years ago"
- Idea: "The loyal friend who betrays for money" → name: "Cal Blackwood", role: "best friend", goal: "get the money to save his dying daughter", voice: "warm, reassuring, slight guilt in tone", notes: "secretly gambled away the inheritance"`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, IDEA_CHARACTER_SYSTEM_PROMPT, { feature: FEATURES.WORLDBUILDING })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed || !parsed.name && !parsed.Name) {
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
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

/**
 * Generates an array of characters related to a specific plot thread.
 * @param {Object} plotThread - The plot thread to base characters on.
 * @param {number} [count=3] - Number of characters to generate.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedCharacter[]>} The generated characters.
 * @throws {Error} If generation fails.
 */
export async function generateCharactersForPlotThread(plotThread, count = 3, manuscriptContext = null) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()
  const { getRelationshipContext } = useGraphContext()
  const { loadEmbeddings, getEntityEmbedding } = useNetworkSuggestions()

  let relationshipContextSection = ''
  const allCharacters = useStoryBibleStore().characters
  if (allCharacters.length > 0) {
    await loadEmbeddings()

    const plotThreadText = plotThread ? `${plotThread.title} ${plotThread.notes || ''}` : ''
    const plotThreadEmbedding = await getIdeaEmbedding(plotThreadText)

    if (plotThreadEmbedding) {
      const similarities = allCharacters.map(char => {
        const charEmb = getEntityEmbedding('character', char.id)
        if (!charEmb) return { id: char.id, score: 0 }
        return { id: char.id, score: cosineSimilarity(plotThreadEmbedding, charEmb) }
      })
      similarities.sort((a, b) => b.score - a.score)
      const topIds = similarities.slice(0, 3)
        .filter(s => s.score > 0)
        .map(s => ({ type: 'character', id: s.id }))

      if (topIds.length > 0) {
        const relationshipContext = await getRelationshipContext(topIds, 2)
        if (relationshipContext) {
          relationshipContextSection = `\n\nRelationship context:\n${relationshipContext}\n`
        }
      }
    }
  }

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

    let parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }

    if (!Array.isArray(parsed)) {
      parsed = [parsed]
    }

    return parsed.map(p => ({
      name: p.name || p.Name || 'Unnamed Character',
      role: p.role || p.Role || '',
      goal: p.goal || p.Goal || '',
      voice: p.voice || p.Voice || '',
      notes: p.notes || p.Notes || '',
      sampleDialogue: p.sampleDialogue || p.SampleDialogue || ''
    }))
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
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
export async function generateLocationsForPlotThread(plotThread, count = 3, manuscriptContext = null) {
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

    return parsed.map(p => ({
      name: p.name || p.Name || 'Unnamed Location',
      description: p.description || p.Description || '',
      notes: p.notes || p.Notes || ''
    }))
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

// --- Random entity generation ---

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

// --- Enhancement functions ---

/**
 * Completes a partial character profile.
 * @param {Object} partialData - Partial character data containing some defined fields.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedCharacter>} The enhanced/completed character.
 * @throws {Error} If generation fails.
 */
export async function enhanceCharacter(partialData, manuscriptContext = null) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const existingFields = []
  if (partialData.name) existingFields.push(`Name: "${partialData.name}"`)
  if (partialData.role) existingFields.push(`Role: "${partialData.role}"`)
  if (partialData.goal) existingFields.push(`Goal: "${partialData.goal}"`)
  if (partialData.voice) existingFields.push(`Voice: "${partialData.voice}"`)
  if (partialData.notes) existingFields.push(`Notes: "${partialData.notes}"`)
  if (partialData.sampleDialogue) existingFields.push(`SampleDialogue: "${partialData.sampleDialogue}"`)

  const existingPart = existingFields.length > 0
    ? `\n\nExisting information to respect and build upon:\n${existingFields.join('\n')}`
    : ''

  const lengthGuidance = Object.entries(FIELD_LENGTH_CONSTRAINTS.character)
    .map(([field, constraint]) => `- ${field}: max ${constraint.maxSentences} sentence(s), ~${constraint.maxWords} words (${constraint.guidance})`)
    .join('\n')

  const userPrompt = `You are a character creation assistant. Given partial character information and existing story elements, complete the character profile.

IMPORTANT: Character fields are interconnected. When generating each field, consider how it relates to all other fields. A character's name influences their personality, their role affects their goal, their goal shapes their voice, etc.

LENGTH CONSTRAINTS (follow these strictly):
${lengthGuidance}

${projectContext}${existingPart}${entityContext}${contextInstruction}

Generate a complete character profile as JSON. Keys: name, role, goal, voice, notes, sampleDialogue.
${existingFields.length > 0 ? `
- The provided fields are your anchor points - build everything else to support them
- Each new field must be consistent with and complement the existing fields
- This character should feel like they belong in the story alongside existing characters
- Consider how this character relates to or differs from existing characters
- If name is "Marcus", role is "war veteran", then goal might be "survive without being recognized" and voice might be "clipped, military-style"
- Make all fields feel like they belong to the same person` : `
- Create a distinctive, non-generic character
- Generate fields that are internally consistent (name fits voice, role fits goal, etc.)
- This character should complement or contrast with existing characters in interesting ways

CRITICAL GOAL DIFFERENTIATION:
- Look at EXISTING CHARACTERS' goals above - this character's goal must be DISTINCT
- Study what goals already exist: "Why does this character want something different?"
- The best goals create story dynamics: opposing, complementary, or parallel motivations
- Example variety: If existing character wants "to find the truth", this character might want "to hide it" (opposing), "to help them" (complementary), or "to profit from it" (parallel)
- Do NOT generate a goal similar to any existing character goal - be specific and different`}

All values must be strings. No markdown.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, 'You are a creative character designer.', { feature: FEATURES.WORLDBUILDING })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }

    const result = {
      name: partialData.name || parsed.name || parsed.Name || partialData.name || '',
      role: partialData.role || parsed.role || parsed.Role || '',
      goal: partialData.goal || parsed.goal || parsed.Goal || '',
      voice: partialData.voice || parsed.voice || parsed.Voice || '',
      notes: partialData.notes || parsed.notes || parsed.Notes || '',
      sampleDialogue: partialData.sampleDialogue || parsed.sampleDialogue || parsed.SampleDialogue || ''
    }

    return result
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

/**
 * Re-writes and enhances all fields of an existing character to improve quality.
 * @param {Object} charData - The current character data.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedCharacter>} The enhanced character.
 * @throws {Error} If generation fails.
 */
export async function enhanceExistingCharacter(charData, manuscriptContext = null) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const userPrompt = `You are a creative writing assistant helping improve a fictional character.

Here is the current character data:
${JSON.stringify(charData, null, 2)}
${projectContext}${entityContext}${contextInstruction}

Your task: Return an enhanced version of ALL fields. Keep the core identity and essence, but make each field richer, more specific, and more compelling. Improve the writing quality, add depth, and ensure all fields are internally consistent with each other.

Respond ONLY with a valid JSON object with these exact keys:
{
  "name": "improved name",
  "role": "improved role",
  "goal": "improved goal",
  "voice": "improved voice",
  "notes": "improved notes",
  "sampleDialogue": "a single line this character would say"
}

No markdown, no explanation, no preamble. JSON only.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, 'You are a creative character designer.', { feature: FEATURES.WORLDBUILDING })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }

    return {
      name: parsed.name || parsed.Name || charData.name || '',
      role: parsed.role || parsed.Role || charData.role || '',
      goal: parsed.goal || parsed.Goal || charData.goal || '',
      voice: parsed.voice || parsed.Voice || charData.voice || '',
      notes: parsed.notes || parsed.Notes || charData.notes || '',
      sampleDialogue: parsed.sampleDialogue || parsed.SampleDialogue || charData.sampleDialogue || ''
    }
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

/**
 * Enhances a single field of an entity, taking other fields into context.
 * @param {string} entityType - The type of entity ('character', 'location', 'plotThread').
 * @param {string} fieldName - The specific field to enhance.
 * @param {string} currentValue - The current value of the field.
 * @param {Object} allFields - The complete object of all fields for context.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<string>} The new value for the field.
 * @throws {Error} If generation fails.
 */
export async function enhanceSingleField(entityType, fieldName, currentValue, allFields, manuscriptContext = null) {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const fieldDescriptions = {
    character: {
      name: 'the character\'s name',
      role: 'the character\'s role or archetype',
      goal: 'the character\'s motivation and what they want to achieve',
      voice: 'how the character speaks - their speech patterns, vocabulary, tone',
      notes: 'additional character details, backstory snippets, or story hooks',
      sampleDialogue: 'a single line this character would actually say — not a description of how they speak, but the actual words'
    },
    location: {
      name: 'the location\'s name',
      description: 'physical description of the location',
      notes: 'location history, secrets, or narrative significance'
    },
    plotThread: {
      title: 'the plot thread\'s name or topic',
      notes: 'details about the conflict, tension, or unresolved question'
    }
  }

  const otherFieldsPart = Object.entries(allFields)
    .filter(([key, value]) => key !== fieldName && value)
    .map(([key, value]) => `${key}: "${value}"`)
    .join('\n')

  const fieldType = entityType === 'character' ? 'character' : entityType === 'location' ? 'location' : 'plot thread'
  const entityName = allFields?.name || allFields?.title || 'the entity'

  const fieldConstraints = FIELD_LENGTH_CONSTRAINTS[entityType]?.[fieldName] || { maxSentences: 3, maxWords: 40, guidance: 'be concise' }

  let titleContext = ''
  if (entityType === 'plotThread' && allFields.title) {
    titleContext = `\nCRITICAL: The title "${allFields.title}" is the PRIMARY context anchor. All generated content must be directly related to this title.`
  }

  let structuredBlock = ''
  if (entityType === 'plotThread' && fieldName === 'notes' && currentValue) {
    const charsMatch = currentValue.match(/\[Characters:\s*([^\]]+)\]/)
    const locsMatch = currentValue.match(/\[Locations:\s*([^\]]+)\]/)

    if (charsMatch || locsMatch) {
      const chars = charsMatch ? charsMatch[1].trim() : 'None'
      const locs = locsMatch ? locsMatch[1].trim() : 'None'
      structuredBlock = `\n\nIMPORTANT: Preserve this structured block at the END of your response (do not modify it):\n[Characters: ${chars}]\n[Locations: ${locs}]`
    }
  }

  const goalDifferentiation = entityType === 'character' && fieldName === 'goal' ? `

GOAL DIFFERENTIATION (CRITICAL for goals):
- Look at EXISTING CHARACTERS' goals in the context above
- This character's goal must be DISTINCT and DIFFERENT from existing goals
- Create variety: opposing goals block each other, complementary goals help each other, parallel goals share theme but differ in approach
- Example: If existing character wants "to find the truth", this character might want "to hide it" (opposing), "to help them" (complementary), or "to profit from it" (parallel)
- Do NOT generate a goal similar to any existing character goal` : ''

  const userPrompt = `TARGET: You are generating the "${fieldName}" field for ${fieldType} "${entityName}".

This ${fieldType}'s current fields:
${otherFieldsPart || 'No other details yet.'}

IMPORTANT: Generate content specifically for "${entityName}".
- It is appropriate and even desired for this ${fieldName} to reference or involve other characters, locations, or plot threads from the project
- Do NOT generate content for any other entity - this is for "${entityName}" only${titleContext}

${entityContext}
${contextInstruction}
${projectContext}${goalDifferentiation}

TASK: Generate the "${fieldName}" field value.
LENGTH CONSTRAINT: Maximum ${fieldConstraints.maxSentences} sentence(s), approximately ${fieldConstraints.maxWords} words. ${fieldConstraints.guidance}.${structuredBlock}

${currentValue ? `CURRENT VALUE: "${currentValue.replace(/\[Characters:.*?\]/g, '').replace(/\[Locations:.*?\]/g, '').trim()}"
GUIDANCE: This value exists for a reason. Either:
1. IMPROVE it: If it has merit, make it better while keeping its core essence
2. REPLACE it: Only if it contradicts the other fields or doesn't fit the context
3. COMPLEMENT it: Add details that make it work better with the other fields` : `GUIDANCE: Create a value that logically connects to and supports the other fields above.`}

IMPORTANT: The ${fieldName} must be consistent with all other fields AND the existing story elements.${entityType === 'plotThread' && allFields.title ? `\n- The title "${allFields.title}" defines the context - stay focused on this theme` : ''}
- Everything should be coherent and interconnected
- KEEP IT CONCISE: Do not exceed the sentence limit

Return as JSON: { "${fieldName}": "your generated value" }
Single string value, no markdown.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, 'You are a creative writing assistant.', { feature: FEATURES.WORLDBUILDING })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed || (!parsed[fieldName] && !parsed[fieldName.charAt(0).toUpperCase() + fieldName.slice(1)])) {
      throw new Error('Invalid JSON')
    }

    let result = parsed[fieldName] || parsed[fieldName.charAt(0).toUpperCase() + fieldName.slice(1)] || currentValue

    if (entityType === 'plotThread' && fieldName === 'notes' && currentValue) {
      const charsMatch = currentValue.match(/\[Characters:\s*([^\]]+)\]/)
      const locsMatch = currentValue.match(/\[Locations:\s*([^\]]+)\]/)

      if (charsMatch || locsMatch) {
        const chars = charsMatch ? charsMatch[0] : '[Characters: None]'
        const locs = locsMatch ? locsMatch[0] : '[Locations: None]'

        if (!result.includes('[Characters:') && !result.includes('[Locations:')) {
          result = result.trim() + '\n\n' + chars + '\n' + locs
        }
      }
    }

    return result
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

/**
 * Completes a partial location profile.
 * @param {Object} partialData - Partial location data.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedLocation>} The enhanced/completed location.
 * @throws {Error} If generation fails.
 */
export async function enhanceLocation(partialData, manuscriptContext = null) {
  const projectContext = getProjectContext()

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const existingFields = []
  if (partialData.name) existingFields.push(`Name: "${partialData.name}"`)
  if (partialData.description) existingFields.push(`Description: "${partialData.description}"`)
  if (partialData.notes) existingFields.push(`Notes: "${partialData.notes}"`)

  const existingPart = existingFields.length > 0
    ? `\n\nExisting information to respect and build upon:\n${existingFields.join('\n')}`
    : ''

  const locationLengthGuidance = Object.entries(FIELD_LENGTH_CONSTRAINTS.location)
    .map(([field, constraint]) => `- ${field}: max ${constraint.maxSentences} sentence(s), ~${constraint.maxWords} words (${constraint.guidance})`)
    .join('\n')

  const entityContext = await getExistingEntitiesContext()

  const userPrompt = `You are a location design assistant. Given partial location information, manuscript context, and existing story elements, complete the location profile.

IMPORTANT: Location fields are interconnected. A location's name often reflects its nature, the description should match the atmosphere, and notes should add depth that fits with both.

LENGTH CONSTRAINTS (follow these strictly):
${locationLengthGuidance}

${projectContext}${existingPart}${entityContext}${contextInstruction}

Generate a complete location profile as JSON. Keys: name, description, notes.
${existingFields.length > 0 ? `
- The provided fields are your anchor points - build everything else to support them
- Each new field must be consistent with and complement the existing fields
- This location should feel like it belongs in this story alongside existing locations
- Consider how this location relates to existing characters and plot threads
- If name is "The Hollow", description should hint at something dark or mysterious
- Notes should add depth that matches the established description
- Make the location feel atmospheric and story-appropriate` : `
- Create a distinctive, memorable setting
- Generate fields that are internally consistent
- This location should complement existing locations in interesting ways`}

All values must be strings. No markdown.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, 'You are a creative location designer.', { feature: FEATURES.WORLDBUILDING })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }

    const result = {
      name: partialData.name || parsed.name || parsed.Name || '',
      description: partialData.description || parsed.description || parsed.Description || '',
      notes: partialData.notes || parsed.notes || parsed.Notes || ''
    }

    return result
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

/**
 * Completes a partial plot thread.
 * @param {Object} partialData - Partial plot thread data.
 * @param {Object} [manuscriptContext=null] - Optional manuscript context.
 * @returns {Promise<GeneratedPlotThread>} The enhanced/completed plot thread.
 * @throws {Error} If generation fails.
 */
export async function enhancePlotThread(partialData, manuscriptContext = null) {
  const projectContext = getProjectContext()

  let contextInstruction = ''
  if (manuscriptContext?.contextText) {
    contextInstruction = `\n\nManuscript context:\n${manuscriptContext.contextText}`
  }

  const title = partialData.title || ''
  const existingNotes = partialData.notes || ''

  const existingPart = title || existingNotes
    ? `\n\nExisting information to respect and build upon:\n${title ? `Title: "${title}"` : ''}\n${existingNotes ? `Notes: "${existingNotes}"` : ''}`
    : ''

  const plotLengthGuidance = Object.entries(FIELD_LENGTH_CONSTRAINTS.plotThread)
    .map(([field, constraint]) => `- ${field}: max ${constraint.maxSentences} sentence(s), ~${constraint.maxWords} words (${constraint.guidance})`)
    .join('\n')

  const entityContext = await getExistingEntitiesContext()

  const userPrompt = `You are a plot design assistant. Given partial plot thread information, manuscript context, and existing story elements, complete the plot thread.

CRITICAL TITLE CONSTRAINT:
${title ? `The title "${title}" is the PRIMARY context anchor. All generated content MUST be directly related to this title. Do not introduce characters, locations, or events disconnected from the title.` : 'If a title is provided, use it as the primary anchor for all generated content.'}

LENGTH CONSTRAINTS (follow these strictly):
${plotLengthGuidance}

${projectContext}${existingPart}${entityContext}${contextInstruction}

Generate a complete plot thread as JSON with keys: title, notes, characters, locations.

${title ? `
- The title "${title}" defines the story context - generate content that fits this theme
- If only title is provided (e.g., "Elysia Fall"), generate content that plausibly belongs to a story with that title (related characters, events, locations)
- If title + notes are provided, weave the notes content around the title theme
- Do NOT generate random characters or events unrelated to the title` : `
- Create an engaging, story-worthy plot thread`}

IMPORTANT: The "characters" and "locations" arrays are REQUIRED. List 1-3 character names and 0-2 location names that are directly related to the plot thread content. If no specific entities are involved, use empty arrays.

Example format:
{
  "title": "The Betrayal",
  "notes": "Marcus discovers Elena's treachery...",
  "characters": ["Marcus", "Elena"],
  "locations": ["The Throne Room"]
}

All values must be strings or arrays. No markdown.`

  try {
    const response = await retryWithBackoff(() =>
      aiGenerate(userPrompt, 'You are a creative plot designer.', { feature: FEATURES.WORLDBUILDING })
    )
    const parsed = sanitizeJsonResponse(response)
    if (!parsed) {
      throw new Error('Invalid JSON')
    }

    const characters = parsed.characters || []
    const locations = parsed.locations || []

    let notes = parsed.notes || parsed.Notes || ''

    const charsStr = characters.length > 0 ? `[Characters: ${characters.join(', ')}]` : '[Characters: None]'
    const locsStr = locations.length > 0 ? `[Locations: ${locations.join(', ')}]` : '[Locations: None]'
    notes = notes.trim() + '\n\n' + charsStr + '\n' + locsStr

    const result = {
      title: title || parsed.title || parsed.Title || '',
      notes: notes,
      characters: characters,
      locations: locations
    }

    return result
  } catch (error) {
    const isApiError = error.message?.includes('Ollama error') || error.message?.includes('Model')
    throw new Error(isApiError ? error.message : 'Generation failed. Ensure Ollama is running and your model is loaded.')
  }
}

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