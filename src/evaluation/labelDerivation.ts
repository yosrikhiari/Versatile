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

import { weightedKappa, wilsonCI, perClassAgreement } from './judgeMetrics'

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

/**
 * Frozen held-out split (design spec §2, amended 2026-10-11 to SHA-256 parity).
 *
 * Rule: SHA-256 hex digest of `sceneId`, parity of the FIRST byte (first 2
 * hex chars parsed as a byte): even → SET-A, odd → SET-B.
 *
 * - SET-A is the detection set: the 15% mapping-review trigger is evaluated
 *   here; it may motivate a v1.1 mapping.
 * - SET-B is the validation set: a v1.1 mapping is tested here; these scenes
 *   never motivate changes.
 *
 * Scope: the split applies to Revise scenes (pass scenes need no mapping
 * validation).
 *
 * Rationale: hash parity, not pool-order parity (sequential IDs would
 * alternate under order parity).
 *
 * Hash mechanism: dependency-free sync SHA-256 (FIPS 180-4) below, UTF-8
 * encoded. No node:crypto import: the repo tsconfig sets `"types": []` to
 * keep Node globals out of the browser bundle, so `node:crypto` fails
 * `npm run typecheck`; and the async WebCrypto helper in src/utils/hash.ts
 * cannot serve this sync signature. Output is byte-identical standard
 * SHA-256 — the pinned fixture test verifies it against sha256sum vectors.
 */
export function splitHeldOut(scenes: Array<{ sceneId: string }>): {
  setA: string[]
  setB: string[]
} {
  const setA: string[] = []
  const setB: string[] = []
  for (const scene of scenes) {
    const digest = sha256Hex(scene.sceneId)
    const firstByte = parseInt(digest.slice(0, 2), 16)
    if (firstByte % 2 === 0) {
      setA.push(scene.sceneId)
    } else {
      setB.push(scene.sceneId)
    }
  }
  return { setA, setB }
}

const SHA256_K: number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]

function sha256Rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n))
}

