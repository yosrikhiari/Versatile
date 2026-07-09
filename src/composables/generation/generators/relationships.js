import { aiGenerateJson } from '../../useAiService'
import { FEATURES } from '../../../config/ai'
import {
  addCharacterRelationshipsBatch,
  addGraphEdgesBatch,
  getGraphEdges,
  getCharacterRelationships
} from '../../../services/dbService'

// Stage B — the Story Network. After the Story Bible entities are committed (so
// they have stable IDs), generate the deliberate relationships between them in a
// single structured call, then reconcile names → IDs and persist atomically.
// char↔char goes to characterRelationships (the typed, backend-synced table);
// everything else goes to the polymorphic graphEdges table.

const RELATIONSHIP_SCHEMA = {
  type: 'object',
  properties: {
    characterRelationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['from', 'to', 'type']
      }
    },
    characterLocations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string' },
          location: { type: 'string' },
          relationship: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['character', 'location']
      }
    },
    characterPlotThreads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string' },
          plotThread: { type: 'string' },
          involvement: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['character', 'plotThread']
      }
    },
    plotThreadLinks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' }
        },
        required: ['from', 'to']
      }
    }
  },
  required: ['characterRelationships']
}

const SYSTEM_PROMPT = `You are a story-structure architect mapping the relationship network of a cast that already exists.

You are given the exact characters, locations, and plot threads. Use ONLY these names — never invent new entities. Produce the meaningful connections between them:
- characterRelationships: how characters relate to each other (ally, rival, family, mentor, romantic, enemy, colleague, ...). Only pairs with a real dynamic.
- characterLocations: which characters are bound to which locations (home, frequents, avoids, imprisoned, rules, ...).
- characterPlotThreads: which characters drive, obstruct, or are affected by which plot threads (driver, obstacle, affected, catalyst, ...).
- plotThreadLinks: how plot threads relate (depends_on, parallels, resolves, complicates, ...).

Return ONLY JSON matching the requested shape. Omit an array if there are no meaningful connections of that kind.`

function normalizeName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function buildNameMap(items, nameField) {
  const map = new Map()
  for (const item of items || []) {
    const key = normalizeName(item[nameField])
    if (key && !map.has(key)) map.set(key, item.id)
  }
  return map
}

/**
 * Pure reconciliation: map an AI relationship result (names) to persistable rows
 * (IDs), dropping any endpoint whose name doesn't resolve to a committed entity.
 * Returns { characterRelationships, graphEdges, dropped }.
 */
export function buildRelationshipEdges(aiResult, { characters, locations, plotThreads }) {
  const charMap = buildNameMap(characters, 'name')
  const locMap = buildNameMap(locations, 'name')
  const threadMap = buildNameMap(plotThreads, 'title')

  const characterRelationships = []
  const graphEdges = []
  const dropped = []

  const seenCharRel = new Set()
  const seenEdge = new Set()

  for (const rel of aiResult?.characterRelationships || []) {
    const fromId = charMap.get(normalizeName(rel.from))
    const toId = charMap.get(normalizeName(rel.to))
    if (fromId == null || toId == null || fromId === toId) {
      dropped.push({ kind: 'characterRelationship', rel })
      continue
    }
    // Undirected dedupe — one edge per character pair.
    const key = [fromId, toId].sort((a, b) => a - b).join('|')
    if (seenCharRel.has(key)) continue
    seenCharRel.add(key)
    characterRelationships.push({
      fromCharacterId: fromId,
      toCharacterId: toId,
      type: rel.type || 'connected',
      notes: rel.description || ''
    })
  }

  const pushEdge = (sourceId, sourceType, targetId, targetType, relationshipType, description) => {
    if (sourceId == null || targetId == null) return false
    const key = `${sourceType}:${sourceId}|${targetType}:${targetId}`
    if (seenEdge.has(key)) return true
    seenEdge.add(key)
    graphEdges.push({
      sourceId: String(sourceId),
      sourceType,
      targetId: String(targetId),
      targetType,
      relationshipType: relationshipType || 'connected',
      description: description || '',
      planned: false
    })
    return true
  }

  for (const cl of aiResult?.characterLocations || []) {
    const ok = pushEdge(
      charMap.get(normalizeName(cl.character)),
      'character',
      locMap.get(normalizeName(cl.location)),
      'location',
      cl.relationship,
      cl.description
    )
    if (!ok) dropped.push({ kind: 'characterLocation', rel: cl })
  }

  for (const cp of aiResult?.characterPlotThreads || []) {
    const ok = pushEdge(
      charMap.get(normalizeName(cp.character)),
      'character',
      threadMap.get(normalizeName(cp.plotThread)),
      'plotThread',
      cp.involvement,
      cp.description
    )
    if (!ok) dropped.push({ kind: 'characterPlotThread', rel: cp })
  }

  for (const pl of aiResult?.plotThreadLinks || []) {
    const fromId = threadMap.get(normalizeName(pl.from))
    const toId = threadMap.get(normalizeName(pl.to))
    if (fromId != null && toId != null && fromId !== toId) {
      pushEdge(fromId, 'plotThread', toId, 'plotThread', pl.type, pl.description)
    } else {
      dropped.push({ kind: 'plotThreadLink', rel: pl })
    }
  }

  return { characterRelationships, graphEdges, dropped }
}

