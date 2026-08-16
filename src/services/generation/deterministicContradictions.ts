/**
 * Deterministic contradiction rules — zero LLM calls.
 *
 * These run over the entity-state timeline (`generation/entityStates`), which is
 * the derived, chapter-indexed record of what was true of each entity at each
 * point in the story. Before that layer had a writer, each rule here re-derived
 * its own ad-hoc ordering by regexing raw digest summaries — and the two rules
 * that genuinely needed a time axis (`checkDeadThenAlive`, knowledge ordering)
 * were left as empty stubs that returned nothing and were never registered.
 *
 * The precision bias is deliberate throughout. Every finding is shown to an
 * author against their own manuscript, so a false positive costs more trust than
 * a missed one costs coverage. Rules assert only what the state layer states.
 */

import type { EntityStateRecord } from './entityStates'
import { compareStatePosition, indexStatesByEntity } from './entityStates'

export interface DeterministicContradiction {
  type:
    | 'dead_then_alive'
    | 'object_destroyed_then_used'
    | 'timeline_inversion'
    | 'appearance_change'
    | 'location_impossible'
    | 'knowledge_relearned'
    | 'seam_disconnect'
  severity: 'error' | 'warning'
  entityType: string
  entityId: string
  entityName?: string
  sceneIds: string[]
  description: string
  /** The digest facts the finding rests on, so an author can judge it directly. */
  evidence?: string[]
}

/** How close two scenes must be for a location change to be impossible rather than travel. */
const IMPOSSIBLE_TRAVEL_WINDOW = 2

/** Human label for a scene position, preferring chapter/scene over an opaque id. */
function positionLabel(s: EntityStateRecord): string {
  if (s.chapterNumber != null && s.sceneNumber != null) {
    return `chapter ${s.chapterNumber}, scene ${s.sceneNumber}`
  }
  if (s.chapterNumber != null) return `chapter ${s.chapterNumber}`
  if (s.sceneNumber != null) return `scene ${s.sceneNumber}`
  return 'an earlier scene'
}

/**
 * Ordinal distance between scenes, in story order.
 *
 * Built from the states themselves rather than from scene numbers, so it stays
 * correct when a manuscript carries scenes with no numbering at all — which a
 * backfilled project does.
 */
function buildPositionIndex(states: EntityStateRecord[]): Map<string, number> {
  const bySceneFirst = new Map<string, EntityStateRecord>()
  for (const s of states) {
    if (!bySceneFirst.has(s.sceneId)) bySceneFirst.set(s.sceneId, s)
  }
  const ordered = [...bySceneFirst.values()].sort(compareStatePosition)
  const index = new Map<string, number>()
  ordered.forEach((s, i) => index.set(s.sceneId, i))
  return index
}

/**
 * Rule 1: dead-then-alive — a character established dead, alive or present again later.
 *
 * The rule the table was designed for and the one that was never implemented.
 * Reported as an error with its evidence attached: a flashback is the one benign
 * reading, and nothing in the state layer can distinguish one, so the author is
 * given the two facts and the two positions rather than a verdict they can't check.
 */
