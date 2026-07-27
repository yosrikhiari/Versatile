import { aiGenerate } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'
import { useGraphContext } from '../../composables/useGraphContext'
import { useNetworkSuggestions } from '../../composables/useNetworkSuggestions'
import { getEmbedding, cosineSimilarity } from '../ollamaService'
import {
  sanitizeJsonResponse,
  getProjectContext,
  getExistingEntitiesContext
} from '../ai/aiHelpers'
import { getEmbeddingStorageKey } from '../../config/storageKeys'

export interface GeneratedCharacter {
  name: string
  role: string
  goal: string
  voice: string
  notes: string
  sampleDialogue: string
}

export interface GeneratedLocation {
  name: string
  description: string
  notes: string
}

interface ManuscriptContext {
  contextText?: string
}

interface ExistingEntity {
  id: string
}

interface PlotThread {
  title: string
  notes?: string
}

// --- Embedding helpers ---

async function getIdeaEmbedding(idea: string): Promise<number[] | null> {
  const text = idea
  const cacheKey = `idea_${btoa(String.fromCodePoint(...Array.from(new TextEncoder().encode(text)))).slice(0, 32)}`
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
    const embedding = await getEmbedding('idea', '0', text)
    if (embedding) {
      localStorage.setItem(storageKey, JSON.stringify(embedding))
    }
    return embedding
  } catch {
    return null
  }
}

// --- Helper functions ---

function parseCharacterResponse(response: string): GeneratedCharacter {
  const parsed: Record<string, unknown> | null = sanitizeJsonResponse(response)
  if (!parsed || (!parsed.name && !(parsed as any).Name)) {
    throw new Error('Invalid JSON')
  }
  return {
    name: parsed.name || (parsed as any).Name || 'Unnamed Character',
    role: parsed.role || (parsed as any).Role || '',
    goal: parsed.goal || (parsed as any).Goal || '',
    voice: parsed.voice || (parsed as any).Voice || '',
    notes: parsed.notes || (parsed as any).Notes || '',
    sampleDialogue: parsed.sampleDialogue || (parsed as any).SampleDialogue || ''
  }
}

function parseCharacterArrayResponse(response: string): GeneratedCharacter[] {
  const result = sanitizeJsonResponse(response)
  if (!result) {
    throw new Error('Invalid JSON')
  }
  const parsed: Record<string, unknown>[] = Array.isArray(result) ? result : [result]
  return parsed.map((p) => ({
    name: p.name || (p as any).Name || 'Unnamed Character',
    role: p.role || (p as any).Role || '',
    goal: p.goal || (p as any).Goal || '',
    voice: p.voice || (p as any).Voice || '',
    notes: p.notes || (p as any).Notes || '',
    sampleDialogue: p.sampleDialogue || (p as any).SampleDialogue || ''
  }))
}

function handleGenerationError(error: any): never {
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

async function getIdeaRelationshipContext(
  text: string,
  existingCharacters: ExistingEntity[]
): Promise<string> {
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
    .map((s) => ({ type: 'character' as const, id: s.id }))

  if (topIds.length === 0) return ''

  const relationshipContext = await getRelationshipContext(topIds, 2)
  if (!relationshipContext) return ''

  return `\n\nRelationship context:\n${relationshipContext}\n`
}

// --- System prompts ---

const IDEA_CHARACTER_SYSTEM_PROMPT = `You are a creative character designer. Given a character idea or description, you expand it into a full character profile that stays true to the user's intent while adding depth and detail.`

const LOCATION_SYSTEM_PROMPT = `You generate diverse, unique fictional locations. Vary: genre, time period, culture, environment type (urban, rural, underwater, airborne, underground, cosmic). Avoid generic fantasy tropes.`

export async function generateCharacterFromIdea(
  characterIdea: string,
  manuscriptContext: ManuscriptContext | null = null,
  existingCharacters: ExistingEntity[] = []
): Promise<GeneratedCharacter> {
  const entityContext = await getExistingEntitiesContext()
  const relationshipContextSection = await getIdeaRelationshipContext(
    characterIdea,
    existingCharacters
  )

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
    const response = await aiGenerate(userPrompt, IDEA_CHARACTER_SYSTEM_PROMPT, {
      feature: FEATURES.WORLDBUILDING
    })
    return parseCharacterResponse(response)
  } catch (error: any) {
    return handleGenerationError(error)
  }
}

export async function generateCharactersForPlotThread(
  plotThread: PlotThread | null | undefined,
  count = 3,
  manuscriptContext: ManuscriptContext | null = null,
  existingCharacters: ExistingEntity[] = []
): Promise<GeneratedCharacter[]> {
  const projectContext = getProjectContext()
  const entityContext = await getExistingEntitiesContext()

  const plotThreadText = plotThread ? `${plotThread.title} ${plotThread.notes || ''}` : ''
  const relationshipContextSection = await getIdeaRelationshipContext(
    plotThreadText,
    existingCharacters
  )

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
    const response = await aiGenerate(userPrompt, IDEA_CHARACTER_SYSTEM_PROMPT, {
      feature: FEATURES.WORLDBUILDING
    })
    return parseCharacterArrayResponse(response)
  } catch (error: any) {
    return handleGenerationError(error)
  }
}

export async function generateLocationsForPlotThread(
  plotThread: PlotThread | null | undefined,
  count = 3,
  manuscriptContext: ManuscriptContext | null = null
): Promise<GeneratedLocation[]> {
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
    const response = await aiGenerate(userPrompt, LOCATION_SYSTEM_PROMPT, {
      feature: FEATURES.WORLDBUILDING
    })

    const result = sanitizeJsonResponse(response)
    if (!result) {
      throw new Error('Invalid JSON')
    }

    const parsed: Record<string, unknown>[] = Array.isArray(result) ? result : [result]

    const locations: GeneratedLocation[] = parsed.map((p) => ({
      name: p.name || (p as any).Name || 'Unnamed Location',
      description: p.description || (p as any).Description || '',
      notes: p.notes || (p as any).Notes || ''
    }))

    return locations
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
