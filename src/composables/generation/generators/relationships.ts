import { aiGenerateJson } from '../../useAiService'
import { FEATURES } from '../../../config/ai'
import {
  addCharacterRelationshipsBatch,
  addGraphEdgesBatch,
  getGraphEdges,
  getCharacterRelationships,
  updateCharacterRelationship,
  updateGraphEdge
} from '../../../services/dbService'
import { planEdgeWrites, type TemporalEdge } from '../../../services/generation/edgeTimeline'

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

/** Rough output cost of one connection object, measured against the schema above. */
const TOKENS_PER_CONNECTION = 45

/**
 * Size the schema to the cast.
 *
 * The unbounded version let the grammar satisfy itself with an empty
 * `characterRelationships` array — which, combined with a prompt that invited
 * omission, is why the Story Network came back with "no connections" and burned
 * a retry doing it again. `minItems: 1` makes emptiness structurally
 * unrepresentable; it is always satisfiable because the caller returns early
 * below two characters. The `maxItems` caps stop a grammar-constrained model
 * from enumerating every possible pair until it runs out of budget.
 */
function makeRelationshipSchema({
  characterNames = [],
  locationNames = [],
  threadTitles = []
}: {
  characterNames?: string[]
  locationNames?: string[]
  threadTitles?: string[]
}) {
  const characterCount = characterNames.length
  const locationCount = locationNames.length
  const threadCount = threadTitles.length
  const pairs = Math.max(1, Math.floor((characterCount * (characterCount - 1)) / 2))
  const props: any = RELATIONSHIP_SCHEMA.properties

  // Pin every name field to the committed cast.
  //
  // A free-string name field lets the model answer the wrong question in the
  // right shape. Observed on phi4-mini, which put the RELATIONSHIP into the name
  // slot: `"location": "Avoids The Pier, frequents Marine Research Facility (not
  // listed)"` and `"plotThread": "Both: Who moved the boat, The dying reef"`.
  // Both parsed fine and both were then silently dropped for not matching an
  // entity. An enum makes the grammar itself reject anything that is not an
  // exact existing name, so the failure cannot be produced in the first place.
  const enumOf = (values: string[]) => ({ type: 'string', enum: values })

  const properties: any = {
    characterRelationships: {
      ...props.characterRelationships,
      minItems: 1,
      maxItems: Math.min(40, pairs),
      items: {
        ...props.characterRelationships.items,
        properties: {
          ...props.characterRelationships.items.properties,
          from: enumOf(characterNames),
          to: enumOf(characterNames)
        }
      }
    }
  }

  // Arrays whose entity list is empty are omitted entirely: an `enum: []` is
  // unsatisfiable, and asking for links to things that do not exist is how
  // invented names get in.
  if (locationCount) {
    properties.characterLocations = {
      ...props.characterLocations,
      minItems: 1,
      maxItems: Math.min(40, characterCount * locationCount),
      items: {
        ...props.characterLocations.items,
        properties: {
          ...props.characterLocations.items.properties,
          character: enumOf(characterNames),
          location: enumOf(locationNames)
        }
      }
    }
  }

  if (threadCount) {
    properties.characterPlotThreads = {
      ...props.characterPlotThreads,
      minItems: 1,
      maxItems: Math.min(40, characterCount * threadCount),
      items: {
        ...props.characterPlotThreads.items,
        properties: {
          ...props.characterPlotThreads.items.properties,
          character: enumOf(characterNames),
          plotThread: enumOf(threadTitles)
        }
      }
    }
  }

  if (threadCount > 1) {
    properties.plotThreadLinks = {
      ...props.plotThreadLinks,
      minItems: 1,
      maxItems: Math.min(20, threadCount * (threadCount - 1)),
      items: {
        ...props.plotThreadLinks.items,
        properties: {
          ...props.plotThreadLinks.items.properties,
          from: enumOf(threadTitles),
          to: enumOf(threadTitles)
        }
      }
    }
  }

  // Every category present in `properties` is required.
  //
  // Previously only `characterRelationships` was required, so a model could
  // satisfy the grammar with character↔character links alone and stop — leaving
  // every location and plot thread sitting on the canvas with no edges. A
  // category is added to `properties` above only when its entities actually
  // exist, so requiring all of them never asks for links to nothing.
  return { ...RELATIONSHIP_SCHEMA, properties, required: Object.keys(properties) }
}

