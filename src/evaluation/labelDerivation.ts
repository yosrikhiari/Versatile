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

/**
 * Mapping-review detection: pre-registered §2 keyword scan over the reviewer
 * note. The scan proposes, a human disposes — a hit surfaces the scene as a
 * mapping-review case (counted and reported, never silently auto-resolved).
 *
 * Frozen verbatim from the spec (ea1cf552, lines 80-86); do not add, drop,
 * or alter any phrase.
 */
const REBUILD_PHRASES: string[] = [
  'rewrite',
  'rewritten',
  'rebuild',
  'rebuilt',
  'rebuilding',
  'start over',
  'starting over',
  'from scratch',
  'fundamentally broken',
  'structurally broken',
  'needs rebuilding',
  'tear down',
  'throw out',
  'throw away'
]

/**
 * Fix-in-place phrases matched case-insensitively. `polish` is deliberately
 * excluded here and matched separately below: the nationality is always
 * capitalized while the verb is overwhelmingly lowercase mid-sentence, so
 * case-sensitive `\bpolish\b` guards against flagging e.g. "the Polish
 * dialogue sings". Sentence-initial "Polish the transitions" (capitalized
 * verb) is a documented accepted miss — covered by the unflagged-note
 * backstop sample plus human disposal.
 */
const FIX_PHRASES_CASELESS: string[] = [
  'touch up',
  'small fix',
  'minor fix',
  'minor edit',
  'one edit',
  'single edit',
  'quick fix',
  'tighten',
  'trim',
  'tweak',
  'copyedit',
  'copy-edit',
  'line edit'
]

function escapeRegExp(phrase: string): string {
  return phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildWordBoundaryPattern(phrases: string[]): string {
  return `\\b(?:${phrases.map(escapeRegExp).join('|')})\\b`
}

const REBUILD_RE = new RegExp(buildWordBoundaryPattern(REBUILD_PHRASES), 'i')
const FIX_RE = new RegExp(buildWordBoundaryPattern(FIX_PHRASES_CASELESS), 'i')
const POLISH_VERB_RE = /\bpolish\b/

/**
 * Return true when the reviewer note contradicts the derived label:
 * rebuild-class language on derived-revise, or fix-in-place language on
 * derived-rewrite. Derived-pass notes never contradict (a kept scene is a
 * pass by reviewer judgment). Matching is word-boundary, not naive
 * substring, so e.g. "rebuilding" does not fire on a "rebuild" alternative
 * branch and vice versa — each phrase stands on its own boundaries.
 */
export function detectMappingReview(derived: DerivedLabel, note: string): boolean {
  if (derived === 'pass') {
    return false
  }
  if (derived === 'revise') {
    return REBUILD_RE.test(note)
  }
  return FIX_RE.test(note) || POLISH_VERB_RE.test(note)
}
