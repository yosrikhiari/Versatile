/**
 * The entity-state timeline: what was true of each entity, at each point in the story.
 *
 * The `entityStates` table has existed since schema v45, documented as "tracks
 * entity state changes per scene for contradiction detection" — with a compound
 * index, three accessors and a test, and no writer. Nothing has ever put a row
 * in it. Downstream, `checkDeadThenAlive` takes an `EntityState[]`, opens a loop
 * over it with an empty body and the comment "This would come from scene digest
 * analysis", and returns nothing; it isn't even registered in the rule list. The
 * two rules that need a time axis were the two left as stubs, while the four
 * that shipped each re-derive their own ordering from raw digest text.
 *
 * This is the missing writer. It is also the story's only real time axis: the
 * Timeline view orders plot threads by a hand-dragged integer, and the graph
 * carries no time at all, so a relationship reversal in chapter 30 is currently
 * indistinguishable from a contradiction — and gets dropped as a duplicate of
 * whatever chapter 1 established.
 *
 * Two properties inherited deliberately from `sceneDigest`, for the same reasons:
 *
 *   1. **No LLM call.** Everything is read off facts the writer already emitted
 *      or matched by rule. A state layer costing a model call per scene would
 *      reintroduce the problem the digest layer exists to solve.
 *   2. **Pure and total.** Any shape of digest yields a valid (possibly empty)
 *      result. This runs on the commit path, and must never be the thing that
 *      loses a scene.
 */

import { hashContent } from './sceneDigest'

/** Bumped when derivation changes meaning, so stale rows recompute. */
export const ENTITY_STATE_VERSION = 1

export type EntityStateType = 'character' | 'location' | 'object' | 'plotThread'
export type CharacterStatus = 'unknown' | 'alive' | 'injured' | 'dead'
export type ObjectCondition = 'unknown' | 'intact' | 'damaged' | 'destroyed' | 'lost'

export interface EntityStateFlags {
  /** Did this entity actually appear in the scene, or is it only referenced? */
  present: boolean
  status: CharacterStatus
  condition: ObjectCondition
  /** Where the entity was, by name. Null when the scene declares no location. */
  location: string | null
  /** Physical description asserted here — `eye_color`, `hair_color`, `body_type`. */
  attributes: Record<string, string>
  /** Normalised topics this entity learned in this scene. */
  knows: string[]
}

export interface EntityStateRecord {
  projectId: string
  entityType: EntityStateType
  /**
   * Stable identity key.
   *
   * The bible id as a string when the name resolves, else `~<normalised name>`.
   * Objects almost never have a bible record, so a name-derived key is the only
   * way a rule can follow one across scenes — but a resolved character must key
   * on its id, or renaming the character in the bible silently splits its
   * timeline in two.
   */
  entityId: string
  entityName: string
  sceneId: string
  sceneNumber: number | null
  chapterNumber: number | null
  state: EntityStateFlags
  /** The facts this state was read from — the evidence a contradiction cites. */
  sourceFacts: string[]
  stateHash: string
  version: number
  updatedAt: string
}

// Rule families. Deliberately narrow: a false positive here becomes a
// contradiction reported against the author's own manuscript, which costs more
// trust than a missed one costs coverage.
const DEATH =
  /\b(dies|died|dying|dead|killed|kills|slain|slays|murdered|perished|perishes|executed|beheaded|fatally|corpse|body of)\b/i
const REVIVAL =
  /\b(resurrect\w*|revived?|revives|reborn|alive again|back from the dead|returns? from the dead|survived|survives)\b/i
const INJURY =
  /\b(wounded|wounds|injured|injures|hurt|stabbed|stabs|shot|shoots|maimed|crippled|bleeding|bloodied|beaten)\b/i
const HEALED = /\b(healed|heals|recovered|recovers|mended|patched up|back on (?:his|her|their) feet)\b/i
const DESTRUCTION =
  /\b(destroyed|destroys|shattered|shatters|burned|burnt|burns|smashed|smashes|ruined|ruins|obliterated|melted)\b/i
