import { aiGenerateJson } from '../../composables/useAiService'
import { FEATURES } from '../../config/ai'

export interface EntityExtractionResult {
  characters: CharacterEntity[]
  locations: LocationEntity[]
  relationships: RelationshipEntity[]
}

export interface CharacterEntity {
  name: string
  role?: string
  description?: string
  traits?: string[]
  notes?: string
}

export interface LocationEntity {
  name: string
  description?: string
  traits?: string[]
}

export interface RelationshipEntity {
  from: string
  to: string
  relationshipType: string
  description?: string
}

const EXTRACTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    characters: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          role: { type: 'string' as const },
          description: { type: 'string' as const },
          traits: { type: 'array' as const, items: { type: 'string' as const } },
          notes: { type: 'string' as const }
        },
        required: ['name']
      }
    },
    locations: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          description: { type: 'string' as const },
          traits: { type: 'array' as const, items: { type: 'string' as const } }
        },
        required: ['name']
      }
    },
    relationships: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          from: { type: 'string' as const },
          to: { type: 'string' as const },
          relationshipType: { type: 'string' as const },
          description: { type: 'string' as const }
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

interface ChunkItem {
  text?: string
  content?: string
}

function buildUserText(chunks: ChunkItem[]): string {
  const combined = chunks
    .map((c) => c.text || c.content || '')
    .filter(Boolean)
    .join('\n\n')
  return combined.length > MAX_INPUT_CHARS
    ? combined.slice(0, MAX_INPUT_CHARS) + '\n\n[...truncated]'
    : combined
}

function countExtractedEntities(result: EntityExtractionResult | null): number {
  if (!result) return 0
  return (
    (result.characters?.length || 0) +
    (result.locations?.length || 0) +
    (result.relationships?.length || 0)
  )
}

export async function extractEntitiesFromChunks(
  chunks: ChunkItem[],
  { signal }: { signal?: AbortSignal } = {}
): Promise<EntityExtractionResult> {
  const text = buildUserText(chunks)
  if (!text.trim()) {
    return { characters: [], locations: [], relationships: [] }
  }

  const userPrompt = `Extract story entities from this research text:\n\n${text}`

  let result: EntityExtractionResult | null = null
  const MAX_ATTEMPTS = 2
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    result = await aiGenerateJson<EntityExtractionResult>(userPrompt, SYSTEM_PROMPT, {
      feature: FEATURES.WORLDBUILDING,
      temperature: 0.3,
      schema: EXTRACTION_SCHEMA,
      schemaName: 'entity_extraction',
      signal
    }).catch((err: unknown) => {
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
