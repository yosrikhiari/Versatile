import type { Ref } from 'vue'

/**
 * Carry what the writer reported for a chapter's scenes into the story bible
 * and the graph.
 *
 * The writer's metadata (`newEntities`, `usedEntities`, `networkEvents`) is
 * the only thing that ever moves the bible during a run. The batch strategy
 * did this per batch through the sync-preview pause; the parallel strategy —
 * the path `confirmPlan` always takes — never did it at all, so a one-click
 * book wrote every scene and not one character, location or edge. The health
 * ledger reported it as `bible_static` on the whole run.
 *
 * Parallel writing has no per-batch pause to ask the author about each
 * discovered entity, so everything the writer found is accepted as
 * `generated` (reviewable in the Story Bible afterwards) and edges are
 * stamped with the chapter they happened in. Best-effort: a failure here is
 * counted, never allowed to lose a committed scene.
 */
export interface BibleSyncContext {
  bibleChangesDiscovered: Ref<number>
  scenesSynced: Ref<number>
  runHealth: { record: (kind: any, detail?: any) => void }
  structuredResults: any[]
  sync: {
    discoverSync: (structured: any) => any[]
    commitSync: (args: any) => Promise<{ entitiesCreated: number; edgesWritten: number } | boolean>
  }
}

export interface ChapterSyncArgs {
  projectId: any
  volumeId: any
  /** The section (chapter) row id the scenes belong to; stamps edges and entities. */
  chapterId: any
  /** `{ sceneIndex, structured }` for every scene of the chapter that has metadata. */
  scenes: Array<{ sceneIndex: number; structured: any }>
  /**
   * `false` discovers and records without committing — the caller collects
   * `discovered` for a review pause and commits on confirm. Default `true`.
   */
  commit?: boolean
}

export async function syncChapterToBible(
  ctx: BibleSyncContext,
  { projectId, volumeId, chapterId, scenes, commit = true }: ChapterSyncArgs
): Promise<{
  discovered: number
  entitiesCreated: number
  edgesWritten: number
  /** The proposed changes, for a review pause when `commit` is false. */
  changes: any[]
}> {
  const withMetadata = scenes.filter((s) => s.structured)
  if (withMetadata.length === 0) {
    return { discovered: 0, entitiesCreated: 0, edgesWritten: 0, changes: [] }
  }

  // The terminal audit and `confirmSync` read the run's structured outputs
  // from here; the parallel path never appended to it.
  for (const s of withMetadata) ctx.structuredResults.push(s)

  const changes: any[] = []
  for (const s of withMetadata) {
    const sceneChanges = ctx.sync.discoverSync(s.structured)
    ctx.scenesSynced.value += 1
    changes.push(...sceneChanges)
    // Same signature the batch path records: extraction succeeded and still
    // found nothing for the bible.
    if (sceneChanges.length === 0 && s.structured.metadataStatus === 'ok') {
      ctx.runHealth.record('sync_empty', { stage: 'sync' })
    }
  }

  let entitiesCreated = 0
  let edgesWritten = 0
  if (!commit) return { discovered: changes.length, entitiesCreated, edgesWritten, changes }
  try {
    const result = await ctx.sync.commitSync({
      structuredOutputs: withMetadata.map((s) => s.structured),
      acceptedEntities: changes,
      projectId,
      volumeId,
      chapterId
    })
    if (result && typeof result === 'object') {
      entitiesCreated = result.entitiesCreated || 0
      edgesWritten = result.edgesWritten || 0
    }
  } catch (err: any) {
    console.warn('[bibleSync] chapter sync failed:', err?.message || err)
    ctx.runHealth.record('artifact_failed', {
      stage: 'sync',
      detail: `bible sync failed: ${err?.message || err}`
    })
  }

  ctx.bibleChangesDiscovered.value += entitiesCreated + edgesWritten
  return { discovered: changes.length, entitiesCreated, edgesWritten, changes }
}