const DAMAGE = /\b(cracked|chipped|dented|damaged|bent|frayed|scorched)\b/i
const LOSS = /\b(lost|loses|stolen|steals|taken|missing|misplaced|vanished|disappeared)\b/i
const RECOVERY = /\b(recovered|recovers|found|finds|retrieved|retrieves|repaired|restored|reforged)\b/i
const KNOWLEDGE =
  /\b(?:learns?|learned|learnt|discovers?|discovered|realis[ez]es?|realis[ez]ed|finds? out|found out|is told|was told|uncovers?|uncovered)\b/i

/**
 * Negation suppresses an assertion rather than inverting it.
 *
 * "Kael is not dead" could reasonably be read as alive, but "the blade is not
 * destroyed" says nothing about whether it is intact or merely lost, and
 * "Mira never learned the truth" is the opposite of a knowledge event. One rule
 * that declines to assert beats three rules that each guess differently — and a
 * missed state costs a missed contradiction, while an inverted one manufactures
 * a false one.
 */
const NEGATION = /\b(?:not|never|no longer|nor|without|isn't|wasn't|aren't|weren't|didn't|doesn't|don't|hasn't|haven't|hadn't|can't|couldn't|refuses? to|fails? to)\b/i

// Clause splitting, so "Kael survives but the blade is destroyed" attributes
// each half to the right entity. Without it, one negation or one verb anywhere
// in a compound fact contaminates every entity named in it.
const CLAUSE_SPLIT = /\s*(?:[;,]|\bbut\b|\byet\b|\bwhile\b|\bwhereas\b|\balthough\b|\bthough\b|\bhowever\b)\s*/i

const ATTRIBUTE_PATTERNS: Array<{ key: string; re: RegExp }> = [
  { key: 'eye_color', re: /\b(?:has|had|with)\s+(blue|brown|green|hazel|grey|gray|amber|black)\s+eyes?\b/i },
  {
    key: 'hair_color',
    re: /\b(?:has|had|with)\s+(blonde|blond|brown|black|red|auburn|silver|white|grey|gray)\s+hair\b/i
  },
  { key: 'body_type', re: /\b(?:is|was)\s+(tall|short|muscular|slender|stocky|wiry|heavyset|frail)\b/i }
]

/** Case- and punctuation-insensitive name key. Matches `normalizeName` elsewhere. */
export function normalizeEntityName(name: any): string {
  return typeof name === 'string' ? name.trim().toLowerCase() : ''
}

/**
 * Identity key for a state row. Resolved bible id when known, name-derived key
 * otherwise — see the note on `EntityStateRecord.entityId`.
 */
export function entityKeyFor(name: any, resolvedId: string | number | null | undefined): string {
  if (resolvedId !== null && resolvedId !== undefined && String(resolvedId) !== '') {
    return String(resolvedId)
  }
  return `~${normalizeEntityName(name)}`
}

/** Does this text name the entity? Word-boundary matched so "Kae" never hits "Kael". */
function mentions(text: string, name: string): boolean {
  const n = normalizeEntityName(name)
  if (!n) return false
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)
}

/** The clauses of a fact that name this entity, so a compound fact splits cleanly. */
function clausesMentioning(fact: string, name: string): string[] {
  const clauses = String(fact).split(CLAUSE_SPLIT).filter(Boolean)
  const hits = clauses.filter((c) => mentions(c, name))
  // A pronoun-only follow-up clause ("Kael reaches the tower, then he dies")
  // names nobody. When exactly one entity is named anywhere in the fact, the
  // whole fact is unambiguously about it and splitting only loses information.
  if (hits.length === 0 && mentions(fact, name)) return [fact]
  return hits
}

function emptyFlags(): EntityStateFlags {
  return { present: false, status: 'unknown', condition: 'unknown', location: null, attributes: {}, knows: [] }
}