export function checkDeadThenAlive(states: EntityStateRecord[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []

  for (const [key, timeline] of indexStatesByEntity(states)) {
    if (!key.startsWith('character:')) continue

    let death: EntityStateRecord | null = null
    for (const s of timeline) {
      if (s.state.status === 'dead') {
        death = s
        continue
      }
      if (!death) continue
      // Revival is a legitimate story event and the derivation records it as
      // such; only an unexplained reappearance is a contradiction.
      const revived = s.state.status === 'alive' && s.sourceFacts.length > 0
      if (revived) {
        death = null
        continue
      }
      if (s.state.present) {
        out.push({
          type: 'dead_then_alive',
          severity: 'error',
          entityType: 'character',
          entityId: s.entityId,
          entityName: s.entityName,
          sceneIds: [death.sceneId, s.sceneId],
          description: `"${s.entityName}" is established dead in ${positionLabel(death)} but appears again in ${positionLabel(s)}.`,
          evidence: [...death.sourceFacts, ...s.sourceFacts]
        })
        // One report per character per death. Every later scene they appear in
        // restates the same problem, and thirty copies of it is not thirty findings.
        death = null
      }
    }
  }

  return out
}

/**
 * Rule 2: object destroyed-then-used — an object destroyed or lost, then intact again.
 *
 * The previous implementation split every destruction fact on whitespace and
 * treated each word over three characters as an object name, so "the tower was
 * destroyed by fire" registered objects called `tower`, `destroyed` and `fire`.
 * Object identity now comes from what the writer actually declared.
 */
export function checkObjectDestroyedThenUsed(
  states: EntityStateRecord[]
): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []

  for (const [key, timeline] of indexStatesByEntity(states)) {
    if (!key.startsWith('object:')) continue

    let gone: EntityStateRecord | null = null
    for (const s of timeline) {
      if (s.state.condition === 'destroyed' || s.state.condition === 'lost') {
        gone = s
        continue
      }
      if (!gone) continue
      if (s.state.condition === 'intact' && s.sourceFacts.length > 0) {
        const verb = gone.state.condition === 'lost' ? 'lost' : 'destroyed'
        out.push({
          type: 'object_destroyed_then_used',
          severity: 'error',
          entityType: 'object',
          entityId: s.entityId,
          entityName: s.entityName,
          sceneIds: [gone.sceneId, s.sceneId],
          description: `"${s.entityName}" is ${verb} in ${positionLabel(gone)} but is used again in ${positionLabel(s)}.`,
          evidence: [...gone.sourceFacts, ...s.sourceFacts]
        })
        gone = null
      }
    }
  }

  return out
}

/**
 * Rule 3: appearance change — a physical attribute asserted two different ways.
 *
 * Only fires on attributes the derivation actually parsed, and only between two
 * explicit assertions — an attribute stated once and never restated is not a
 * contradiction, however many scenes the character appears in afterwards.
 */
export function checkAppearanceChange(states: EntityStateRecord[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []

  for (const [key, timeline] of indexStatesByEntity(states)) {
    if (!key.startsWith('character:')) continue

    const seen = new Map<string, EntityStateRecord>()
    for (const s of timeline) {
      for (const [attr, value] of Object.entries(s.state.attributes)) {
        const prev = seen.get(attr)
        if (!prev) {
          seen.set(attr, s)
          continue
        }
        const prevValue = prev.state.attributes[attr]
        if (prevValue && prevValue !== value) {
          out.push({
            type: 'appearance_change',
            severity: 'warning',
            entityType: 'character',
            entityId: s.entityId,
            entityName: s.entityName,
            sceneIds: [prev.sceneId, s.sceneId],
            description: `"${s.entityName}" has ${attr.replace('_', ' ')} "${prevValue}" in ${positionLabel(prev)} and "${value}" in ${positionLabel(s)}.`,
            evidence: [...prev.sourceFacts, ...s.sourceFacts]
          })
          seen.set(attr, s)
        }
      }
    }
  }

  return out
}

/**
 * Rule 4: location impossibility — a character in two places with no travel between.
 *
 * Confined to moves WITHIN a chapter. A chapter break is narrative time: a
 * character at the Gate in chapter 3 and at the Reach in chapter 9 has had eight
 * chapters to travel, however few scenes of theirs were analysed in between.
 * Measuring only by how many analysed scenes separate two states makes a sparse
 * timeline look like teleportation — which is a contradiction reported against
 * a manuscript that has none.
 *
 * Distance within the chapter is measured in story positions rather than raw
 * scene numbers, so the window means the same thing when scenes are unnumbered.
 */
export function checkLocationImpossible(
  states: EntityStateRecord[]
): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []
  const position = buildPositionIndex(states)

  for (const [key, timeline] of indexStatesByEntity(states)) {
    if (!key.startsWith('character:')) continue

    const placed = timeline.filter((s) => s.state.present && s.state.location)
    for (let i = 1; i < placed.length; i++) {
      const prev = placed[i - 1]
      const cur = placed[i]
      if (prev.state.location!.toLowerCase() === cur.state.location!.toLowerCase()) continue

      // Different chapters means time passed. Unknown chapters fall through to
      // the position window, which is the only measure such a project has.
      const sameChapter =
        prev.chapterNumber == null || cur.chapterNumber == null
          ? true
          : prev.chapterNumber === cur.chapterNumber
      if (!sameChapter) continue

      const gap = Math.abs((position.get(cur.sceneId) ?? 0) - (position.get(prev.sceneId) ?? 0))
      if (gap > IMPOSSIBLE_TRAVEL_WINDOW) continue

      out.push({
        type: 'location_impossible',
        severity: 'error',
        entityType: 'character',
        entityId: cur.entityId,
        entityName: cur.entityName,
        sceneIds: [prev.sceneId, cur.sceneId],
        description: `"${cur.entityName}" is in "${prev.state.location}" (${positionLabel(prev)}) and "${cur.state.location}" (${positionLabel(cur)}) with no travel between them.`
      })
    }
  }

  return out
}

