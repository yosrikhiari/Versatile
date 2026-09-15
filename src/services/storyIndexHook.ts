/**
 * The one line a save path needs to keep the story's semantic index current.
 *
 * Loads the module lazily so `db-entities` / `db-structure` never take a
 * static dependency on the worker-backed vector stack, reads the saved row
 * back (an update call does not carry `projectId`), and hands it to the
 * debounced scheduler. Fire-and-forget: a save must never wait on, or fail
 * because of, the index.
 */
import type { ContentKind } from './storyVectorIndex'

export function queueStoryIndex(
  kind: ContentKind,
  refId: unknown,
  loadRow: () => Promise<any>
): void {
  if (refId == null) return
  void (async () => {
    try {
      const row = await loadRow()
      if (!row?.projectId) return
      const mod = await import('./storyVectorIndex')
      mod.scheduleStoryIndex(String(row.projectId), kind, String(refId), row)
    } catch {
      // Indexing is a convenience layered on the save, never part of it.
    }
  })()
}