/** Everything after the knowledge verb, trimmed to a comparable topic key. */
function knowledgeTopic(clause: string): string | null {
  const m = clause.match(KNOWLEDGE)
  if (!m || m.index === undefined) return null
  const rest = clause
    .slice(m.index + m[0].length)
    .replace(/^\s*(?:that|about|of|the)\s+/i, '')
    .replace(/[.!?]+\s*$/, '')
    .trim()
  // A bare "Kael learns." carries no topic to compare against anything.
  return rest.length >= 4 ? rest.toLowerCase() : null
}

/**
 * Read one entity's state out of the facts of a single scene.
 *
 * Later facts win within a scene: a scene where a character is wounded and then
 * dies ends with them dead, and the ordering of `keyFacts` is the only sequence
 * information a digest carries.
 */
export function readEntityState(
  facts: string[],
  name: string,
  opts: { present: boolean; location: string | null; type: EntityStateType }
): { state: EntityStateFlags; sourceFacts: string[] } {
  const state = emptyFlags()
  state.present = opts.present
  state.location = opts.location
  if (opts.type === 'character' && opts.present) state.status = 'alive'
  if (opts.type === 'object') state.condition = 'intact'

  const sourceFacts: string[] = []
  const seenKnows = new Set<string>()

  for (const rawFact of facts) {
    const fact = String(rawFact || '')
    if (!fact.trim()) continue

    let used = false
    for (const clause of clausesMentioning(fact, name)) {
      // See the note on NEGATION: a negated clause asserts nothing.
      if (NEGATION.test(clause)) continue

      if (opts.type === 'character') {
        // Revival is checked before death so "returns from the dead" — which
        // contains "dead" — doesn't register as a death.
        if (REVIVAL.test(clause)) {
          state.status = 'alive'
          used = true
        } else if (DEATH.test(clause)) {
          state.status = 'dead'
          used = true
        } else if (HEALED.test(clause)) {
          state.status = 'alive'
          used = true
        } else if (INJURY.test(clause)) {
          state.status = 'injured'
          used = true
        }

        for (const { key, re } of ATTRIBUTE_PATTERNS) {
          const m = clause.match(re)
          if (m) {
            state.attributes[key] = m[1].toLowerCase()
            used = true
          }
        }

        if (KNOWLEDGE.test(clause)) {
          const topic = knowledgeTopic(clause)
          if (topic && !seenKnows.has(topic)) {
            seenKnows.add(topic)
            state.knows.push(topic)
            used = true
          }
        }
      }

      if (opts.type === 'object') {
        if (RECOVERY.test(clause)) {
          state.condition = 'intact'
          used = true
        } else if (DESTRUCTION.test(clause)) {
          state.condition = 'destroyed'
          used = true
        } else if (LOSS.test(clause)) {
          state.condition = 'lost'
          used = true
        } else if (DAMAGE.test(clause)) {
          state.condition = 'damaged'
          used = true
        }
      }
    }

    if (used) sourceFacts.push(fact)
  }

  return { state, sourceFacts }
}

/** Stable, order-independent hash of a state — the invalidation key for a row. */
export function hashState(state: EntityStateFlags): string {
  const canonical = JSON.stringify({
    present: state.present,
    status: state.status,
    condition: state.condition,
    location: state.location,
    attributes: Object.keys(state.attributes)
      .sort()
      .map((k) => [k, state.attributes[k]]),
    knows: [...state.knows].sort()
  })
  return hashContent(canonical)
}

function stringList(value: any): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of value) {
    const s = typeof v === 'string' ? v.trim() : String(v?.name || v?.title || '').trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}

/**
 * Derive every entity-state row for one scene.
 *
 * `resolve` maps a declared name to its story-bible id, or null when the entity
 * has no bible record. It is injected rather than imported so this module stays
 * pure — it runs inside the commit path and inside tests with no store at all.
 *
 * Object names come only from what the writer declared in `facts.objects`. The
 * previous ad-hoc approach split destruction facts on whitespace and treated
 * every word over three characters as an object name, which turned "the tower
 * was destroyed by fire" into objects named `tower`, `destroyed` and `fire`.
 */
