/**
 * Cross-chapter deterministic rules — zero LLM calls.
 *
 * Pass 2 of the tree traversal. Pass 1 scopes the scene-level rules to one
 * chapter at a time, so any pair spanning chapters is invisible to them;
 * these rules own those pairs. They read the entity-state timeline
 * partitioned by chapter boundaries — chapter digests carry no state
 * semantics (presence lists and summaries only), so they contribute
 * display text, never verdicts.
 *
 * Same output shape and precision bias as the scene rules: every finding
 * carries its evidence and boundary scenes, and anything that cannot be
 * proven cross-chapter (unplaced states, same-chapter pairs) is left to
 * Pass 1, never reported twice.
 */

import type { EntityStateRecord } from './entityStates'
import { indexStatesByEntity } from './entityStates'
import { positionLabel, type DeterministicContradiction } from './deterministicContradictions'

function chapterOf(s: EntityStateRecord): number | null {
  return typeof s.chapterNumber === 'number' ? s.chapterNumber : null
}

/**
 * Death in one chapter, unexplained presence in a later one.
 *
 * Mirrors the scene rule's scan (one report per death; an explicit revival
 * clears it) lifted to chapter granularity, and reports only the spanning
 * case: same-chapter pairs belong to Pass 1. Severity is warning, not
 * error — at chapter distance a flashback or off-page survival is
 * plausible and the states cannot distinguish it.
 */
export function checkCrossChapterResurrection(
  states: EntityStateRecord[]
): DeterministicContradiction[] {
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
      const revived = s.state.status === 'alive' && s.sourceFacts.length > 0
      if (revived) {
        death = null
        continue
      }
      if (s.state.present) {
        const deathChapter = chapterOf(death)
        const presenceChapter = chapterOf(s)
        // Same-chapter pairs (including both-unplaced, which Pass 1 runs
        // together as one group) belong to the scene rule — skip them so
        // no finding is ever reported twice. Everything else is
        // invisible to Pass 1's scoped groups: a null↔placed span can
        // only be a backfill gap, so it reports as a warning with the
        // legacy id rather than vanishing silently.
        const sameScope =
          deathChapter === presenceChapter ||
          (deathChapter === null && presenceChapter === null)
        if (!sameScope) {
          out.push({
            type: 'dead_then_alive',
            severity: 'warning',
            entityType: 'character',
            entityId: s.entityId,
            entityName: s.entityName,
            sceneIds: [death.sceneId, s.sceneId],
            description: `"${s.entityName}" is established dead in ${positionLabel(death)} but appears again in ${positionLabel(s)}.`,
            evidence: [...death.sourceFacts, ...s.sourceFacts]
          })
        }
        death = null
      }
    }
  }

  return out
}

/** All Pass-2 rules over the full (unscoped) state timeline. */
export async function runCrossChapterRuleChecks(
  entityStates: EntityStateRecord[] = []
): Promise<DeterministicContradiction[]> {
  return [...checkCrossChapterResurrection(entityStates)]
}

/** A volume digest with just the fields drift analysis reads. */
export interface VolumeDriftInput {
  volumeId: string
  charactersPresent?: string[] | null
  locations?: string[] | null
}

function normSet(values?: string[] | null): Set<string> {
  return new Set((values ?? []).map((v) => String(v ?? '').trim().toLowerCase()).filter(Boolean))
}

/** Jaccard distance in [0, 1]; empty-vs-empty is 0 (nothing to drift). */
export function jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const v of a) if (b.has(v)) inter++
  return 1 - inter / (a.size + b.size - inter)
}

/** Provisional drift bar — calibration on real multi-volume books is owed. */
export const DEFAULT_VOLUME_DRIFT_THRESHOLD = 0.7
/** Share of a volume's cast never seen in any earlier volume. */
export const DEFAULT_VOLUME_INFLUX_THRESHOLD = 0.5

function volumeLabel(
  volumeId: string,
  chaptersByVolume: Map<string, number[]>
): string {
  const chs = [...(chaptersByVolume.get(volumeId) ?? [])].sort((x, y) => x - y)
  if (chs.length) return `the volume covering chapter${chs.length > 1 ? 's' : ''} ${chs[0]}–${chs[chs.length - 1]}`
  return `volume ${String(volumeId).slice(0, 8)}`
}

