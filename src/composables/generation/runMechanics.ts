/**
 * Run mechanics for the volume story generator: batch math, prose guards,
 * eval-score helpers and conflict detection.
 *
 * Extracted verbatim from useVolumeStoryGenerator.ts (stage 1 of the god-file
 * split). Every function here is pure and dependency-free, which is why this
 * stage moves first — the 69-test generator suite plus batchChapterAlignment
 * pin the behavior from the outside.
 */

const SYNC_BATCH_SIZE = 3
// Upper bound on a chapter-aligned batch. The bible sync runs at batch *end*,
// so entities discovered in a chapter's first scene do not reach its last one
// until the batch closes — an uncapped chapter would write its own tail blind
// to its own cast. Six covers the common 2–5 scene chapter outright and lets
// longer ones take an intermediate refresh instead of drifting.
const MAX_SYNC_BATCH_SIZE = 6

// Map a global scene index to its section (chapter) index using each section's
// actual scene count — replaces the old Math.floor(i / 3) that silently assumed
// exactly 3 scenes per chapter and mis-attributed word counts otherwise.
export function sectionIndexForScene(sections: any, sceneIndex: any) {
  let offset = 0
  for (let i = 0; i < sections.length; i++) {
    const count = (sections[i].scenes && sections[i].scenes.length) || 0
    if (sceneIndex < offset + count) return i
    offset += count
  }
  return Math.max(0, sections.length - 1)
}

/**
 * Where the batch starting at `startIndex` ends: the next chapter boundary.
 *
 * A batch boundary is where the run stops writing and thinks — digest rollup,
 * bible sync, drift eval, continuity audit — and every one of those steps is
 * chapter-shaped. A fixed stride only matched that shape because the stride and
 * the default `scenesPerChapter` were both 3. At any other setting they drift:
 * with 4-scene chapters, stride-3 boundaries (3, 6, 9, 12…) and chapter ends
 * (4, 8, 12…) coincide only every twelve scenes, and
 * `ConsistencyService.maybeRunIncrementalConsistency` — which returns early
 * unless the index lands exactly on a chapter end — silently audited a quarter
 * of the chapters it was supposed to.
 *
 * Falls back to the fixed stride when there is no chapter plan to align to, or
 * when `startIndex` has run past the last planned chapter: `continueStory`
 * appends scenes beyond the chapters originally planned for them.
 */
/**
 * Where the batch loop goes after a batch, or `null` to stop looping.
 *
 * `focusInstructions` is the one piece of state that has to survive the hop:
 * eval feedback, drift regressions and the active-learning bridge all
 * accumulate into it during a batch and steer the next one's prompts.
 */
export type NextBatch = { startIndex: number; focusInstructions: string } | null

/**
 * Drive a batch function until it reports there is nothing more to do.
 *
 * Iteration, not recursion, and that is the entire point: a batch's context —
 * its chapter log, its rolled-up earlier chapters, its entity blob, all
 * potentially multi-KB — becomes unreachable the moment it returns. The tail
 * recursion this replaced held every one of those alive until the run finished,
 * so a hundred-chapter book carried a hundred copies for no reason.
 *
 * Termination rests on `runBatch` returning a strictly greater `startIndex`;
 * `batchEndIndex` guarantees that, and `batchChapterAlignment.test.js` asserts
 * it for every chapter shape.
 */
export async function runBatchLoop(
  runBatch: (startIndex: number, focusInstructions: string) => Promise<NextBatch>,
  startIndex: number,
  focusInstructions: string
): Promise<void> {
  let next: NextBatch = { startIndex, focusInstructions }
  while (next) {
    next = await runBatch(next.startIndex, next.focusInstructions)
  }
}

export function batchEndIndex(startIndex: any, chapters: any, totalScenes: any) {
  const fallback = Math.min(startIndex + SYNC_BATCH_SIZE, totalScenes)
  if (!Array.isArray(chapters) || chapters.length === 0) return fallback

  let boundary = 0
  for (const ch of chapters) {
    boundary += (ch?.scenes && ch.scenes.length) || 0
    // Strictly greater: on an aligned batch `startIndex` is itself a chapter
    // end, and stopping there again would write nothing and recurse forever.
    if (boundary > startIndex) {
      return Math.min(boundary, startIndex + MAX_SYNC_BATCH_SIZE, totalScenes)
    }
  }
  return fallback
}

/**
 * A scene with no words is a failed scene, not a finished one.
 *
 * Nothing used to assert this. The writer can return an empty string — every
 * chunked section failing produced exactly that — and the commit path only
 * checked for a thrown error, so it wrote `content: ''` with
 * `contentStatus: 'generated'` and reported success. A whole book generated that
 * way looks, to every downstream check, like a book that was written.
 */
export function assertProse(prose: any, scene: any) {
  if (prose && String(prose).trim()) return
  throw new Error(
    `Scene "${scene?.title || scene?.sceneNumber || '?'}" returned no prose — treating as failed.`
  )
}

export function attemptScore(ev: any) {
  return ev && !ev.evalUnavailable && typeof ev.score === 'number' ? ev.score : -1
}
export function isCleanPass(ev: any) {
  return !!(ev && !ev.evalUnavailable && ev.pass)
}

export function detectSceneConflicts(results: any) {
  if (results.length < 2) return []
  const allFacts = []
  for (const r of results) {
    if (!r.success) continue
    for (const f of r.keyFacts || []) {
      allFacts.push({ fact: f, sceneIndex: r.sceneIndex })
    }
  }
  const conflicts = []
  for (let i = 0; i < allFacts.length; i++) {
    for (let j = i + 1; j < allFacts.length; j++) {
      const af = allFacts[i],
        bf = allFacts[j]
      if (af.sceneIndex === bf.sceneIndex) continue
      const normA = af.fact
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
      const normB = bf.fact
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
      if (normA === normB) continue
      const wordsA = normA.split(/\s+/).filter((w: any) => w.length > 3)
      const wordsB = normB.split(/\s+/).filter((w: any) => w.length > 3)
      if (wordsA.length < 2 || wordsB.length < 2) continue
      const overlap = wordsA.filter((w: any) => wordsB.includes(w)).length
      const ratio = overlap / Math.min(wordsA.length, wordsB.length)
      if (ratio >= 0.5) {
        conflicts.push({
          sceneA: af.sceneIndex,
          sceneB: bf.sceneIndex,
          factA: af.fact,
          factB: bf.fact
        })
      }
    }
  }
  return conflicts
}

export async function resolveSceneConflicts(conflicts: any[], results: any[]) {
  let changed = false
  for (const c of conflicts) {
    const resultA = results.find((r) => r.sceneIndex === c.sceneA)
    const resultB = results.find((r) => r.sceneIndex === c.sceneB)
    if (!resultA?.success || !resultB?.success) continue

    const scoreA = resultA.eval?.score ?? 0
    const scoreB = resultB.eval?.score ?? 0

    if (scoreA >= scoreB) {
      const idx = resultB.keyFacts.indexOf(c.factB)
      if (idx !== -1) {
        resultB.keyFacts.splice(idx, 1)
        changed = true
      }
    } else {
      const idx = resultA.keyFacts.indexOf(c.factA)
      if (idx !== -1) {
        resultA.keyFacts.splice(idx, 1)
        changed = true
      }
    }
  }
  return changed
}
