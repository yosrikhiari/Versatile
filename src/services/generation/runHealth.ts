/**
 * Whether a generation run actually delivered what it promised.
 *
 * The pipeline is built so that no single failure can lose a written scene:
 * prose is salvaged when a later step fails, metadata extraction "never throws",
 * the speculative cache is "best-effort", checkpointing "must not break the run",
 * and a critic that cannot parse its own output returns `pass: true` — described
 * in its own comment as "a surrender, not a verdict". Every one of those is
 * right on its own.
 *
 * The system built from all of them cannot report failure. And because each
 * stage's output is the next stage's input — scene N's `keyFacts` become scene
 * N+1's context — one silent degradation does not stay local. It propagates
 * forward through every remaining scene, growing. A live run wrote thirteen
 * scenes at 45% duplicate text against a story bible that gained nothing, and
 * every indicator said success.
 *
 * Two counters already existed that could have caught it. `evalUnavailableCount`
 * is incremented, reset, and exposed — with no consumer anywhere.
 * `FinalizeReport.errors` is collected and rendered into a log label. The
 * problem was never detection; the guards all fired. It is that nothing
 * aggregated, budgeted, or asserted.
 *
 * So this module does not remove a single `catch`. It gives degradation
 * somewhere to be counted, a ceiling past which the run stops, and a set of
 * end-of-run claims that must hold.
 *
 * Design constraints, each learned from a specific bug in this investigation:
 *
 *   1. Never throws. A health ledger that can break a run reintroduces exactly
 *      the class of problem it exists to solve.
 *   2. No wall-clock. Sequence numbers only, so runs stay deterministic and
 *      testable — the same reason workflow scripts ban `Date.now()`.
 *   3. Reads signals that already exist (`metadataStatus`, gate flags,
 *      `evalUnavailable`, sync counts) rather than asking 38 catch sites to
 *      opt in.
 *   4. Serializable, so it rides in the `genRun` checkpoint and survives resume.
 *   5. Consumed. The mistake `evalUnavailableCount` made was existing without
 *      a consumer, and that is the one mistake this must not repeat.
 */

export type DegradationKind =
  /** Prose failed its own validation (repetition) and was regenerated or dropped. */
  | 'prose_rejected'
  /** Metadata extraction ran and failed. */
  | 'metadata_failed'
  /** Metadata extraction never ran — the salvage path used to land here silently. */
  | 'metadata_skipped'
  /** The critic could not produce a usable verdict. */
  | 'eval_unavailable'
  /** A quality gate raised blocking flags. */
  | 'gate_failed'
  /** A scene contributed no story-bible changes despite usable metadata. */
  | 'sync_empty'
  /** A derived surface (canvas, documents, story context) failed to refresh. */
  | 'artifact_failed'
  /** Speculative prefetch failed. Cheap, but a permanently-dead cache is a bug. */
  | 'prefetch_failed'
  /**
   * The planner filled in chapters or scenes the model never produced.
   *
   * `planChunked` pads a failed skeleton batch — up to 12 chapters — and
   * `enforceStructure` pads missing scenes, both by design: a long book should
   * not lose its length to one flaky call. But the padding is content-free, and
   * it was previously reported only to `console.warn`. On a 100-chapter run that
   * is a full-length outline with a blank volume in it, handed to a writer that
   * will dutifully generate 6,000 words per chapter against an empty brief.
   */
  | 'plan_padded'

export interface DegradationEvent {
  kind: DegradationKind
  stage: string
  sceneIndex: number | null
  detail: string
  /** Monotonic sequence, not a timestamp — keeps runs reproducible. */
  seq: number
}

export interface InvariantFacts {
  /** Scenes that produced committed prose. */
  scenesWritten: number
  /** Scenes whose metadata extraction returned usable data. */
  scenesWithMetadata: number
  /** Entities/relationships actually committed to the bible across the run. */
  bibleChangesCommitted: number
  /** Share of committed prose that is duplicate sentences, 0..1. */
  duplicateRatio?: number
}