export function deriveEntityStates({
  projectId,
  digest,
  resolve,
  now
}: {
  projectId: string
  digest: any
  resolve?: (type: EntityStateType, name: string) => string | number | null | undefined
  /** Injected so callers can keep derivation deterministic in tests. */
  now?: string
}): EntityStateRecord[] {
  const sceneId = digest?.subsectionId ?? digest?.sceneId
  if (!projectId || !sceneId) return []

  const chapterNumber = typeof digest.chapterNumber === 'number' ? digest.chapterNumber : null
  const sceneNumber = typeof digest.sceneNumber === 'number' ? digest.sceneNumber : null
  const location = String(digest.location || '') || null
  const updatedAt = now || new Date().toISOString()

  // `keyFacts` is the durable-canon carrier; the summary is one sentence of
  // what happened. Both are prose the rules can read, and a death is at least as
  // likely to be stated in the summary as listed as a fact.
  const facts = [...stringList(digest.keyFacts), ...stringList(digest.facts?.events)]
  if (typeof digest.summary === 'string' && digest.summary.trim()) facts.push(digest.summary.trim())

  const rows: EntityStateRecord[] = []
  const emit = (type: EntityStateType, name: string, present: boolean) => {
    const { state, sourceFacts } = readEntityState(facts, name, {
      present,
      location: type === 'character' ? location : null,
      type
    })
    // A row that asserts nothing is noise in the timeline and a wasted index
    // entry. Presence alone is worth recording — it is what the location rule
    // and the candidate-pair generator run on.
    const assertsSomething =
      present ||
      state.status !== 'unknown' ||
      state.condition !== 'unknown' ||
      state.knows.length > 0 ||
      Object.keys(state.attributes).length > 0
    if (!assertsSomething) return

    rows.push({
      projectId,
      entityType: type,
      entityId: entityKeyFor(name, resolve?.(type, name)),
      entityName: name,
      sceneId: String(sceneId),
      sceneNumber,
      chapterNumber,
      state,
      sourceFacts,
      stateHash: hashState(state),
      version: ENTITY_STATE_VERSION,
      updatedAt
    })
  }

  for (const name of stringList(digest.charactersPresent)) emit('character', name, true)

  // Characters named in the facts but not on stage still have state — a death
  // reported offscreen is exactly the fact a later scene contradicts.
  const present = new Set(stringList(digest.charactersPresent).map(normalizeEntityName))
  for (const name of stringList(digest.facts?.characters)) {
    if (!present.has(normalizeEntityName(name))) emit('character', name, false)
  }

  for (const name of stringList(digest.facts?.objects)) emit('object', name, false)

  if (location) emit('location', location, true)

  return rows
}

/**
 * Story order for two state rows.
 *
 * Chapter first, then scene. A manuscript mid-migration can carry rows with no
 * chapter number at all, and those still order correctly among themselves by
 * scene — which is what makes this safe to run over a backfill.
 */
export function compareStatePosition(a: EntityStateRecord, b: EntityStateRecord): number {
  const ac = a.chapterNumber ?? 0
  const bc = b.chapterNumber ?? 0
  if (ac !== bc) return ac - bc
  return (a.sceneNumber ?? 0) - (b.sceneNumber ?? 0)
}

/** Group rows by entity, each group in story order — the shape every rule wants. */
export function indexStatesByEntity(
  states: EntityStateRecord[]
): Map<string, EntityStateRecord[]> {
  const byEntity = new Map<string, EntityStateRecord[]>()
  for (const s of states) {
    const key = `${s.entityType}:${s.entityId}`
    const list = byEntity.get(key)
    if (list) list.push(s)
    else byEntity.set(key, [s])
  }
  for (const list of byEntity.values()) list.sort(compareStatePosition)
  return byEntity
}