/**
 * Rule 5: a revelation that lands twice.
 *
 * This replaces the `knowledge_before_known` stub. That rule as specified needs
 * to know what a character knew *without being told* in a given scene, which
 * nothing in the manuscript states — every implementation of it would have been
 * fuzzy string matching dressed as a continuity check. What the state layer can
 * assert precisely is that the same character learns the same thing twice, which
 * is a real and common failure in a long generated draft: the midpoint reveal
 * fires again in chapter 30 because the writer had no memory that it already had.
 */
export function checkKnowledgeRelearned(
  states: EntityStateRecord[]
): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []

  for (const [key, timeline] of indexStatesByEntity(states)) {
    if (!key.startsWith('character:')) continue

    const learnedAt = new Map<string, EntityStateRecord>()
    for (const s of timeline) {
      for (const topic of s.state.knows) {
        const prev = learnedAt.get(topic)
        if (!prev) {
          learnedAt.set(topic, s)
          continue
        }
        if (prev.sceneId === s.sceneId) continue
        out.push({
          type: 'knowledge_relearned',
          severity: 'warning',
          entityType: 'character',
          entityId: s.entityId,
          entityName: s.entityName,
          sceneIds: [prev.sceneId, s.sceneId],
          description: `"${s.entityName}" learns "${topic}" in ${positionLabel(prev)} and learns it again in ${positionLabel(s)}.`,
          evidence: [...prev.sourceFacts, ...s.sourceFacts]
        })
        learnedAt.set(topic, s)
      }
    }
  }

  return out
}

/**
 * Rule 6: timeline inversion — a scene referring backwards with nothing behind it.
 *
 * Stays digest-based: it is a property of the prose, not of any one entity.
 */