export interface InvariantViolation {
  /** `block` means the run did not deliver; `warn` means it is suspicious. */
  severity: 'block' | 'warn'
  code: string
  message: string
}

/**
 * Consecutive failures of one kind before the run stops.
 *
 * Three, not ten. Three consecutive rejected scenes means the model is looping,
 * and every further scene is written against context the loop already poisoned.
 * Stopping costs the author three scenes; continuing cost them a volume.
 *
 * Only kinds that compound are budgeted. A failed prefetch or a failed canvas
 * refresh does not degrade the next scene's input, so it is recorded and does
 * not halt anything.
 */
export const ABORT_BUDGET: Partial<Record<DegradationKind, number>> = {
  prose_rejected: 3,
  metadata_failed: 3,
  metadata_skipped: 3,
  eval_unavailable: 5
}

/** Above this share of degraded scenes, the run did not deliver. */
export const MAX_DEGRADED_SCENE_RATIO = 0.3

/** Above this share of duplicate prose, the output is padding, not writing. */
export const MAX_RUN_DUPLICATE_RATIO = 0.15

/**
 * Kinds that mean "this scene is worse than it should be". Used for the degraded
 * -scene ratio; `prefetch_failed` and `artifact_failed` are excluded because
 * neither affects the prose the author receives.
 */
const SCENE_DEGRADING: DegradationKind[] = [
  'prose_rejected',
  'metadata_failed',
  'metadata_skipped',
  'eval_unavailable',
  'gate_failed'
]

export class RunHealth {
  private events: DegradationEvent[] = []
  private seq = 0
  /** Consecutive count per kind; any OTHER kind does not reset it. */
  private streaks = new Map<DegradationKind, number>()
  private abortReason: string | null = null

  /**
   * Record a degradation. Never throws — callers are usually already inside a
   * catch, and a ledger that can fail there is worse than no ledger.
   */
  record(
    kind: DegradationKind,
    opts?: Partial<Omit<DegradationEvent, 'kind' | 'seq'>> | null
  ): void {
    try {
      // Normalized inside the try, not via destructuring defaults in the
      // signature: a default only applies to `undefined`, so an explicit `null`
      // from a caller would throw here — in the one method that promises never
      // to throw, called from inside catch blocks.
      const o = opts ?? {}
      const stage = o.stage ?? 'unknown'
      const sceneIndex = typeof o.sceneIndex === 'number' ? o.sceneIndex : null
      const detail = o.detail ?? ''

      this.events.push({ kind, stage, sceneIndex, detail: String(detail), seq: this.seq++ })

      const streak = (this.streaks.get(kind) || 0) + 1
      this.streaks.set(kind, streak)

      const budget = ABORT_BUDGET[kind]
      if (budget != null && streak >= budget && !this.abortReason) {
        this.abortReason = `${streak} consecutive ${kind.replace(/_/g, ' ')} events — halting before the failure compounds further`
      }
    } catch {
      // Unreachable in practice. Explicit so the invariant "recording health
      // never affects the run" is enforced by construction rather than by hope.
    }
  }

  /**
   * Mark a scene as having completed cleanly, clearing every streak.
   *
   * Streaks measure *consecutive* failure, so a good scene has to reset them —
   * otherwise three failures spread across thirty scenes would abort a run that
   * is basically healthy.
   */
  recordSuccess(): void {
    this.streaks.clear()
  }

  shouldAbort(): boolean {
    return this.abortReason !== null
  }

  getAbortReason(): string | null {
    return this.abortReason
  }

  countByKind(kind: DegradationKind): number {
    return this.events.filter((e) => e.kind === kind).length
  }

  /** Distinct scenes touched by at least one scene-degrading event. */
  degradedScenes(): number {
    const scenes = new Set<number>()
    for (const e of this.events) {
      if (e.sceneIndex != null && SCENE_DEGRADING.includes(e.kind)) scenes.add(e.sceneIndex)
    }
    return scenes.size
  }

  getEvents(): readonly DegradationEvent[] {
    return this.events
  }