/**
 * Cast and setting drift between consecutive volumes, in story order.
 *
 * Volumes arrive ordered (see `orderVolumesByChapter`); chapter digests
 * supply human labels only. Thin pairs (union under 2 on both axes) stay
 * silent — drift means nothing when neither volume establishes anything.
 * All findings are warnings: a new book phase legitimately turns the cast
 * over; the author judges, the rule only points.
 */
export function checkVolumeDrift(
  orderedVolumes: VolumeDriftInput[],
  chaptersByVolume: Map<string, number[]> = new Map()
): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []
  for (let i = 1; i < orderedVolumes.length; i++) {
    const prev = orderedVolumes[i - 1]
    const cur = orderedVolumes[i]
    const prevChars = normSet(prev.charactersPresent)
    const curChars = normSet(cur.charactersPresent)
    const prevLocs = normSet(prev.locations)
    const curLocs = normSet(cur.locations)
    if (prevChars.size + curChars.size < 2 && prevLocs.size + curLocs.size < 2) continue
    const from = volumeLabel(prev.volumeId, chaptersByVolume)
    const to = volumeLabel(cur.volumeId, chaptersByVolume)
    const charDrift = jaccardDistance(prevChars, curChars)
    if (charDrift >= DEFAULT_VOLUME_DRIFT_THRESHOLD) {
      out.push({
        type: 'volume_drift',
        severity: 'warning',
        entityType: 'volume',
        entityId: cur.volumeId,
        sceneIds: [],
        description: `Cast turns over sharply between ${from} and ${to} (${Math.round(charDrift * 100)}% of the combined cast appears on only one side). Intended for a new book phase; unintended for a continuous one.`
      })
    }
    const locDrift = jaccardDistance(prevLocs, curLocs)
    if (locDrift >= DEFAULT_VOLUME_DRIFT_THRESHOLD) {
      out.push({
        type: 'volume_drift',
        severity: 'warning',
        entityType: 'volume',
        entityId: cur.volumeId,
        sceneIds: [],
        description: `Setting turns over sharply between ${from} and ${to} (${Math.round(locDrift * 100)}% of locations appear on only one side).`
      })
    }
  }
  return out
}

/**
 * New-cast influx: the share of a volume's characters seen in no earlier
 * volume. Distinct from pairwise drift — a slow bleed across three volumes
 * trips no single pair but shows here.
 */
export function checkVolumeInflux(orderedVolumes: VolumeDriftInput[]): DeterministicContradiction[] {
  const out: DeterministicContradiction[] = []
  const seen = new Set<string>()
  for (const vol of orderedVolumes) {
    const chars = normSet(vol.charactersPresent)
    if (chars.size > 0 && seen.size > 0) {
      let fresh = 0
      for (const c of chars) if (!seen.has(c)) fresh++
      if (fresh / chars.size >= DEFAULT_VOLUME_INFLUX_THRESHOLD) {
        out.push({
          type: 'volume_drift',
          severity: 'warning',
          entityType: 'volume',
          entityId: vol.volumeId,
          sceneIds: [],
          description: `${Math.round((fresh / chars.size) * 100)}% of this volume's cast (${fresh} of ${chars.size}) never appeared in any earlier volume.`
        })
      }
    }
    for (const c of chars) seen.add(c)
  }
  return out
}

/**
 * Order volumes by their lowest chapter number (from chapter digests).
 * Volumes with no chapters in the digests keep input order at the end —
 * never dropped for lack of placement.
 */
export function orderVolumesByChapter<
  T extends { volumeId: string }
>(volumes: T[], chapterDigests: Array<{ volumeId?: string | null; chapterNumber?: number | null }>): T[] {
  const minChapter = new Map<string, number>()
  for (const d of chapterDigests) {
    if (d?.volumeId == null || typeof d.chapterNumber !== 'number') continue
    const prev = minChapter.get(d.volumeId)
    if (prev === undefined || d.chapterNumber < prev) minChapter.set(d.volumeId, d.chapterNumber)
  }
  return [...volumes].sort((a, b) => {
    const ca = minChapter.get(a.volumeId)
    const cb = minChapter.get(b.volumeId)
    if (ca === undefined && cb === undefined) return 0
    if (ca === undefined) return 1
    if (cb === undefined) return -1
    return ca - cb
  })
}