export function checkTimelineInversion(sceneDigests: any[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []
  const markers = ['yesterday', 'earlier today', 'previously', 'last week', 'last month']

  for (const digest of sceneDigests) {
    const sceneId = digest.subsectionId ?? digest.sceneId
    if (!sceneId || digest.sceneNumber !== 1) continue
    const text = `${digest.summary || ''} ${(digest.keyFacts ?? []).join(' ')}`.toLowerCase()
    const hit = markers.find((m) => text.includes(m))
    if (!hit) continue
    out.push({
      type: 'timeline_inversion',
      severity: 'warning',
      entityType: 'timeline',
      entityId: `scene-1`,
      sceneIds: [sceneId],
      description: `The first scene refers to "${hit}" but has nothing before it.`
    })
  }

  return out
}

/**
 * Rule 7: seam discontinuity — a chapter/scene boundary where the carried cast
 * vanishes with no overlap.
 *
 * A "carried cast" is the set of characters present in a scene. When two
 * consecutive scenes both have a present cast but share no character, the
 * narrative dropped everyone at a boundary — a continuity break an author wants
 * flagged. A scene with no present cast (a cold open, a solo interior beat) is
 * not a seam failure: there is no cast to carry, so nothing is lost.
 */
export function checkSeamContinuity(states: EntityStateRecord[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []

  interface SceneCast {
    sceneId: string
    chapter: number
    scene: number
    cast: Set<string>
  }
  const byScene = new Map<string, SceneCast>()
  for (const s of states) {
    if (!s.state.present) continue
    let entry = byScene.get(s.sceneId)
    if (!entry) {
      entry = {
        sceneId: s.sceneId,
        chapter: s.chapterNumber ?? Number.POSITIVE_INFINITY,
        scene: s.sceneNumber ?? Number.POSITIVE_INFINITY,
        cast: new Set<string>()
      }
      byScene.set(s.sceneId, entry)
    }
    if (s.entityName) entry.cast.add(s.entityName)
  }

  const scenes = [...byScene.values()].sort((a, b) => {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.scene - b.scene
  })

  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1]
    const cur = scenes[i]
    if (prev.cast.size === 0 || cur.cast.size === 0) continue

    let overlaps = false
    for (const c of prev.cast) {
      if (cur.cast.has(c)) {
        overlaps = true
        break
      }
    }
    if (overlaps) continue

    out.push({
      type: 'seam_disconnect',
      severity: 'warning',
      entityType: 'scene',
      entityId: cur.sceneId,
      entityName: [...cur.cast].join(', '),
      sceneIds: [prev.sceneId, cur.sceneId],
      description: `No carried character between scenes: "${[...prev.cast].join(', ')}" ends and "${[...cur.cast].join(', ')}" begins with no shared present character.`
    })
  }

  return out
}

/**
 * Run every deterministic rule. No LLM calls.
 *
 * `checkDeadThenAlive` and the knowledge rule are registered here for the first
 * time — both existed as functions that returned nothing and were absent from
 * the list, so a dead-then-alive contradiction has never been reportable.
 */
export async function runDeterministicContradictionChecks(
  sceneDigests: any[],
  _scenes: any[],
  entityStates: EntityStateRecord[] = []
): Promise<DeterministicContradiction[]> {
  return [
    ...checkDeadThenAlive(entityStates),
    ...checkObjectDestroyedThenUsed(entityStates),
    ...checkLocationImpossible(entityStates),
    ...checkAppearanceChange(entityStates),
    ...checkKnowledgeRelearned(entityStates),
    ...checkTimelineInversion(sceneDigests),
    ...checkSeamContinuity(entityStates)
  ]
}

/**
 * Scene pairs worth an LLM look, after the deterministic rules have run.
 *
 * Pairs come from the entity-state index rather than from re-reading digests:
 * two scenes are worth comparing when they make claims about the same entity.
 * The previous version paired every scene sharing a character with every other,
 * which on a 300-scene manuscript where the protagonist appears throughout is
 * ~45,000 pairs — a candidate list larger than the thing it was filtering.
 */
export function generateContradictionCandidates(
  sceneDigests: any[],
  deterministicContradictions: DeterministicContradiction[],
  entityStates: EntityStateRecord[] = []
): Array<{ sceneA: string; sceneB: string; reason: string }> {
  const candidates = new Map<string, string>()
  const add = (a: string, b: string, reason: string) => {
    if (!a || !b || a === b) return
    const key = [a, b].sort().join('|')
    if (!candidates.has(key)) candidates.set(key, reason)
  }

  for (const c of deterministicContradictions) {
    if (c.sceneIds.length >= 2) add(c.sceneIds[0], c.sceneIds[1], c.type)
  }

  // Adjacent claims only. A contradiction is between a state and the state that
  // follows it; a scene 200 scenes later that agrees with both is not evidence.
  for (const [, timeline] of indexStatesByEntity(entityStates)) {
    const asserting = timeline.filter((s) => s.sourceFacts.length > 0)
    for (let i = 1; i < asserting.length; i++) {
      add(asserting[i - 1].sceneId, asserting[i].sceneId, 'adjacent_claims')
    }
  }

  return [...candidates.entries()].map(([key, reason]) => {
    const [sceneA, sceneB] = key.split('|')
    return { sceneA, sceneB, reason }
  })
}
