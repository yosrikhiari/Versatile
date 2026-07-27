import { ref } from 'vue'
import { getChunksForDocument } from '../services/researchDb'
import {
  extractEntitiesFromChunks,
  type CharacterEntity,
  type LocationEntity,
  type RelationshipEntity,
  type EntityExtractionResult
} from '../services/research/entityExtractorService'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { addGraphEdgesBatch } from '../services/db-graph'

const SIMILARITY_THRESHOLD = 0.6

function wordSet(name: any) {
  return new Set(name.toLowerCase().split(/\s+/).filter(Boolean))
}

function jaccardSimilarity(a: any, b: any) {
  const setA = wordSet(a)
  const setB = wordSet(b)
  const intersection = new Set([...setA].filter((w) => setB.has(w)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

function findConflicts(name: any, existing: any) {
  const conflicts = []
  const lower = name.toLowerCase().trim()
  for (const entity of existing) {
    const existingLower = (entity.name || '').toLowerCase().trim()
    if (lower === existingLower) {
      return [entity]
    }
    if (jaccardSimilarity(lower, existingLower) >= SIMILARITY_THRESHOLD) {
      conflicts.push(entity)
    }
  }
  return conflicts
}

/** An extracted entity that collided with one already in the story bible. */
type CharacterConflict = CharacterEntity & { existing: any[] }
type LocationConflict = LocationEntity & { existing: any[] }

export interface ExtractionReview {
  extraction: EntityExtractionResult
  proposed: { characters: CharacterEntity[]; locations: LocationEntity[] }
  conflicts: { characters: CharacterConflict[]; locations: LocationConflict[] }
  relationships: RelationshipEntity[]
}

export function useResearchEntityExtractor(projectId: any) {
  const isExtracting = ref(false)
  const extractionError = ref<string | null>(null)
  const lastResult = ref<ExtractionReview | null>(null)

  async function extractFromDocument(documentId: any): Promise<ExtractionReview> {
    isExtracting.value = true
    extractionError.value = null
    lastResult.value = null

    try {
      const bibleStore = useStoryBibleStore()
      const chunks = await getChunksForDocument(documentId)
      if (!chunks || chunks.length === 0) {
        throw new Error('Document has no chunks to extract entities from')
      }

      const extraction = await extractEntitiesFromChunks(chunks)

      const proposed: ExtractionReview['proposed'] = { characters: [], locations: [] }
      const conflicts: ExtractionReview['conflicts'] = { characters: [], locations: [] }

      for (const char of extraction.characters) {
        const matches = findConflicts(char.name, bibleStore.characters)
        if (matches.length > 0) {
          conflicts.characters.push({ ...char, existing: matches })
        } else {
          proposed.characters.push(char)
        }
      }

      for (const loc of extraction.locations) {
        const matches = findConflicts(loc.name, bibleStore.locations)
        if (matches.length > 0) {
          conflicts.locations.push({ ...loc, existing: matches })
        } else {
          proposed.locations.push(loc)
        }
      }

      const result = {
        extraction,
        proposed,
        conflicts,
        relationships: extraction.relationships || []
      }

      lastResult.value = result
      return result
    } catch (err: any) {
      extractionError.value = err.message || 'Entity extraction failed'
      throw err
    } finally {
      isExtracting.value = false
    }
  }

  async function acceptExtraction(result: any) {
    const bibleStore = useStoryBibleStore()
    const pid = typeof projectId === 'function' ? projectId() : (projectId.value ?? projectId)

    const charIds = await bibleStore.addCharactersBatchData(
      pid,
      result.proposed.characters.map((c: any) => ({
        name: c.name,
        description: c.description || '',
        traits: c.traits || [],
        notes: c.notes || '',
        role: c.role || '',
        source: 'research'
      }))
    )

    const locIds = await bibleStore.addLocationsBatchData(
      pid,
      result.proposed.locations.map((l: any) => ({
        name: l.name,
        description: l.description || '',
        traits: l.traits || [],
        source: 'research'
      }))
    )

    const nameToCharId = new Map()
    result.proposed.characters.forEach((c: any, i: number) => {
      nameToCharId.set(c.name.toLowerCase(), charIds[i])
    })
    const nameToLocId = new Map()
    result.proposed.locations.forEach((l: any, i: number) => {
      nameToLocId.set(l.name.toLowerCase(), locIds[i])
    })

    const resolvedEdges = []
    for (const rel of result.relationships) {
      const fromChar = nameToCharId.get(rel.from.toLowerCase())
      const toChar = nameToCharId.get(rel.to.toLowerCase())
      const toLoc = nameToLocId.get(rel.to.toLowerCase())

      if (fromChar) {
        if (toChar) {
          resolvedEdges.push({
            sourceType: 'character',
            sourceId: fromChar,
            targetType: 'character',
            targetId: toChar,
            edgeType: rel.relationshipType,
            label: rel.description || rel.relationshipType
          })
        } else if (toLoc) {
          resolvedEdges.push({
            sourceType: 'character',
            sourceId: fromChar,
            targetType: 'location',
            targetId: toLoc,
            edgeType: rel.relationshipType,
            label: rel.description || rel.relationshipType
          })
        }
      }
    }

    if (resolvedEdges.length > 0) {
      await addGraphEdgesBatch(pid, resolvedEdges)
    }

    return { charIds, locIds, edgeCount: resolvedEdges.length }
  }

  function clearResult() {
    lastResult.value = null
    extractionError.value = null
  }

  return {
    isExtracting,
    extractionError,
    lastResult,
    extractFromDocument,
    acceptExtraction,
    clearResult
  }
}
