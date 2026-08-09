import { countUniqueWords, countWords, duplicateRatio, MAX_DUPLICATE_RATIO } from '../evalGates'
import { CRITIC_VERDICT_CONFIG } from '../criticVerdict'
import { MAX_DEGRADED_SCENE_RATIO } from './runHealth'
import { REFUSAL_PATTERNS } from '../../guardrails/guards/contentSafetyGuard'

/**
 * The chapter acceptance gate.
 *
 * Scene gates judge scenes in isolation, and three scenes can each pass while
 * still adding up to a bad chapter: the same beat told three times, a POV that
 * changes hands with nothing declaring it, a chapter landing at 40% of its word
 * target, or scene 3 contradicting scene 1 in a way only the pair reveals.
 *
 * Everything here is a pure function over data the run already collected —
 * committed prose, the plan, the critiques in `evalStore`, the terminal
 * continuity audit, the run-health ledger. No model calls. An optional
 * coherence score may be supplied by the caller (stage D); it is advisory only,
 * because a subjective 1–10 from a model that saturates its own scores must
 * never block a commit — that is the exact failure `criticVerdict.ts` exists to
 * route around.
 *
 * The gate reports; it does not delete. Blocking findings mean "this is not a
 * chapter" and are worth telling the author about loudly, but the prose stays
 * committed either way. An author paid minutes-to-hours of local inference for
 * it.
 */

export interface ChapterGateFinding {
  code: string
  severity: 'block' | 'warn'
  message: string
  sceneIndices?: number[]
}

export interface ChapterGateMetrics {
  sceneCount: number
  uniqueWords: number
  targetWords: number
  wordRatio: number
  chapterDuplicateRatio: number
  weakestDimension: { name: string; score: number } | null
  scenesBelowFloor: number
  continuityIssues: number
  coherence?: { arc: number; pacing: number; voice: number }
}

export interface ChapterGateReport {
  /** No `block` findings. */
  passed: boolean
  findings: ChapterGateFinding[]
  metrics: ChapterGateMetrics
}

/** A scene as it sits in the generator's positional `writtenScenes` array. */
export interface WrittenSceneLike {
  title?: string
  prose?: string
  sceneNumber?: number
  characters?: string[]
  location?: string
  summary?: string
  keyFacts?: string[]
}

/** A scene brief as it sits in `scenePlan`. */
export interface PlanSceneLike {
  sceneNumber?: number
  title?: string
  pov?: string
  estimatedWords?: number
}

/** A critique as `evalStore` records it. */
export interface ChapterVerdictLike {
  sceneIndex?: number
  passed?: boolean
  score?: number | null
  dimensionScores?: Record<string, number | null> | null
  evalUnavailable?: boolean
}

export interface ChapterGateInput {
  /** Positional and hole-tolerant: a scene that failed every attempt is `null`. */
  scenes: Array<WrittenSceneLike | null | undefined>
  plan: PlanSceneLike[]
  verdicts?: ChapterVerdictLike[]
  continuity?: { issueCount?: number } | null
  /** The chapter's word target. Falls back to the plan's own estimates. */
  targetWords?: number
  /** `runHealth.countByKind('metadata_failed')` for this run. */
  metadataFailed?: number
  /** `runHealth.countByKind('metadata_skipped')` for this run. */
  metadataSkipped?: number
  /** `runHealth.degradedScenes()` for this run. */
  degradedScenes?: number
  /** Stage D, when the caller ran it. Advisory. */
  coherence?: { arc: number; pacing: number; voice: number } | null
}

/**
 * Below this the chapter is short. 0.85 rather than a rounder number so the
 * scene gate and the chapter gate agree on what "short" means —
 * `gateProseQuality` uses the same 85% floor per scene.
 */
export const CHAPTER_SHORT_RATIO = 0.85

/** Above this the chapter overran its target badly enough to say so. */
export const CHAPTER_LONG_RATIO = 1.3

/**
 * Two scenes sharing more than this share of one's sentences are telling the
 * same beat twice. Deliberately looser than the whole-chapter duplicate ratio:
 * a callback or a repeated refrain is craft, a quarter of a scene is not.
 */