// Categories the schema asked for that came back empty. Coverage is checked per
// category rather than by a single total: a response carrying only
// character↔character links passes a `countAiConnections > 0` gate while leaving
// locations and plot threads orphaned.
export function missingCategories(aiResult: any, expected: string[]) {
  if (!aiResult) return [...expected]
  return expected.filter((key) => !(aiResult[key]?.length > 0))
}

export function estimateRelationshipTokens({
  characterCount,
  locationCount,
  threadCount
}: {
  characterCount: number
  locationCount: number
  threadCount: number
}) {
  const pairs = Math.max(1, Math.floor((characterCount * (characterCount - 1)) / 2))
  const connections =
    Math.min(40, pairs) +
    Math.min(40, characterCount * locationCount) +
    Math.min(40, characterCount * threadCount) +
    Math.min(20, threadCount * Math.max(0, threadCount - 1))
  return Math.min(8192, Math.max(1024, connections * TOKENS_PER_CONNECTION))
}

export { makeRelationshipSchema }

const SYSTEM_PROMPT = `You are a story-structure architect mapping the relationship network of a cast that already exists.

You are given the exact characters, locations, and plot threads. Use ONLY these names — never invent new entities. Produce the connections between them:
- characterRelationships: how characters relate to each other (ally, rival, family, mentor, romantic, enemy, colleague, ...). EVERY character must appear in at least one relationship. Characters in the same story always relate somehow — if a dynamic is not obvious, infer the most plausible one from their roles and goals.
- characterLocations: which characters are bound to which locations (home, frequents, avoids, imprisoned, rules, ...).
- characterPlotThreads: which characters drive, obstruct, or are affected by which plot threads (driver, obstacle, affected, catalyst, ...).
- plotThreadLinks: how plot threads relate (depends_on, parallels, resolves, complicates, ...).

Return ONLY JSON matching the requested shape. Every array present in the requested shape must be non-empty: you are only asked for a category when the story actually contains those entities, and entities that exist always connect to the story somehow. Every location and every plot thread must appear in at least one connection — if a link is not obvious, infer the most plausible one from the roles, goals, and descriptions you were given.`