  reset(): void {
    this.events = []
    this.seq = 0
    this.streaks.clear()
    this.abortReason = null
  }

  /**
   * Did the run deliver? Not "did it throw" — it never throws — but "is what it
   * produced what it claimed to produce".
   */
  checkInvariants(facts: InvariantFacts): InvariantViolation[] {
    const violations: InvariantViolation[] = []
    const { scenesWritten, scenesWithMetadata, bibleChangesCommitted, duplicateRatio } = facts

    if (scenesWritten === 0) return violations

    // The exact shape of the live failure: prose was written, no scene
    // contributed metadata, so the bible could not possibly have changed and
    // every scene after the first was written against stale context.
    if (scenesWithMetadata === 0) {
      violations.push({
        severity: 'block',
        code: 'no_metadata',
        message: `${scenesWritten} scene(s) written but none produced usable metadata — the story bible, timeline, and graph cannot have changed, and each scene was written against the same context as the last`
      })
    }

    const degraded = this.degradedScenes()
    const ratio = degraded / scenesWritten
    if (ratio > MAX_DEGRADED_SCENE_RATIO) {
      violations.push({
        severity: 'block',
        code: 'degraded_rate',
        message: `${degraded} of ${scenesWritten} scenes degraded (${Math.round(ratio * 100)}%, max ${Math.round(MAX_DEGRADED_SCENE_RATIO * 100)}%)`
      })
    }

    if (duplicateRatio != null && duplicateRatio > MAX_RUN_DUPLICATE_RATIO) {
      violations.push({
        severity: 'block',
        code: 'duplicate_prose',
        message: `${Math.round(duplicateRatio * 100)}% of the committed prose is duplicate sentences (max ${Math.round(MAX_RUN_DUPLICATE_RATIO * 100)}%) — the model was looping`
      })
    }

    // Only meaningful once metadata is landing. A story genuinely may introduce
    // no new entities for a scene or two; it does not do so for a whole volume
    // while extraction is working.
    if (scenesWithMetadata > 0 && bibleChangesCommitted === 0 && scenesWritten >= 3) {
      violations.push({
        severity: 'warn',
        code: 'bible_static',
        message: `${scenesWritten} scenes produced metadata but committed no story-bible changes — check that entity sync is reaching the bible`
      })
    }

    return violations
  }

  /** One line for the activity log. Empty string when the run was clean. */
  summary(): string {
    if (this.events.length === 0) return ''
    const counts = new Map<DegradationKind, number>()
    for (const e of this.events) counts.set(e.kind, (counts.get(e.kind) || 0) + 1)
    const parts = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, n]) => `${n} ${kind.replace(/_/g, ' ')}`)
    return parts.join(' · ')
  }

  /** Plain object for the `genRun` checkpoint, so health survives a resume. */
  toJSON(): { events: DegradationEvent[]; abortReason: string | null } {
    return { events: [...this.events], abortReason: this.abortReason }
  }

  static fromJSON(data: any): RunHealth {
    const health = new RunHealth()
    if (!data || !Array.isArray(data.events)) return health
    for (const e of data.events) {
      if (e && typeof e.kind === 'string') {
        health.events.push({
          kind: e.kind,
          stage: e.stage || 'unknown',
          sceneIndex: typeof e.sceneIndex === 'number' ? e.sceneIndex : null,
          detail: e.detail || '',
          seq: health.seq++
        })
      }
    }
    // Streaks are deliberately NOT restored: a resume starts a fresh attempt,
    // and inheriting a streak would abort it before it wrote anything.
    health.abortReason = null
    return health
  }
}

/** Human-readable report for the activity log and the run summary UI. */
export function describeRunHealth(health: RunHealth, violations: InvariantViolation[]): string {
  const lines: string[] = []
  const summary = health.summary()
  lines.push(summary ? `Degradation: ${summary}` : 'No degradation recorded.')
  for (const v of violations) {
    lines.push(`${v.severity === 'block' ? 'FAILED' : 'WARNING'}: ${v.message}`)
  }
  return lines.join('\n')
}