// Total connections the model proposed across all four categories — used to
// decide whether a result is worth keeping or worth one retry.
export function countAiConnections(aiResult) {
  if (!aiResult) return 0
  return (
    (aiResult.characterRelationships?.length || 0) +
    (aiResult.characterLocations?.length || 0) +
    (aiResult.characterPlotThreads?.length || 0) +
    (aiResult.plotThreadLinks?.length || 0)
  )
}

function buildUserPrompt({ characters, locations, plotThreads, synopsis, genre, tone }) {
  const payload = {
    synopsis: synopsis || '',
    genre: genre || '',
    tone: tone || '',
    characters: (characters || []).map((c) => ({ name: c.name, role: c.role, goal: c.goal })),
    locations: (locations || []).map((l) => ({ name: l.name, description: l.description })),
    plotThreads: (plotThreads || []).map((t) => ({ title: t.title, notes: t.notes }))
  }
  return `Map the relationship network for this story. Entities:\n\n${JSON.stringify(payload, null, 2)}`
}

/**
 * Generate and persist the Story Network for a project. Idempotent-ish: skips
 * char↔char pairs and graph edges that already exist. Returns counts.
 */
export async function generateRelationships({
  projectId,
  characters,
  locations,
  plotThreads,
  synopsis,
  genre,
  tone,
  signal
}) {
  if (!projectId) throw new Error('generateRelationships requires a projectId')
  if (!characters || characters.length < 2) {
    return { characterRelationships: 0, graphEdges: 0, dropped: 0, reason: 'too_few_characters' }
  }

  // A single structured call on a small local model frequently comes back empty
  // ("no meaningful connections"). Retry once before giving up so the Story
  // Network isn't silently empty on a transient miss.
  const MAX_ATTEMPTS = 2
  const userPrompt = buildUserPrompt({ characters, locations, plotThreads, synopsis, genre, tone })
  let aiResult = null
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    aiResult = await aiGenerateJson(userPrompt, SYSTEM_PROMPT, {
      feature: FEATURES.NETWORK,
      temperature: 0.5,
      schema: RELATIONSHIP_SCHEMA,
      schemaName: 'story_network',
      signal
    }).catch((err) => {
      console.warn(`[generateRelationships] attempt ${attempt} failed:`, err)
      return null
    })
    if (countAiConnections(aiResult) > 0) break
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[generateRelationships] attempt ${attempt} returned no connections; retrying.`)
    }
  }

  if (!aiResult)
    return { characterRelationships: 0, graphEdges: 0, dropped: 0, reason: 'ai_failed' }

  const aiTotal = countAiConnections(aiResult)
  const { characterRelationships, graphEdges, dropped } = buildRelationshipEdges(aiResult, {
    characters,
    locations,
    plotThreads
  })

  // Dedupe against what already exists so re-running the stage doesn't pile up.
  const existingRels = await getCharacterRelationships(projectId)
  const existingRelKeys = new Set(
    existingRels.map((r) => [r.fromCharacterId, r.toCharacterId].sort((a, b) => a - b).join('|'))
  )
  const freshRels = characterRelationships.filter(
    (r) =>
      !existingRelKeys.has([r.fromCharacterId, r.toCharacterId].sort((a, b) => a - b).join('|'))
  )

  const existingEdges = await getGraphEdges(projectId)
  const existingEdgeKeys = new Set(
    existingEdges.map((e) => `${e.sourceType}:${e.sourceId}|${e.targetType}:${e.targetId}`)
  )
  const freshEdges = graphEdges.filter(
    (e) => !existingEdgeKeys.has(`${e.sourceType}:${e.sourceId}|${e.targetType}:${e.targetId}`)
  )

  if (freshRels.length) await addCharacterRelationshipsBatch(projectId, freshRels)
  if (freshEdges.length) await addGraphEdgesBatch(projectId, freshEdges)

  // Explain a zero result so the UI/console can distinguish "model said nothing",
  // "names didn't match the cast", and "everything already existed".
  let reason = 'ok'
  if (aiTotal === 0) {
    reason = 'ai_empty'
  } else if (freshRels.length === 0 && freshEdges.length === 0) {
    reason = dropped.length > 0 ? 'all_dropped' : 'all_duplicate'
  }

  return {
    characterRelationships: freshRels.length,
    graphEdges: freshEdges.length,
    dropped: dropped.length,
    reason
  }
}
