/**
 * P0-A label derivation: frozen v1 Keep/Revise + per-dimension
 * Problem/Fine/Unsure marks to pass/revise/rewrite.
 *
 * Design spec: docs/superpowers/specs/2026-10-11-p0a-label-derivation-design.md §1.
 * Pure function over already-collected labels — no models, no I/O — so the
 * calibration harness can consume derived three-way labels from consensus.json.
 *
 * Mapping:
 * - pass <- overall Keep, regardless of dimension marks. A kept scene with a
 *   minor Problem note is still a pass; the reviewer judged it shippable.
 * - rewrite <- overall Revise AND Problem on continuity or voice. A structural
 *   break on a load-bearing dimension means rebuild, not touch-up.
 * - revise <- overall Revise AND no Problem on continuity or voice. Problems
 *   confined to show_tell/pacing/emotional_goal or notes only: fixable in place.
 * - Unsure dimensions are excluded from the mapping. A Revise scene whose only
 *   signals are Unsure maps to revise and is flagged low-confidence.
 *
 * Reporting flags:
 * - keepWithProblem: Keep scenes carrying a Problem mark on continuity or
 *   voice — counted and reported separately.
 * - missingLoadBearing: a load-bearing key is absent. Flagged as revise and
 *   counted separately, never silently mapped from partial data.
 */

export type OverallMark = 'Keep' | 'Revise'

export type DimensionMark = 'Problem' | 'Fine' | 'Unsure'

export type DimensionKey = 'continuity' | 'voice' | 'show_tell' | 'pacing' | 'emotional_goal'

export type DerivedLabel = 'pass' | 'revise' | 'rewrite'

export type RewriteTrigger = 'continuity-only' | 'voice-only' | 'both'

export const LOAD_BEARING_DIMS = ['continuity', 'voice'] as const

export interface LabelInput {
  overall: OverallMark
  dims: Partial<Record<DimensionKey, DimensionMark>>
  note?: string
}

export interface DerivedResult {
  label: DerivedLabel
  trigger?: RewriteTrigger
  lowConfidence: boolean
  keepWithProblem: boolean
  missingLoadBearing: boolean
}

/** Derive the three-way calibration label from a frozen v1 scene entry. */
export function deriveLabel(input: LabelInput): DerivedResult {
  const dims: Partial<Record<DimensionKey, DimensionMark>> = input.dims ?? {}
  const continuity = dims.continuity
  const voice = dims.voice

  if (continuity === undefined || voice === undefined) {
    return {
      label: 'revise',
      lowConfidence: false,
      keepWithProblem: false,
      missingLoadBearing: true
    }
  }

  const continuityProblem = continuity === 'Problem'
  const voiceProblem = voice === 'Problem'
  const lowConfidence = continuity === 'Unsure' || voice === 'Unsure'
  const keepWithProblem = input.overall === 'Keep' && (continuityProblem || voiceProblem)

  if (input.overall === 'Keep') {
    return {
      label: 'pass',
      lowConfidence,
      keepWithProblem,
      missingLoadBearing: false
    }
  }

  if (continuityProblem || voiceProblem) {
    const trigger: RewriteTrigger =
      continuityProblem && voiceProblem
        ? 'both'
        : continuityProblem
          ? 'continuity-only'
          : 'voice-only'
    return {
      label: 'rewrite',
      trigger,
      lowConfidence,
      keepWithProblem: false,
      missingLoadBearing: false
    }
  }

  return {
    label: 'revise',
    lowConfidence,
    keepWithProblem: false,
    missingLoadBearing: false
  }
}