/** SHA-256 hex digest (FIPS 180-4) over the UTF-8 bytes of `message`. */
function sha256Hex(message: string): string {
  const data = new TextEncoder().encode(message)
  const bitLengthHigh = Math.floor(data.length / 0x20000000)
  const bitLengthLow = (data.length << 3) >>> 0
  const paddedLength = (((data.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(paddedLength - 8, bitLengthHigh)
  view.setUint32(paddedLength - 4, bitLengthLow)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w: number[] = new Array<number>(64)
  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(block + i * 4)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = sha256Rotr(w[i - 15], 7) ^ sha256Rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = sha256Rotr(w[i - 2], 17) ^ sha256Rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const s1 = sha256Rotr(e, 6) ^ sha256Rotr(e, 11) ^ sha256Rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + s1 + ch + SHA256_K[i] + w[i]) | 0
      const s0 = sha256Rotr(a, 2) ^ sha256Rotr(a, 13) ^ sha256Rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (s0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + h) | 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((part) => (part >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

/**
 * Frozen Option 3 shadow-label definition (design spec §3).
 *
 * Whole-scene score = the eval record's top-level `score` field (focused
 * path: mean of judged dimensions; combined path: model self-report).
 *
 * Mapping: >= 7 → 'pass'; 5–6 → 'revise'; < 5 → 'rewrite';
 * null/NaN/non-finite → 'excluded' (never defaulted — defaulting is the
 * saturation bug criticVerdict.ts exists to route around).
 */
export function wholeSceneScoreLabel(score: number | null | undefined): DerivedLabel | 'excluded' {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return 'excluded'
  }
  if (score >= 7) {
    return 'pass'
  }
  if (score >= 5) {
    return 'revise'
  }
  return 'rewrite'
}

/**
 * Task 5 — schema gate for consensus.json entries.
 *
 * The `overall` field name is VERIFY-AGAINST-DATA: real consensus.json is
 * absent from this tree, so the gate enforces presence loudly rather than
 * defaulting. Throws naming the missing key when `overall` or any of the
 * five dimension keys is absent from `entry.dims`.
 */
export interface NormalizedConsensusEntry {
  sceneId: string
  overall: OverallMark
  dims: Record<DimensionKey, DimensionMark>
  note: string
}

const REQUIRED_CONSENSUS_DIMS: DimensionKey[] = [
  'continuity',
  'voice',
  'show_tell',
  'pacing',
  'emotional_goal'
]

export function fromConsensusEntry(entry: unknown): NormalizedConsensusEntry {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error('fromConsensusEntry: missing key "entry" (expected an object).')
  }
  const record = entry as Record<string, unknown>
  if (record['overall'] === undefined) {
    throw new Error('fromConsensusEntry: missing key "overall".')
  }
  const overall = record['overall']
  if (overall !== 'Keep' && overall !== 'Revise') {
    throw new Error(
      'fromConsensusEntry: missing or invalid key "overall" (expected "Keep" or "Revise").'
    )
  }
  const dimsRaw = record['dims']
  if (typeof dimsRaw !== 'object' || dimsRaw === null) {
    throw new Error('fromConsensusEntry: missing key "dims".')
  }
  const dimsRecord = dimsRaw as Record<string, unknown>
  for (const key of REQUIRED_CONSENSUS_DIMS) {
    if (dimsRecord[key] === undefined) {
      throw new Error(`fromConsensusEntry: missing key "dims.${key}".`)
    }
    const value = dimsRecord[key]
    if (value !== 'Problem' && value !== 'Fine' && value !== 'Unsure') {
      throw new Error(
        `fromConsensusEntry: missing or invalid key "dims.${key}" (expected Problem/Fine/Unsure).`
      )
    }
  }
  const sceneIdRaw = record['sceneId']
  if (typeof sceneIdRaw !== 'string' || sceneIdRaw.length === 0) {
    throw new Error('fromConsensusEntry: missing key "sceneId".')
  }
  const noteRaw = record['note']
  const note = typeof noteRaw === 'string' ? noteRaw : ''
  return {
    sceneId: sceneIdRaw,
    overall: overall as OverallMark,
    dims: {
      continuity: dimsRecord['continuity'] as DimensionMark,
      voice: dimsRecord['voice'] as DimensionMark,
      show_tell: dimsRecord['show_tell'] as DimensionMark,
      pacing: dimsRecord['pacing'] as DimensionMark,
      emotional_goal: dimsRecord['emotional_goal'] as DimensionMark
    },
    note
  }
}

/** Deterministic mulberry32 PRNG (seeded; pure, no global state). */
function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Task 5 — deterministic blind-control sample over hit-free scene ids.
 *
 * Ascending-sorts the ids (so input order cannot bias the draw), shuffles
 * with a seeded mulberry32 PRNG (Fisher-Yates), and returns the first
 * min(k, len) ids. Pure and deterministic across calls for the same
 * (ids, seed, k).
 */
export function sampleUnflagged(sceneIds: string[], seed = 20261011, k = 10): string[] {
  const sorted = [...sceneIds].sort()
  const shuffled = [...sorted]
  const rand = mulberry32(seed)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = shuffled[i] as string
    shuffled[i] = shuffled[j] as string
    shuffled[j] = tmp
  }
  return shuffled.slice(0, Math.min(k, shuffled.length))
}

/**
 * Task 5 — pure calibration-report builder (dual arms, split shadow,
 * seeded sample, schema gate above).
 *
 * Inputs:
 * - scenes: normalized consensus entries plus a `humanOnly` flag each.
 * - judge: record sceneId -> judge outputs (authoritative Option-2 label
 *   plus the two whole-scene scores for the Option-3 shadow arms).
 *
 * Pure: no models, no I/O, deterministic (the unflagged sample uses the
 * seeded PRNG above). Metric helpers (weightedKappa / wilsonCI /
 * perClassAgreement) are imported from judgeMetrics, never reimplemented.
 */

export interface CalibrationScene {
  sceneId: string
  overall: OverallMark
  dims: Record<DimensionKey, DimensionMark>
  note: string
  humanOnly: boolean
}

export interface JudgeOutput {
  authoritativeLabel: DerivedLabel
  focusedScore: number | null
  combinedScore: number | null
}

export type JudgeRecord = Record<string, JudgeOutput>

export interface CalibrationDistribution {
  pass: number
  revise: number
  rewrite: number
  lowConfidence: number
  missingLoadBearing: number
}

export type TriggerCounts = Record<RewriteTrigger, number>

export interface KeepWithProblemReport {
  count: number
  sceneIds: string[]
}

export type MappingDirection = 'rebuild-on-revise' | 'fix-on-rewrite'

export interface MappingHit {
  sceneId: string
  direction: MappingDirection
  phrase: string
}

export interface MappingReviewReport {
  hits: MappingHit[]
  unflaggedSample: Array<{ sceneId: string }>
}

export interface DualArmReport {
  n: number
  weightedKappa: number
  agreement95: [number, number]
  perClass: Record<string, { agreement: number; support: number }>
}

export interface DualHumanOnlyReport extends DualArmReport {
  descriptiveOnly: true
}

export interface DualReport {
  reviewer: DualArmReport
  humanOnly: DualHumanOnlyReport
}

export interface ShadowArmReport {
  n: number
  matches: number
  agreement: number
  agreement95: [number, number]
  excluded: number
}

export interface ShadowReport {
  focused: ShadowArmReport
  combined: ShadowArmReport
}

export interface TriggerAgreement {
  rate: number
  support: number
  ci: [number, number]
}

export type RewriteByTriggerReport = Record<RewriteTrigger, TriggerAgreement>

export interface CalibrationReport {
  distribution: CalibrationDistribution
  triggers: TriggerCounts
  keepWithProblem: KeepWithProblemReport
  mappingReview: MappingReviewReport
  dual: DualReport
  shadow: ShadowReport
  rewriteByTrigger: RewriteByTriggerReport
  notes: string[]
}

const CALIBRATION_CLASSES: [string, string, string] = ['pass', 'revise', 'rewrite']

const CALIBRATION_TRIGGERS: RewriteTrigger[] = ['continuity-only', 'voice-only', 'both']

export const CALIBRATION_NOTES: string[] = [
  'Judge continuity is binary (8 = clean, 3 = verified contradiction); it cannot produce a continuity-driven revise — shadow-arm revises come from other dimensions or the mean.',
  'Human-only arm is descriptive only with Wilson 95% CIs; it carries no pass/fail claims (n is too small for a powered claim).',
  'Shadow comparison is pass/not-pass only; null scores are excluded per arm independently, never pooled.'
]

function findHitPhrase(
  derived: DerivedLabel,
  note: string
): { direction: MappingDirection; phrase: string } | null {
  if (derived === 'revise') {
    const match = REBUILD_RE.exec(note)
    if (match) {
      return { direction: 'rebuild-on-revise', phrase: match[0] }
    }
    return null
  }
  if (derived === 'rewrite') {
    const fixMatch = FIX_RE.exec(note)
    if (fixMatch) {
      return { direction: 'fix-on-rewrite', phrase: fixMatch[0] }
    }
    const polishMatch = POLISH_VERB_RE.exec(note)
    if (polishMatch) {
      return { direction: 'fix-on-rewrite', phrase: polishMatch[0] }
    }
    return null
  }
  return null
}

function buildDualArm(
  derivedLabels: string[],
  judgeLabels: string[]
): {
  n: number
  weightedKappa: number
  agreement95: [number, number]
  perClass: Record<string, { agreement: number; support: number }>
} {
  const n = derivedLabels.length
  if (n === 0) {
    return {
      n: 0,
      weightedKappa: NaN,
      agreement95: wilsonCI(0, 0),
      perClass: {
        pass: { agreement: NaN, support: 0 },
        revise: { agreement: NaN, support: 0 },
        rewrite: { agreement: NaN, support: 0 }
      }
    }
  }
  let matches = 0
  for (let i = 0; i < n; i++) {
    if (derivedLabels[i] === judgeLabels[i]) {
      matches++
    }
  }
  return {
    n,
    weightedKappa: weightedKappa(derivedLabels, judgeLabels, CALIBRATION_CLASSES),
    agreement95: wilsonCI(matches, n),
    perClass: perClassAgreement(derivedLabels, judgeLabels, [...CALIBRATION_CLASSES])
  }
}

function buildShadowArm(
  scenes: CalibrationScene[],
  judge: JudgeRecord,
  pickScore: (output: JudgeOutput) => number | null
): ShadowArmReport {
  let n = 0
  let matches = 0
  let excluded = 0
  for (const scene of scenes) {
    const output = judge[scene.sceneId]
    if (output === undefined) {
      excluded++
      continue
    }
    const shadowLabel = wholeSceneScoreLabel(pickScore(output))
    if (shadowLabel === 'excluded') {
      excluded++
      continue
    }
    n++
    const authoritativePass = output.authoritativeLabel === 'pass'
    const shadowPass = shadowLabel === 'pass'
    if (authoritativePass === shadowPass) {
      matches++
    }
  }
  return {
    n,
    matches,
    agreement: n === 0 ? NaN : matches / n,
    agreement95: wilsonCI(matches, n),
    excluded
  }
}

export function buildCalibrationReport(
  scenes: CalibrationScene[],
  judge: JudgeRecord
): CalibrationReport {
  const derivedByScene = scenes.map((scene) => ({
    sceneId: scene.sceneId,
    note: scene.note,
    humanOnly: scene.humanOnly,
    result: deriveLabel({ overall: scene.overall, dims: scene.dims, note: scene.note })
  }))

  const distribution: CalibrationDistribution = {
    pass: 0,
    revise: 0,
    rewrite: 0,
    lowConfidence: 0,
    missingLoadBearing: 0
  }
  const triggers: TriggerCounts = {
    'continuity-only': 0,
    'voice-only': 0,
    both: 0
  }
  const keepSceneIds: string[] = []
  for (const entry of derivedByScene) {
    distribution[entry.result.label]++
    if (entry.result.lowConfidence) {
      distribution.lowConfidence++
    }
    if (entry.result.missingLoadBearing) {
      distribution.missingLoadBearing++
    }
    if (entry.result.label === 'rewrite' && entry.result.trigger !== undefined) {
      triggers[entry.result.trigger]++
    }
    if (entry.result.keepWithProblem) {
      keepSceneIds.push(entry.sceneId)
    }
  }

  const hits: MappingHit[] = []
  for (const entry of derivedByScene) {
    if (detectMappingReview(entry.result.label, entry.note)) {
      const found = findHitPhrase(entry.result.label, entry.note)
      hits.push({
        sceneId: entry.sceneId,
        direction: entry.result.label === 'revise' ? 'rebuild-on-revise' : 'fix-on-rewrite',
        phrase: found !== null ? found.phrase : ''
      })
    }
  }
  const hitIds = new Set(hits.map((hit) => hit.sceneId))
  const hitFreeIds = scenes.map((scene) => scene.sceneId).filter((sceneId) => !hitIds.has(sceneId))
  const mappingReview: MappingReviewReport = {
    hits,
    unflaggedSample: sampleUnflagged(hitFreeIds).map((sceneId) => ({ sceneId }))
  }

  const derivedLabels = derivedByScene.map((entry) => entry.result.label)
  const judgeLabels = scenes.map((scene) => {
    const output = judge[scene.sceneId]
    if (output === undefined) {
      throw new Error(`buildCalibrationReport: missing judge output for "${scene.sceneId}".`)
    }
    return output.authoritativeLabel
  })
  const reviewer = buildDualArm(derivedLabels, judgeLabels)

  const humanScenes = scenes.filter((scene) => scene.humanOnly)
  const humanDerived = derivedByScene
    .filter((entry) => humanScenes.some((scene) => scene.sceneId === entry.sceneId))
    .map((entry) => entry.result.label)
  const humanJudge = humanScenes.map((scene) => {
    const output = judge[scene.sceneId]
    if (output === undefined) {
      throw new Error(`buildCalibrationReport: missing judge output for "${scene.sceneId}".`)
    }
    return output.authoritativeLabel
  })
  const humanArm = buildDualArm(humanDerived, humanJudge)
  const dual: DualReport = {
    reviewer,
    humanOnly: { ...humanArm, descriptiveOnly: true as const }
  }

  const shadow: ShadowReport = {
    focused: buildShadowArm(scenes, judge, (output) => output.focusedScore),
    combined: buildShadowArm(scenes, judge, (output) => output.combinedScore)
  }

  const rewriteByTrigger: RewriteByTriggerReport = {
    'continuity-only': { rate: NaN, support: 0, ci: wilsonCI(0, 0) },
    'voice-only': { rate: NaN, support: 0, ci: wilsonCI(0, 0) },
    both: { rate: NaN, support: 0, ci: wilsonCI(0, 0) }
  }
  for (const trigger of CALIBRATION_TRIGGERS) {
    const triggerScenes = derivedByScene.filter(
      (entry) => entry.result.label === 'rewrite' && entry.result.trigger === trigger
    )
    const support = triggerScenes.length
    let matches = 0
    for (const entry of triggerScenes) {
      const output = judge[entry.sceneId]
      if (output !== undefined && output.authoritativeLabel === 'rewrite') {
        matches++
      }
    }
    rewriteByTrigger[trigger] = {
      rate: support === 0 ? NaN : matches / support,
      support,
      ci: wilsonCI(matches, support)
    }
  }

  return {
    distribution,
    triggers,
    keepWithProblem: { count: keepSceneIds.length, sceneIds: keepSceneIds },
    mappingReview,
    dual,
    shadow,
    rewriteByTrigger,
    notes: [...CALIBRATION_NOTES]
  }
}
