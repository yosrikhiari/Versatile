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
export function positionLabel(s: EntityStateRecord): string {
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
 * Rules 7a/7b: seam continuity — a present cast that vanishes between
 * adjacent units of story with no recorded death is a dropped thread.
 *
 * Identity is by entity NAME, not id: rows derived without a story-bible
 * resolver share placeholder ids, while names are what the derivation and
 * every seam test actually distinguish on.
 */
function seamIdentity(s: EntityStateRecord): string {
  return s.entityName || String(s.entityId)
}

function rowsByScene(states: EntityStateRecord[]): Map<string, EntityStateRecord[]> {
  const map = new Map<string, EntityStateRecord[]>()
  for (const s of states) {
    if (s.entityType !== 'character') continue
    const list = map.get(s.sceneId)
    if (list) list.push(s)
    else map.set(s.sceneId, [s])
  }
  return map
}

/** Latest row for an entity at or before a story position, for death checks. */
function latestRowAtOrBefore(
  rows: EntityStateRecord[],
  posOf: (s: EntityStateRecord) => number | undefined,
  boundaryPos: number
): EntityStateRecord | null {
  let latest: EntityStateRecord | null = null
  for (const s of rows) {
    const p = posOf(s)
    if (p === undefined || p > boundaryPos) continue
    if (!latest || (posOf(latest) as number) <= p) latest = s
  }
  return latest
}

/**
 * Rule 7b: scene-level seam — adjacent scenes with disjoint present casts.
 *
 * Either side empty stays silent (cold opens, interludes, single-scene
 * chapters mid-list). A death recorded on or before the later scene explains
 * the absence and stays silent too — only an unexplained disappearance warns.
 */
export function checkSeamContinuity(states: EntityStateRecord[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []
  const pos = buildPositionIndex(states)
  const byScene = rowsByScene(states)
  const scenesInOrder = [...pos.keys()].sort((a, b) => (pos.get(a) as number) - (pos.get(b) as number))
  const posOf = (s: EntityStateRecord): number | undefined => pos.get(s.sceneId)

  const presentOf = (sceneId: string): Map<string, EntityStateRecord> => {
    const map = new Map<string, EntityStateRecord>()
    for (const r of byScene.get(sceneId) || []) {
      if (r.state.present) map.set(seamIdentity(r), r)
    }
    return map
  }

  for (let i = 1; i < scenesInOrder.length; i++) {
    const prev = scenesInOrder[i - 1]
    const cur = scenesInOrder[i]
    const prevCast = presentOf(prev)
    const curCast = presentOf(cur)
    if (prevCast.size === 0 || curCast.size === 0) continue
    for (const [key, row] of prevCast) {
      if (curCast.has(key)) continue
      const timeline = states.filter(
        (s) => s.entityType === 'character' && seamIdentity(s) === key
      )
      const last = latestRowAtOrBefore(timeline, posOf, pos.get(cur) as number)
      if (last?.state.status === 'dead') continue
      out.push({
        type: 'seam_disconnect',
        severity: 'warning',
        entityType: 'character',
        entityId: row.entityId,
        entityName: row.entityName,
        sceneIds: [prev, cur],
        description:
          `"${row.entityName || key}" is present in scene ${prev} ` +
          `but does not appear in the next scene (${cur}).`,
        evidence: [...row.sourceFacts]
      })
    }
  }

  return out
}

/**
 * Rule 7a: chapter-level seam — a character present at the end of one chapter
 * and absent from the whole next chapter, with no recorded death in between.
 *
 * Only chapter-ADJACENT pairs in story order are compared, and only characters
 * (locations teleporting is checkLocationImpossible's job). The description
 * names both chapters because the generation-time consumer parses them back
 * out to place the warning.
 */
export function checkChapterSeam(states: EntityStateRecord[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []
  const pos = buildPositionIndex(states)
  const posOf = (s: EntityStateRecord): number | undefined => pos.get(s.sceneId)
  const byScene = rowsByScene(states)

  const chaptersInOrder: number[] = [
    ...new Set(
      states
        .map((s) => s.chapterNumber)
        .filter((n): n is number => typeof n === 'number')
    )
  ].sort((a, b) => a - b)
  if (chaptersInOrder.length < 2) return out

  const scenesOfChapter = new Map<number, string[]>()
  for (const [sceneId, rows] of byScene) {
    const ch = rows[0]?.chapterNumber
    if (typeof ch !== 'number') continue
    const list = scenesOfChapter.get(ch)
    if (list) list.push(sceneId)
    else scenesOfChapter.set(ch, [sceneId])
  }
  const orderScene = (id: string): number => pos.get(id) ?? Number.MAX_SAFE_INTEGER
  for (const list of scenesOfChapter.values()) list.sort((a, b) => orderScene(a) - orderScene(b))

  const presentOf = (sceneId: string): Map<string, EntityStateRecord> => {
    const map = new Map<string, EntityStateRecord>()
    for (const r of byScene.get(sceneId) || []) {
      if (r.state.present) map.set(seamIdentity(r), r)
    }
    return map
  }

  for (let i = 1; i < chaptersInOrder.length; i++) {
    const prevCh = chaptersInOrder[i - 1]
    const curCh = chaptersInOrder[i]
    const prevScenes = scenesOfChapter.get(prevCh) || []
    const curScenes = scenesOfChapter.get(curCh) || []
    if (prevScenes.length === 0 || curScenes.length === 0) continue
    const endOfPrev = prevScenes[prevScenes.length - 1]
    const startOfCur = curScenes[0]
    const endCast = presentOf(endOfPrev)
    if (endCast.size === 0) continue
    const curCast = new Map<string, EntityStateRecord>()
    for (const id of curScenes) {
      for (const [key, row] of presentOf(id)) curCast.set(key, row)
    }
    for (const [key, row] of endCast) {
      if (curCast.has(key)) continue
      const timeline = states.filter(
        (s) => s.entityType === 'character' && seamIdentity(s) === key
      )
      const last = latestRowAtOrBefore(timeline, posOf, pos.get(startOfCur) as number)
      if (last?.state.status === 'dead') continue
      out.push({
        type: 'seam_disconnect',
        severity: 'warning',
        entityType: 'character',
        entityId: row.entityId,
        entityName: row.entityName,
        sceneIds: [endOfPrev, startOfCur],
        description:
          `"${row.entityName || key}" was present at the end of chapter ${prevCh} ` +
          `but does not appear in chapter ${curCh}.`,
        evidence: [...row.sourceFacts]
      })
    }
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
    ...checkChapterSeam(entityStates),
    ...checkSeamContinuity(entityStates)
  ]
}

/**
 * Chapters contributing more candidate scenes than this get their ledger
 * block replaced by the chapter-digest summary in the LLM prompt.
 *
 * Calibrated 2026-09-09 on real qwen3:8b sample prose (2 scenes, measured
 * in the code's exact formats at ~4 chars/token): per-scene ledger ≈ 82
 * tokens, per-scene summary line ≈ 30, block header ≈ 11. Substitution
 * wins on tokens at every n, so the threshold is about information, not
 * cost: at ≤4 scenes verbatim costs ≤ ~330 tokens and keeps exact facts
 * in front of the verifier; past 4 the chapter compresses (a 10-scene
 * chapter drops ~820 → ~310). Deterministic findings always travel
 * verbatim on a separate path — this only compresses the LLM's input.
 */
export const DEFAULT_MAX_SCENES_PER_CHAPTER = 4

/**
 * sceneId → chapterNumber, states first then the scenes array.
 *
 * Shared by ledger grouping and finding attribution so the two can never
 * disagree about which chapter a scene belongs to. Scenes resolving to no
 * chapter are absent from the map — callers must render those verbatim.
 */
export function indexScenesByChapter(
  entityStates: Array<{ sceneId?: unknown; chapterNumber?: unknown }> = [],
  scenes: Array<{ id?: unknown; sceneId?: unknown; chapterNumber?: unknown }> = []
): Map<string, number> {
  const chapterByScene = new Map<string, number>()
  for (const s of entityStates) {
    if (s?.sceneId != null && typeof s.chapterNumber === 'number') {
      chapterByScene.set(String(s.sceneId), s.chapterNumber)
    }
  }
  for (const s of scenes) {
    const id = s?.id ?? s?.sceneId
    if (id != null && typeof s.chapterNumber === 'number' && !chapterByScene.has(String(id))) {
      chapterByScene.set(String(id), s.chapterNumber)
    }
  }
  return chapterByScene
}

/**
 * Ledger text for the LLM verification step.
 *
 * Pure and extracted so chapter-digest substitution is testable. SceneId →
 * chapter resolves from the entity states first (they carry both), then
 * from the scenes array when it carries chapter numbers. A ledger whose
 * chapter never resolves is always rendered verbatim — substitution must
 * never drop facts it cannot place.
 */
export function buildCandidateLedgerText({
  ledgers,
  scenes = [],
  entityStates = [],
  chapterDigests = [],
  maxScenesPerChapter = Infinity
}: {
  ledgers: any[]
  scenes?: any[]
  entityStates?: EntityStateRecord[]
  chapterDigests?: Array<{ chapterNumber: number; summary: string }>
  maxScenesPerChapter?: number
}): string {
  const chapterByScene = indexScenesByChapter(entityStates, scenes)
  const digestByChapter = new Map<number, string>()
  for (const d of chapterDigests) {
    if (d && typeof d.chapterNumber === 'number' && !digestByChapter.has(d.chapterNumber)) {
      digestByChapter.set(d.chapterNumber, d.summary ?? '')
    }
  }

  const byChapter = new Map<number | null, any[]>()
  for (const l of ledgers) {
    const ch = chapterByScene.get(String(l.sceneId ?? l.id)) ?? null
    if (!byChapter.has(ch)) byChapter.set(ch, [])
    byChapter.get(ch)!.push(l)
  }

  const blocks: string[] = []
  for (const [ch, group] of byChapter) {
    const digest = ch != null ? digestByChapter.get(ch) : undefined
    if (ch != null && digest != null && group.length > maxScenesPerChapter) {
      const nums = group.map((l: any) => l.sceneNumber).filter((n: any) => n != null)
      blocks.push(`Chapter ${ch} (digest covering ${group.length} scenes${nums.length ? ` ${nums.join(', ')}` : ''}):\n  ${digest}`)
      continue
    }
    for (const l of group) blocks.push(renderLedger(l))
  }
  return blocks.join('\n\n')
}

function renderLedger(l: any): string {
  return (
    `Scene ${l.sceneNumber} ("${l.sceneTitle}"):\n` +
    `  Characters: ${l.facts?.characters?.join(', ') ?? 'none'}\n` +
    `  Locations: ${l.facts?.locations?.join(', ') ?? 'none'}\n` +
    `  Events: ${l.facts?.events?.join('; ') ?? 'none'}\n` +
    `  Objects: ${l.facts?.objects?.join(', ') ?? 'none'}\n` +
    `  Timeline: ${l.facts?.timeline ?? 'unknown'}`
  )
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