export const CROSS_SCENE_OVERLAP_RATIO = 0.25

/**
 * Sentence keys, using exactly the rule `countUniqueWords` uses.
 *
 * Fragments under five words ("Yes.", "He ran.") legitimately recur in
 * dialogue, so they never count as repetition — matching the scene-level gate
 * rather than inventing a second, subtly different notion of a duplicate.
 */
function sentenceKeys(text: string): Set<string> {
  const keys = new Set<string>()
  for (const raw of String(text || '').split(/(?<=[.!?])\s+/)) {
    const key = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (key && key.split(' ').length >= 5) keys.add(key)
  }
  return keys
}

/**
 * The refused fragment, or null.
 *
 * Same two discriminators the writer uses: the match must sit at offset 0 of
 * the trimmed text, and text opening with a quotation mark is dialogue. This
 * genre is full of people refusing each other, and a scene may legitimately
 * open with a character saying they can't.
 *
 * Applied per scene rather than to the joined chapter, because "offset 0" of a
 * concatenation is only ever the first scene's opening.
 */
function refusalIn(prose: string): string | null {
  const text = String(prose || '')
    .replace(/^[\s`]*(?:json|markdown)?\s*/i, '')
    .trimStart()
  if (!text) return null
  if (/^["'“‘«]/.test(text)) return null
  for (const pattern of REFUSAL_PATTERNS) {
    const match = text.match(pattern)
    if (match && match.index === 0) return match[0]
  }
  return null
}

function weakestDimensionOf(verdicts: ChapterVerdictLike[]): { name: string; score: number } | null {
  let weakest: { name: string; score: number } | null = null
  for (const v of verdicts) {
    for (const [name, score] of Object.entries(v?.dimensionScores || {})) {
      if (typeof score !== 'number' || !Number.isFinite(score)) continue
      if (!weakest || score < weakest.score) weakest = { name, score }
    }
  }
  return weakest
}

/**
 * Judge a finished chapter.
 *
 * Pure: every input is data the run already has, and the same input always
 * produces the same report.
 */
export function evaluateChapter(input: ChapterGateInput): ChapterGateReport {
  const plan = Array.isArray(input.plan) ? input.plan : []
  const scenes = Array.isArray(input.scenes) ? input.scenes : []
  const verdicts = Array.isArray(input.verdicts) ? input.verdicts : []
  const sceneCount = Math.max(plan.length, scenes.length)
  const findings: ChapterGateFinding[] = []

  const add = (
    code: string,
    severity: 'block' | 'warn',
    message: string,
    sceneIndices?: number[]
  ) => {
    findings.push(sceneIndices?.length ? { code, severity, message, sceneIndices } : { code, severity, message })
  }

  // ─── Stage A — structure and prose, no model calls ───────────────────────

  const holes: number[] = []
  const empties: number[] = []
  const refusals: number[] = []
  for (let i = 0; i < sceneCount; i++) {
    const scene = scenes[i]
    if (!scene) {
      holes.push(i + 1)
      continue
    }
    if (!String(scene.prose || '').trim()) {
      empties.push(i + 1)
      continue
    }
    if (refusalIn(scene.prose as string)) refusals.push(i + 1)
  }

  if (holes.length) {
    add(
      'missing_prose',
      'block',
      `${holes.length} planned scene(s) never produced prose, even after the repair pass.`,
      holes
    )
  }
  if (empties.length) {
    add('empty_prose', 'block', `${empties.length} scene(s) committed empty prose.`, empties)
  }
  if (refusals.length) {
    add(
      'refusal_prose',
      'block',
      `${refusals.length} scene(s) open with a model refusal rather than prose.`,
      refusals
    )
  }

  const written = scenes.filter(Boolean) as WrittenSceneLike[]
  const joined = written.map((s) => String(s.prose || '')).join('\n\n')
  const chapterDuplicateRatio = duplicateRatio(joined)
  if (chapterDuplicateRatio > MAX_DUPLICATE_RATIO) {
    add(
      'chapter_duplicate',
      'block',
      `${Math.round(chapterDuplicateRatio * 100)}% of the chapter is duplicate sentences ` +
        `(max ${Math.round(MAX_DUPLICATE_RATIO * 100)}%) — the model is looping.`
    )
  }

  // Cross-scene repetition: the same beat told twice reads as padding even when
  // each scene alone is clean, so the whole-chapter ratio above never sees it.
  const keysPerScene = written.map((s) => sentenceKeys(String(s.prose || '')))
  for (let a = 0; a < keysPerScene.length; a++) {
    for (let b = a + 1; b < keysPerScene.length; b++) {
      const left = keysPerScene[a]
      if (left.size === 0) continue
      let shared = 0
      for (const key of left) if (keysPerScene[b].has(key)) shared++
      const overlap = shared / left.size
      if (overlap > CROSS_SCENE_OVERLAP_RATIO) {
        add(
          'cross_scene_repetition',
          'warn',
          `Scenes ${a + 1} and ${b + 1} share ${Math.round(overlap * 100)}% of their sentences.`,
          [a + 1, b + 1]
        )
      }
    }
  }

  const planTarget = plan.reduce((sum, s) => sum + (Number(s?.estimatedWords) || 0), 0)
  const targetWords = Number(input.targetWords) || planTarget
  const uniqueWords = countUniqueWords(joined)
  const wordRatio = targetWords > 0 ? uniqueWords / targetWords : 1

  if (targetWords > 0 && wordRatio < CHAPTER_SHORT_RATIO) {
    // Advisory, never blocking. A short chapter is fixable and its prose is
    // worth keeping; failing the run would throw away work the author paid
    // real inference time for.
    add(
      'chapter_short',
      'warn',
      `Chapter is ${uniqueWords} unique words against a ${targetWords}-word target ` +
        `(${Math.round(wordRatio * 100)}%).`
    )
  } else if (targetWords > 0 && wordRatio > CHAPTER_LONG_RATIO) {
    add(
      'chapter_long',
      'warn',
      `Chapter is ${uniqueWords} unique words against a ${targetWords}-word target ` +
        `(${Math.round(wordRatio * 100)}%).`
    )
  }

  const metadataFailed = Number(input.metadataFailed) || 0
  const metadataSkipped = Number(input.metadataSkipped) || 0
  if (metadataFailed > 0) {
    add(
      'metadata_failed',
      'block',
      `Metadata extraction failed on ${metadataFailed} scene(s) — the bible sync ran blind.`
    )
  } else if (sceneCount > 0 && metadataSkipped >= sceneCount) {
    add(
      'metadata_skipped_all',
      'block',
      `Metadata extraction never ran on any of the ${sceneCount} scene(s).`
    )
  }

  // POV stability. The plan is the declaration; a scene whose declared POV
  // character is not in its own cast has drifted away from it.
  const povDrift: number[] = []
  for (let i = 0; i < sceneCount; i++) {
    const pov = String(plan[i]?.pov || '').trim()
    const scene = scenes[i]
    if (!pov || !scene) continue
    const cast = (scene.characters || []).map((c) => String(c).toLowerCase())
    if (cast.length && !cast.includes(pov.toLowerCase())) povDrift.push(i + 1)
  }
  if (povDrift.length) {
    add(
      'pov_drift',
      'warn',
      `${povDrift.length} scene(s) do not cast the POV character the plan declared.`,
      povDrift
    )
  }

  // ─── Stage B — aggregate the critiques already collected ─────────────────

  const scored = verdicts.filter((v) => !v?.evalUnavailable)
  const failed = scored.filter((v) => v?.passed === false)
  const failedBudget = Math.ceil(sceneCount / 3)
  if (sceneCount > 0 && failed.length > failedBudget) {
    add(
      'verdicts_failed',
      'block',
      `${failed.length} of ${sceneCount} scene(s) still failed critique after retries ` +
        `(max ${failedBudget}).`,
      failed.map((v, i) => Number(v.sceneIndex) || i + 1)
    )
  }

  const weakestDimension = weakestDimensionOf(verdicts)
  if (weakestDimension && weakestDimension.score < CRITIC_VERDICT_CONFIG.minDimensionScore) {
    add(
      'weak_dimension',
      'warn',
      `Weakest dimension across the chapter is ${weakestDimension.name} at ` +
        `${weakestDimension.score} (floor ${CRITIC_VERDICT_CONFIG.minDimensionScore}).`
    )
  }

  const unavailable = verdicts.filter((v) => v?.evalUnavailable)
  if (unavailable.length > 0 && verdicts.length > 0 && unavailable.length === verdicts.length) {
    add(
      'eval_unavailable_all',
      'block',
      `The critic produced no usable verdict for any of the ${verdicts.length} scene(s) — ` +
        `the chapter was never judged.`
    )
  } else if (unavailable.length > 0) {
    add(
      'eval_unavailable',
      'warn',
      `${unavailable.length} scene(s) were accepted unchecked — the critic gave no usable verdict.`,
      unavailable.map((v, i) => Number(v.sceneIndex) || i + 1)
    )
  }

  const degradedScenes = Number(input.degradedScenes) || 0
  const degradedRatio = sceneCount > 0 ? degradedScenes / sceneCount : 0
  if (degradedRatio > MAX_DEGRADED_SCENE_RATIO) {
    add(
      'degraded_scenes',
      'block',
      `${degradedScenes} of ${sceneCount} scene(s) degraded ` +
        `(${Math.round(degradedRatio * 100)}%, max ${Math.round(MAX_DEGRADED_SCENE_RATIO * 100)}%).`
    )
  }

  // ─── Stage C — continuity (the terminal audit the run already ran) ───────

  const continuityIssues = Number(input.continuity?.issueCount) || 0
  if (continuityIssues > 0) {
    add(
      'continuity_unresolved',
      'block',
      `${continuityIssues} continuity issue(s) survived the audit's bounded fix rounds.`
    )
  }

  // ─── Stage D — coherence, when the caller ran it. Advisory only. ─────────

  const coherence = input.coherence || undefined
  if (coherence) {
    for (const [name, score] of Object.entries(coherence)) {
      if (typeof score === 'number' && score < CRITIC_VERDICT_CONFIG.minDimensionScore) {
        add('weak_coherence', 'warn', `Chapter ${name} scored ${score} out of 10.`)
      }
    }
  }

  return {
    passed: !findings.some((f) => f.severity === 'block'),
    findings,
    metrics: {
      sceneCount,
      uniqueWords,
      targetWords,
      wordRatio,
      chapterDuplicateRatio,
      weakestDimension,
      scenesBelowFloor: failed.length,
      continuityIssues,
      ...(coherence ? { coherence } : {})
    }
  }
}

