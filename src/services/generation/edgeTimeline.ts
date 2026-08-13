/**
 * Relationships in chapter-space.
 *
 * A story network is a snapshot of a moment. This one was a union of every
 * guess ever made about every moment: `generateRelationships` deduped on the
 * endpoint pair alone, so the FIRST run to claim a pair owned it forever. Once
 * volume 1 wrote `Kael—Mira: ally`, volume 4's `Kael—Mira: enemy` was dropped as
 * a duplicate and folded into a `reason: 'all_duplicate'` summary. The betrayal
 * the whole book turns on could not enter the graph, and nothing said so.
 *
 * A validity window makes the reversal representable instead of impossible:
 * allies from chapter 1 until 12, enemies from 13 onward. Both are true; they
 * are true at different times.
 *
 * Window semantics — both bounds inclusive, both nullable:
 *   `validFromChapter: null`  → true from the start of the story
 *   `validUntilChapter: null` → still true; never superseded
 * An edge written before this existed has neither, which reads as "always true".
 * That is exactly the old behaviour, so nothing already in a graph changes
 * meaning when the schema arrives.
 */

export interface TemporalEdge {
  sourceId: string
  sourceType: string
  targetId: string
  targetType: string
  relationshipType: string
  description?: string
  planned?: boolean
  volumeId?: string | null
  validFromChapter?: number | null
  validUntilChapter?: number | null
  runId?: string | null
  [key: string]: any
}

/** Endpoint pair, direction-insensitive — the identity of a *connection*. */
export function edgePairKey(edge: TemporalEdge): string {
  const a = `${edge.sourceType}:${edge.sourceId}`
  const b = `${edge.targetType}:${edge.targetId}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Identity of a *claim*: the pair plus what is being claimed about it.
 *
 * This is the key the dedupe should always have used. Keyed on the pair alone,
 * "allies" and "enemies" are the same row and the second one vanishes.
 */
export function edgeClaimKey(edge: TemporalEdge): string {
  return `${edgePairKey(edge)}|${String(edge.relationshipType || 'connected').toLowerCase()}`
}

/** Is this edge asserted to be true at `chapter`? A null chapter means "any time". */
export function isEdgeActiveAt(edge: TemporalEdge, chapter: number | null | undefined): boolean {
  if (chapter === null || chapter === undefined) return true
  const from = edge.validFromChapter ?? Number.NEGATIVE_INFINITY
  const until = edge.validUntilChapter ?? Number.POSITIVE_INFINITY
  return chapter >= from && chapter <= until
}

/**
 * The graph as it stood at a given chapter.
 *
 * This is what a prompt should be built from. Handing the writer every edge the
 * project has ever held tells it about a betrayal twenty chapters before it
 * happens, and about an alliance that ended ten chapters ago, in the same list
 * and with no way to tell them apart.
 */
export function sliceEdgesAtChapter<T extends TemporalEdge>(
  edges: T[],
  chapter: number | null | undefined
): T[] {
  if (chapter === null || chapter === undefined) return edges
  return edges.filter((e) => isEdgeActiveAt(e, chapter))
}

/** Every claim ever made about a pair, in chapter order — the pair's history. */
export function edgeHistory<T extends TemporalEdge>(edges: T[], pairKey: string): T[] {
  return edges
    .filter((e) => edgePairKey(e) === pairKey)
    .sort(
      (a, b) =>
        (a.validFromChapter ?? Number.NEGATIVE_INFINITY) -
        (b.validFromChapter ?? Number.NEGATIVE_INFINITY)
    )
}

export interface EdgeWritePlan<T extends TemporalEdge> {
  /** New rows to insert, already stamped with their window and provenance. */
  inserts: T[]
  /** `{ id, validUntilChapter }` for rows a new claim closes off. */
  supersedes: Array<{ id: any; validUntilChapter: number; reason: string }>
  /** Proposals dropped because the graph already asserts them. */
  duplicates: T[]
  /**
   * Proposals that contradict an open claim but could not be ordered against it
   * — the existing claim starts at or after this chapter, so which supersedes
   * which is unknowable. Dropped rather than guessed, and surfaced so a caller
   * can say so instead of reporting a silent no-op.
   */
  unorderable: T[]
}

/**
 * Decide what a weave should actually write.
 *
 * Pure, so the decision is testable without a database — the old dedupe was
 * inline in the persistence path and could only be observed through its counts.
 */
export function planEdgeWrites<T extends TemporalEdge>({
  existing,
  proposed,
  atChapter,
  runId,
  volumeId
}: {
  existing: TemporalEdge[]
  proposed: T[]
  /** The chapter these claims describe. Defaults to the story's opening. */
  atChapter?: number | null
  runId?: string | null
  volumeId?: string | null
}): EdgeWritePlan<T> {
  const chapter = typeof atChapter === 'number' && atChapter > 0 ? atChapter : 1

  const byPair = new Map<string, TemporalEdge[]>()
  for (const e of existing) {
    const key = edgePairKey(e)
    const list = byPair.get(key)
    if (list) list.push(e)
    else byPair.set(key, [e])
  }

  const plan: EdgeWritePlan<T> = { inserts: [], supersedes: [], duplicates: [], unorderable: [] }
  // Claims accepted in this same batch count as existing for later proposals,
  // or a response listing a pair twice inserts it twice.
  const acceptedClaims = new Set<string>()

  for (const p of proposed) {
    const pairKey = edgePairKey(p)
    const claimKey = edgeClaimKey(p)

    if (acceptedClaims.has(claimKey)) {
      plan.duplicates.push(p)
      continue
    }

    const active = (byPair.get(pairKey) || []).filter((e) => isEdgeActiveAt(e, chapter))

    const sameClaim = active.find((e) => edgeClaimKey(e) === claimKey)
    if (sameClaim) {
      plan.duplicates.push(p)
      continue
    }

    // A different claim about the same pair, already open at this chapter. This
    // is the reversal case — the one the old dedupe threw away.
    const conflicting = active.filter((e) => edgeClaimKey(e) !== claimKey)
    const closable = conflicting.filter(
      (e) => (e.validFromChapter ?? Number.NEGATIVE_INFINITY) < chapter && e.id != null
    )

    if (conflicting.length > 0 && closable.length === 0) {
      plan.unorderable.push(p)
      continue
    }

    for (const e of closable) {
      plan.supersedes.push({
        id: e.id,
        validUntilChapter: chapter - 1,
        reason: `superseded by "${p.relationshipType}" at chapter ${chapter}`
      })
    }

    plan.inserts.push({
      ...p,
      volumeId: p.volumeId ?? volumeId ?? null,
      validFromChapter: chapter,
      validUntilChapter: null,
      runId: runId ?? null
    })
    acceptedClaims.add(claimKey)
  }

  return plan
}
