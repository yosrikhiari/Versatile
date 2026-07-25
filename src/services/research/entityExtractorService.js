import { aiGenerateJson } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          description: { type: 'string' },
          traits: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' }
        },
        required: ['name']
      }
    },
    locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          traits: { type: 'array', items: { type: 'string' } }
        },
        required: ['name']
      }
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          relationshipType: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['from', 'to', 'relationshipType']
      }
    }
  },
  required: ['characters', 'locations', 'relationships']
}

const SYSTEM_PROMPT = `You are a research analyst extracting story entities from reference material.

Read the provided research text carefully. Extract:
- characters: named individuals, historical figures, or fictional people discussed in the text
- locations: named places, settings, regions, or landmarks mentioned
- relationships: meaningful connections between any character/character or character/location pairs

Rules:
- Only extract entities that are actually named or clearly described in the text
- Use the exact name as written in the source where possible
- For traits, use 2-5 descriptive keywords per entity
- Include a brief description synthesizing what the text reveals
- Omit characters/locations/relationships arrays if none were found in the text
- Do not invent details not present in the source material

Return ONLY valid JSON matching the requested schema.`

const MAX_INPUT_CHARS = 12000

function buildUserText(chunks) {
  const combined = chunks
    .map((c) => c.text || c.content || '')
    .filter(Boolean)
    .join('\n\n')
  return combined.length > MAX_INPUT_CHARS
    ? combined.slice(0, MAX_INPUT_CHARS) + '\n\n[...truncated]'
    : combined
}

function countExtractedEntities(result) {
  if (!result) return 0
  return (
    (result.characters?.length || 0) +
    (result.locations?.length || 0) +
    (result.relationships?.length || 0)
  )
}

export async function extractEntitiesFromChunks(chunks, { signal } = {}) {
  const text = buildUserText(chunks)
  if (!text.trim()) {
    return { characters: [], locations: [], relationships: [] }
  }

  const userPrompt = `Extract story entities from this research text:\n\n${text}`

  let result = null
  const MAX_ATTEMPTS = 2
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    result = await aiGenerateJson(userPrompt, SYSTEM_PROMPT, {
      feature: FEATURES.WORLDBUILDING,
      temperature: 0.3,
      schema: EXTRACTION_SCHEMA,
      schemaName: 'entity_extraction',
      signal
    }).catch((err) => {
      console.warn(`[entityExtractorService] attempt ${attempt} failed:`, err)
      return null
    })
    if (countExtractedEntities(result) > 0) break
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[entityExtractorService] attempt ${attempt} returned no entities; retrying.`)
    }
  }

  return {
    characters: result?.characters || [],
    locations: result?.locations || [],
    relationships: result?.relationships || []
  }
}