/** One human-readable block for the activity log. */
export function describeChapterGate(report: ChapterGateReport): string {
  const lines: string[] = []
  const m = report.metrics
  lines.push(report.passed ? '✓ Chapter gate passed.' : '✗ Chapter gate found blocking issues.')
  lines.push(
    `${m.sceneCount} scene(s) · ${m.uniqueWords} unique words` +
      (m.targetWords > 0 ? ` of ${m.targetWords} (${Math.round(m.wordRatio * 100)}%)` : '') +
      ` · ${Math.round(m.chapterDuplicateRatio * 100)}% duplicate` +
      ` · ${m.continuityIssues} continuity issue(s)`
  )
  for (const f of report.findings) {
    lines.push(`${f.severity === 'block' ? '  ✗' : '  !'} ${f.code}: ${f.message}`)
  }
  return lines.join('\n')
}

/**
 * The two shortest scenes, for the one bounded expansion round a short chapter
 * gets. Holes are skipped — there is nothing to expand.
 */
export function shortestScenes(
  scenes: Array<WrittenSceneLike | null | undefined>,
  limit = 2
): Array<{ index: number; scene: WrittenSceneLike }> {
  return scenes
    .map((scene, index) => ({ index, scene }))
    .filter((entry): entry is { index: number; scene: WrittenSceneLike } => !!entry.scene)
    .sort((a, b) => countWords(String(a.scene.prose || '')) - countWords(String(b.scene.prose || '')))
    .slice(0, limit)
}
