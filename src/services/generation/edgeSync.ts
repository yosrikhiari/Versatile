/**
 * Edge resolution for `commitSync` (W6 fix).
 *
 * Relationship events name their endpoints by entity name. When an endpoint's
 * entity does not exist yet (a relationship reported before the entity is
 * introduced — e.g. ch5 says "A trusts B" but B arrives in ch8) the edge used to
 * be silently dropped. Instead we persist it to the `pendingSyncEdges` table and
 * retry resolution on every subsequent `commitSync`, so it lands once the entity
 * (possibly created by the same batch) is finally resolvable.
 *
 * Extracted from `useChapterGenerationSync.commitSync` so the buffer/retry logic
 * is unit-testable without the full composable + stores.
 */

import { planEdgeWrites } from './edgeTimeline'

export interface PendingEdgeRow {
  id?: any
  projectId: string
  fromName: string
  toName: string
  relationshipType: string
  description?: string
  volumeId?: string | null
  atChapter?: number | null
}

export interface EdgeSyncDeps {
  projectId: string
  volumeId: string | null
  chapterNumber: number | null
  /** Resolved entity-name → id/type map (already includes this batch's new entities). */
  nameToId: Record<string, { id: string; type: string }>
  graphStore: { addEdgeData: (projectId: string, edge: any) => Promise<void> }
  getGraphEdges: (projectId: string) => Promise<any[]>
  updateGraphEdge: (id: any, patch: any) => Promise<void>
  /** A Dexie-like table: `where('projectId').equals(id).toArray()`, `add(row)`, `delete(id)`. */
  pendingTable: {
    where: (index: string) => { equals: (value: any) => { toArray: () => Promise<any[]> } }
    add: (row: PendingEdgeRow) => Promise<any>
    delete: (id: any) => Promise<void>
  }
  networkEvents: any[]
}

async function writeEdge(
  edge: any,
  deps: Pick<EdgeSyncDeps, 'projectId' | 'graphStore' | 'getGraphEdges' | 'updateGraphEdge'>,
  atChapter: number | null
): Promise<void> {
  const existing = await deps.getGraphEdges(deps.projectId).catch(() => [])
  const plan = planEdgeWrites({
    existing,
    proposed: [edge],
    atChapter,
    volumeId: edge.volumeId || null
  })
  for (const s of plan.supersedes) {
    await deps.updateGraphEdge(s.id, { validUntilChapter: s.validUntilChapter }).catch(() => {})
  }
  for (const e of plan.inserts) {
    await deps.graphStore.addEdgeData(deps.projectId, e)
  }
}

/**
 * Resolve and commit network events, buffering any whose endpoints are not yet
 * known and retrying previously-buffered edges first.
 *
 * Returns the count of events buffered this call (for tests/observability).
 */
export async function resolveAndCommitEdges(deps: EdgeSyncDeps): Promise<number> {
  const {
    projectId,
    volumeId,
    chapterNumber,
    nameToId,
    graphStore,
    getGraphEdges,
    updateGraphEdge,
    pendingTable,
    networkEvents
  } = deps

  // 1) Retry buffered edges whose endpoints now resolve (possibly via this batch).
  try {
    const buffered = await pendingTable.where('projectId').equals(projectId).toArray()
    for (const pe of buffered) {
      const from = nameToId[pe.fromName]
      const to = nameToId[pe.toName]
      if (!from || !to) continue
      await writeEdge(
        {
          sourceId: String(from.id),
          sourceType: from.type,
          targetId: String(to.id),
          targetType: to.type,
          relationshipType: pe.relationshipType || 'relates_to',
          description: pe.description || '',
          volumeId: pe.volumeId || volumeId || null
        },
        { projectId, graphStore, getGraphEdges, updateGraphEdge },
        pe.atChapter ?? chapterNumber
      )
      await pendingTable.delete(pe.id)
    }
  } catch (retryErr) {
    console.warn('[edgeSync] pending-edge retry failed:', retryErr)
  }

  // 2) Resolve this batch's events; buffer the still-unresolved.
  const seen = new Set<string>()
  let bufferedCount = 0
  for (const event of networkEvents) {
    const key = `${event.from}|${event.to}|${event.label || 'relates_to'}`
    if (seen.has(key)) continue
    seen.add(key)

    const from = nameToId[event.from]
    const to = nameToId[event.to]
    if (!from || !to) {
      bufferedCount++
      await pendingTable
        .add({
          projectId,
          fromName: event.from,
          toName: event.to,
          relationshipType: event.label || 'relates_to',
          description: event.label || '',
          volumeId: volumeId || null,
          atChapter: chapterNumber
        })
        .catch((err: any) => console.warn('[edgeSync] could not buffer pending edge:', err))
      continue
    }
    await writeEdge(
      {
        sourceId: String(from.id),
        sourceType: from.type,
        targetId: String(to.id),
        targetType: to.type,
        relationshipType: event.label || 'relates_to',
        description: event.label || '',
        volumeId: volumeId || null
      },
      { projectId, graphStore, getGraphEdges, updateGraphEdge },
      chapterNumber
    )
  }

  return bufferedCount
}