function normalizeName(name: any) {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

function buildNameMap(items: any, nameField: any) {
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
export function buildRelationshipEdges(aiResult: any, { characters, locations, plotThreads }: { characters: any; locations: any; plotThreads: any }) {
  const charMap = buildNameMap(characters, 'name')
  const locMap = buildNameMap(locations, 'name')
  const threadMap = buildNameMap(plotThreads, 'title')

  const characterRelationships = []
  const graphEdges: any[] = []
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

  const pushEdge = (sourceId: any, sourceType: any, targetId: any, targetType: any, relationshipType: any, description: any) => {
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
export function countAiConnections(aiResult: any) {
  if (!aiResult) return 0
  return (
    (aiResult.characterRelationships?.length || 0) +
    (aiResult.characterLocations?.length || 0) +
    (aiResult.characterPlotThreads?.length || 0) +
    (aiResult.plotThreadLinks?.length || 0)
  )
}

function buildUserPrompt({ characters, locations, plotThreads, synopsis, genre, tone }: { characters: any; locations: any; plotThreads: any; synopsis: any; genre: any; tone: any }) {
  const payload = {
    synopsis: synopsis || '',
    genre: genre || '',
    tone: tone || '',
    characters: (characters || []).map((c: any) => ({ name: c.name, role: c.role, goal: c.goal })),
    locations: (locations || []).map((l: any) => ({ name: l.name, description: l.description })),
    plotThreads: (plotThreads || []).map((t: any) => ({ title: t.title, notes: t.notes }))
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
  signal,
  onProgress,
  atChapter,
  runId,
  volumeId,
  seedOnly = false
}: {
  projectId: any
  characters: any
  locations: any
  plotThreads: any
  synopsis: any
  genre: any
  tone: any
  signal: any
  /**
   * The chapter these relationships describe. Defaults to 1 — the opening weave
   * runs before any prose exists, so what it maps is the story's starting state,
   * not a timeless truth. Later weaves pass the chapter they are reading from,
   * which is what lets a reversal supersede an earlier claim instead of being
   * discarded as a duplicate of it.
   */
  atChapter?: number | null
  /** Which generation asserted this, so a bad run can be identified afterwards. */
  runId?: string | null
  volumeId?: string | null
  /**
   * Lay the base only if there isn't one. With this set, a project that already
   * has a network is left alone and no model call is made at all — the network
   * grows from chapters after that, not from re-guessing the synopsis.
   */
  seedOnly?: boolean
  /**
   * Called as tokens arrive. This stage is one long structured call with no
   * intermediate units of work, so the token stream is the only progress a stage
   * watchdog can observe — without it the caller has to guess a wall-clock budget
   * for the whole call, and every guess so far has been shorter than the call.
   */
  onProgress?: () => void
}) {
  if (!projectId) throw new Error('generateRelationships requires a projectId')
  if (!characters || characters.length < 2) {
    return { characterRelationships: 0, graphEdges: 0, dropped: 0, reason: 'too_few_characters' }
  }

  // The base is laid once.
  //
  // This stage used to re-derive the entire project's network on every run, from
  // the synopsis, at temperature 0.5, with no memory of what it had decided
  // before — so a second volume re-answered a question the first had already
  // answered, differently, and the differences were then discarded by the dedupe
  // as duplicates. What the story needs from this stage is a starting state; what
  // happens after that is established by chapters as they are written, which
  // `commitSync` records against the chapter it happened in.
  if (seedOnly) {
    const already = await getGraphEdges(projectId).catch(() => [])
    const alreadyRels = await getCharacterRelationships(projectId).catch(() => [])
    if (already.length > 0 || alreadyRels.length > 0) {
      return {
        characterRelationships: 0,
        graphEdges: 0,
        dropped: 0,
        superseded: 0,
        unorderable: 0,
        atChapter: atChapter ?? 1,
        reason: 'already_seeded'
      }
    }
  }

  // A single structured call on a small local model frequently comes back empty
  // ("no meaningful connections"), or covers only the character↔character
  // category. Retry once before giving up so the Story Network isn't silently
  // empty — or silently missing every location and plot thread — on a transient
  // miss. Capped at 2 because this stage is one long call on a local model.
  const MAX_ATTEMPTS = 2
  const userPrompt = buildUserPrompt({ characters, locations, plotThreads, synopsis, genre, tone })
  const characterNames = characters.map((c: any) => c.name).filter(Boolean)
  const locationNames = (locations || []).map((l: any) => l.name).filter(Boolean)
  const threadTitles = (plotThreads || []).map((t: any) => t.title).filter(Boolean)
  const schema = makeRelationshipSchema({ characterNames, locationNames, threadTitles })
  const maxTokens = estimateRelationshipTokens({
    characterCount: characterNames.length,
    locationCount: locationNames.length,
    threadCount: threadTitles.length
  })
  const expectedCategories = Object.keys((schema as any).properties)
  let aiResult = null
  let bestMissing: string[] | null = null
  // Signal that prompt evaluation has started so the stage watchdog knows
  // the call is alive even during the silent first-token phase.
  onProgress?.()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const candidate = await aiGenerateJson(userPrompt, SYSTEM_PROMPT, {
      feature: FEATURES.NETWORK,
      temperature: 0.5,
      schema,
      maxTokens,
      schemaName: 'story_network',
      role: 'utility',
      signal,
      onToken: onProgress,
      // Match network stage's 7-min idle timeout (STAGE_IDLE_TIMEOUT_MS.network = 420_000).
      // Provider's first-token timeout must exceed stage timeout to avoid premature kill.
      firstTokenTimeout: 480_000,
      idleTimeout: 420_000
    }).catch((err) => {
      console.warn(`[generateRelationships] attempt ${attempt} failed:`, err as any)
      return null
    })
    const missing = missingCategories(candidate, expectedCategories)
    // Keep the most complete attempt. A retry that comes back thinner than the
    // first must not overwrite it.
    if (candidate && (bestMissing === null || missing.length < bestMissing.length)) {
      aiResult = candidate
      bestMissing = missing
    }
    if (bestMissing?.length === 0) break
    // The retry exists for a model that came back empty, not for a caller that
    // has given up. Swallowing the abort here and firing a second call is how a
    // cancelled stage went on issuing requests to a provider it no longer owned.
    if (signal?.aborted) break
    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `[generateRelationships] attempt ${attempt} returned no ${missing.join(', ')}; retrying.`
      )
    }
  }

  if (signal?.aborted) {
    const err = new Error('Story Network generation cancelled')
    err.name = 'AbortError'
    throw err
  }

  if (!aiResult)
    return { characterRelationships: 0, graphEdges: 0, dropped: 0, reason: 'ai_failed' }

  const aiTotal = countAiConnections(aiResult)
  const { characterRelationships, graphEdges, dropped } = buildRelationshipEdges(aiResult, {
    characters,
    locations,
    plotThreads
  })

  // Place these claims in time, and reconcile them against what the graph
  // already asserts. `planEdgeWrites` replaces a dedupe that keyed on the
  // endpoint pair alone — under which "allies" and "enemies" were the same row,
  // so the second one was discarded as a duplicate no matter how many chapters
  // apart they were meant to be true.
  const existingRels = await getCharacterRelationships(projectId)
  // char↔char lives in its own typed, backend-synced table, so it is planned
  // separately — but against the same window rules, from the same code.
  const existingRelEdges: TemporalEdge[] = existingRels.map((r: any) => ({
    id: r.id,
    sourceId: String(r.fromCharacterId),
    sourceType: 'character',
    targetId: String(r.toCharacterId),
    targetType: 'character',
    relationshipType: r.type || 'connected',
    validFromChapter: r.validFromChapter ?? null,
    validUntilChapter: r.validUntilChapter ?? null
  }))

  const relPlan = planEdgeWrites({
    existing: existingRelEdges,
    proposed: characterRelationships.map((r) => ({
      ...r,
      sourceId: String(r.fromCharacterId),
      sourceType: 'character',
      targetId: String(r.toCharacterId),
      targetType: 'character',
      relationshipType: r.type
    })),
    atChapter,
    runId,
    volumeId
  })

  const edgePlan = planEdgeWrites({
    existing: (await getGraphEdges(projectId)) as TemporalEdge[],
    proposed: graphEdges,
    atChapter,
    runId,
    volumeId
  })

  // Close superseded claims BEFORE opening the ones that replace them, so the
  // graph is never briefly asserting both sides of a reversal at once.
  for (const s of [...relPlan.supersedes]) {
    await updateCharacterRelationship(s.id, { validUntilChapter: s.validUntilChapter }).catch(
      (err: any) => console.warn('[generateRelationships] could not close relationship:', err)
    )
  }
  for (const s of edgePlan.supersedes) {
    await updateGraphEdge(s.id, { validUntilChapter: s.validUntilChapter }).catch((err: any) =>
      console.warn('[generateRelationships] could not close edge:', err)
    )
  }

  const freshRels = relPlan.inserts.map((r: any) => ({
    fromCharacterId: r.fromCharacterId,
    toCharacterId: r.toCharacterId,
    type: r.type,
    notes: r.notes,
    validFromChapter: r.validFromChapter,
    validUntilChapter: r.validUntilChapter,
    runId: r.runId
  }))

  if (freshRels.length) await addCharacterRelationshipsBatch(projectId, freshRels)
  if (edgePlan.inserts.length) await addGraphEdgesBatch(projectId, edgePlan.inserts)

  const superseded = relPlan.supersedes.length + edgePlan.supersedes.length
  const unorderable = relPlan.unorderable.length + edgePlan.unorderable.length

  // Explain a zero result so the UI/console can distinguish "model said nothing",
  // "names didn't match the cast", and "everything already existed".
  let reason = 'ok'
  if (aiTotal === 0) {
    reason = 'ai_empty'
  } else if (freshRels.length === 0 && edgePlan.inserts.length === 0) {
    if (dropped.length > 0) reason = 'all_dropped'
    else if (unorderable > 0) reason = 'all_unorderable'
    else reason = 'all_duplicate'
  }

  return {
    characterRelationships: freshRels.length,
    graphEdges: edgePlan.inserts.length,
    dropped: dropped.length,
    superseded,
    unorderable,
    atChapter: atChapter ?? 1,
    reason
  }
}
