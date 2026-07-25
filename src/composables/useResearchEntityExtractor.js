import { ref } from 'vue'
import { getChunksForDocument } from '../services/researchDb'
import { extractEntitiesFromChunks } from '../services/research/entityExtractorService'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { addGraphEdgesBatch } from '../services/db-graph'

const SIMILARITY_THRESHOLD = 0.6

function wordSet(name) {
  return new Set(name.toLowerCase().split(/\s+/).filter(Boolean))
}

function jaccardSimilarity(a, b) {
  const setA = wordSet(a)
  const setB = wordSet(b)
  const intersection = new Set([...setA].filter((w) => setB.has(w)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

function findConflicts(name, existing) {
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

export function useResearchEntityExtractor(projectId) {
  const isExtracting = ref(false)
  const extractionError = ref(null)
  const lastResult = ref(null)

  async function extractFromDocument(documentId) {
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

      const proposed = { characters: [], locations: [] }
      const conflicts = { characters: [], locations: [] }

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
    } catch (err) {
      extractionError.value = err.message || 'Entity extraction failed'
      throw err
    } finally {
      isExtracting.value = false
    }
  }

  async function acceptExtraction(result) {
    const bibleStore = useStoryBibleStore()
    const pid = typeof projectId === 'function' ? projectId() : (projectId.value ?? projectId)

    const charIds = await bibleStore.addCharactersBatchData(
      pid,
      result.proposed.characters.map((c) => ({
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
      result.proposed.locations.map((l) => ({
        name: l.name,
        description: l.description || '',
        traits: l.traits || [],
        source: 'research'
      }))
    )

    const nameToCharId = new Map()
    result.proposed.characters.forEach((c, i) => {
      nameToCharId.set(c.name.toLowerCase(), charIds[i])
    })
    const nameToLocId = new Map()
    result.proposed.locations.forEach((l, i) => {
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
