import { ref, toRaw } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStoryNetworkStore } from '../stores/volumeStoryNetworkStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useProjectStore } from '../stores/projectStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { db, getGraphEdges, updateGraphEdge } from '../services/dbService'
import { planEdgeWrites } from '../services/generation/edgeTimeline'

const TARGET_TABLES = [
  db.characters,
  db.locations,
  db.plotThreads,
  db.graphNodeInstances,
  db.volumeEntities
]

export type SyncEntityType = 'character' | 'location' | 'plotThread'

/** Where a story-bible name resolves to, for edge wiring. */
interface EntityRef {
  id: string
  type: SyncEntityType
}

type NameToIdMap = Record<string, EntityRef>

function buildNameToIdMap(bibleStore: any): NameToIdMap {
  const map: NameToIdMap = {}
  for (const char of bibleStore.characters) {
    map[char.name] = { id: char.id, type: 'character' }
  }
  for (const loc of bibleStore.locations) {
    map[loc.name] = { id: loc.id, type: 'location' }
  }
  for (const thread of bibleStore.plotThreads) {
    map[thread.title] = { id: thread.id, type: 'plotThread' }
  }
  return map
}

function lowerSet(arr: string[] | null | undefined): Set<string> {
  return new Set((arr || []).map((s: string) => s.toLowerCase().trim()))
}

/**
 * Which chapter a commit belongs to, as a 1-based position in the manuscript.
 *
 * Sections are the chapters, and their order in the manuscript is the chapter
 * number — the same mapping the Timeline view and the Timeline document use, so
 * an edge stamped here lands on the row the author sees. An unknown chapter
 * yields null, which `planEdgeWrites` treats as the story's opening rather than
 * refusing to write.
 */
function resolveChapterNumber(chapterId: any): number | null {
  if (chapterId == null) return null
  try {
    const manuscriptStore = useManuscriptStore()
    const index = (manuscriptStore.sortedSections as any[]).findIndex(
      (s: any) => String(s.id) === String(chapterId)
    )
    return index >= 0 ? index + 1 : null
  } catch {
    return null
  }
}

export function useChapterGenerationSync() {
  const pendingChanges = ref<any[]>([])
  const isDiscovering = ref(false)
  const isCommitting = ref(false)

  function discoverSync(structured: any) {
    isDiscovering.value = true
    try {
      const bibleStore = useStoryBibleStore()
      const knownCharNames = lowerSet(bibleStore.characters.map((c: any) => c.name))
      const knownLocNames = lowerSet(bibleStore.locations.map((l: any) => l.name))
      const knownThreadTitles = lowerSet(bibleStore.plotThreads.map((t: any) => t.title))

      const usedChars = structured.usedEntities?.characterNames || []
      const usedLocs = structured.usedEntities?.locationNames || []
      const usedThreads = structured.usedEntities?.plotThreadTitles || []

      const referencedChars = lowerSet(usedChars)
      const referencedLocs = lowerSet(usedLocs)
      const referencedThreads = lowerSet(usedThreads)

      const changes = []

      for (const nc of structured.newEntities?.characters || []) {
        if (!knownCharNames.has(nc.name.toLowerCase().trim())) {
          changes.push({
            type: 'character',
            entity: nc,
            action: 'create',
            referenced: referencedChars.has(nc.name.toLowerCase().trim()),
            sourceKey: nc.name,
            _selected: true
          })
        }
      }

      for (const nl of structured.newEntities?.locations || []) {
        if (!knownLocNames.has(nl.name.toLowerCase().trim())) {
          changes.push({
            type: 'location',
            entity: nl,
            action: 'create',
            referenced: referencedLocs.has(nl.name.toLowerCase().trim()),
            sourceKey: nl.name,
            _selected: true
          })
        }
      }

      for (const nt of structured.newEntities?.plotThreads || []) {
        if (!knownThreadTitles.has(nt.title.toLowerCase().trim())) {
          changes.push({
            type: 'plotThread',
            entity: nt,
            action: 'create',
            referenced: referencedThreads.has(nt.title.toLowerCase().trim()),
            sourceKey: nt.title,
            _selected: true
          })
        }
      }

      pendingChanges.value = changes
      return changes
    } finally {
      isDiscovering.value = false
    }
  }

  async function commitSync({
    structuredOutputs,
    acceptedEntities,
    projectId,
    volumeId,
    chapterId
  }: any) {
    isCommitting.value = true
    try {
      const bibleStore = useStoryBibleStore()
      const networkStore = useVolumeStoryNetworkStore()
      const graphStore = useStoryGraphStore()
      const projectStore = useProjectStore()
      const resolvedProjectId = projectId || projectStore.currentProjectId

      const nameToId = { ...buildNameToIdMap(bibleStore) }

      // Deduplicate accepted entities by name within each type
      const seen: Record<SyncEntityType, Set<string>> = {
        character: new Set(),
        location: new Set(),
        plotThread: new Set()
      }
      const uniqueChanges = acceptedEntities.filter((c: any) => {
        const key = (c.entity.name || c.entity.title || '').toLowerCase().trim()
        if (seen[c.type as SyncEntityType].has(key)) return false
        seen[c.type as SyncEntityType].add(key)
        return true
      })

      async function cleanupFailedEntity(
        entityId: string,
        type: SyncEntityType,
        name: string,
        preEntityNodeSnapshot: unknown
      ) {
        const arr =
          type === 'character'
            ? bibleStore.characters
            : type === 'location'
              ? bibleStore.locations
              : bibleStore.plotThreads
        const idx = arr.findIndex((e: any) => e.id === entityId)
        if (idx !== -1) arr.splice(idx, 1)

        if (name) delete nameToId[name]

        if (preEntityNodeSnapshot) {
          graphStore.nodeInstances.value = preEntityNodeSnapshot
          try {
            await graphStore.saveNodeInstances(resolvedProjectId)
          } catch (restoreErr) {
            console.error(
              `[commitSync] Cleanup restore-save also failed for "${name}":`,
              restoreErr
            )
          }
        }
      }

      for (const change of uniqueChanges) {
        let entityId: string | null = null
        const name = change.entity.name || change.entity.title
        const preEntityNodeSnapshot = JSON.parse(
          JSON.stringify(toRaw(graphStore.nodeInstances.value))
        )

        try {
          await db.transaction('rw', TARGET_TABLES, async () => {
            if (change.type === 'character') {
              const newId: string = await bibleStore.addCharacterData(
                resolvedProjectId,
                {
                  name: change.entity.name,
                  role: change.entity.role || 'unknown',
                  description: change.entity.description || ''
                },
                'generated',
                chapterId || null
              )
              entityId = newId
              const nodeKey = `char-${newId}`
              nameToId[name] = { id: newId, type: 'character' }
              if (!graphStore.nodeInstances[nodeKey]) graphStore.nodeInstances[nodeKey] = []
              const instanceKey = `inst-${nodeKey}-${Date.now()}`
              graphStore.nodeInstances[nodeKey].push(instanceKey)
              await graphStore.saveNodeInstances(resolvedProjectId)
            } else if (change.type === 'location') {
              const newId: string = await bibleStore.addLocationData(
                resolvedProjectId,
                {
                  name: change.entity.name,
                  type: change.entity.type || 'unknown',
                  description: change.entity.description || ''
                },
                'generated',
                chapterId || null
              )
              entityId = newId
              const nodeKey = `loc-${newId}`
              nameToId[name] = { id: newId, type: 'location' }
              if (!graphStore.nodeInstances[nodeKey]) graphStore.nodeInstances[nodeKey] = []
              const instanceKey = `inst-${nodeKey}-${Date.now()}`
              graphStore.nodeInstances[nodeKey].push(instanceKey)
              await graphStore.saveNodeInstances(resolvedProjectId)
            } else if (change.type === 'plotThread') {
              const newId: string = await bibleStore.addPlotThreadData(
                resolvedProjectId,
                {
                  title: change.entity.title,
                  status: change.entity.status || 'open',
                  summary: change.entity.summary || ''
                },
                'generated',
                chapterId || null
              )
              entityId = newId
              const nodeKey = `thread-${newId}`
              nameToId[name] = { id: newId, type: 'plotThread' }
              if (!graphStore.nodeInstances[nodeKey]) graphStore.nodeInstances[nodeKey] = []
              const instanceKey = `inst-${nodeKey}-${Date.now()}`
              graphStore.nodeInstances[nodeKey].push(instanceKey)
              await graphStore.saveNodeInstances(resolvedProjectId)
            }

            if (entityId && volumeId) {
              await networkStore.assignEntityToVolume(change.type, entityId, volumeId, false)
            }
          })
        } catch (err) {
          console.error(`[commitSync] Failed to commit entity "${name}":`, err)
          if (entityId) {
            await cleanupFailedEntity(entityId, change.type, name, preEntityNodeSnapshot)
          }
        }
      }

      // Collect all network events across all structured outputs
      const seenEdges = new Set()
      const allNetworkEvents = []
      for (const so of structuredOutputs || []) {
        for (const event of so.networkEvents || []) {
          const edgeKey = `${event.from}|${event.to}|${event.label || 'relates_to'}`
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey)
            allNetworkEvents.push(event)
          }
        }
      }

      // Each chapter is a brick on the base.
      //
      // The base is laid once by the Story Network stage, from the synopsis, and
      // describes the story's starting state. Everything after that is
      // established by chapters as they are written — which is what these events
      // are: the writer reporting what the prose just did. Stamping them with the
      // chapter they happened in is what lets a relationship that develops
      // supersede the one it replaces instead of being dropped as a duplicate of
      // it, and what lets the graph be read back as it stood at any chapter.
      //
      // Previously each event was written TWICE — once through `createVolumeEdge`
      // and again through `addEdgeData`, both landing in `graphEdges` — so every
      // chapter doubled its own contribution to the network.
      const chapterNumber = resolveChapterNumber(chapterId)
      const proposedEdges = []
      for (const event of allNetworkEvents) {
        const from = nameToId[event.from]
        const to = nameToId[event.to]
        if (!from || !to) continue
        proposedEdges.push({
          sourceId: String(from.id),
          sourceType: from.type,
          targetId: String(to.id),
          targetType: to.type,
          relationshipType: event.label || 'relates_to',
          description: event.label || '',
          volumeId: volumeId || null
        })
      }

      if (proposedEdges.length) {
        const existingEdges = await getGraphEdges(resolvedProjectId).catch(() => [])
        const plan = planEdgeWrites({
          existing: existingEdges,
          proposed: proposedEdges,
          atChapter: chapterNumber,
          volumeId: volumeId || null
        })

        for (const s of plan.supersedes) {
          await updateGraphEdge(s.id, { validUntilChapter: s.validUntilChapter }).catch(
            (err: any) => console.warn('[commitSync] could not close superseded edge:', err)
          )
        }
        for (const e of plan.inserts) {
          await graphStore.addEdgeData(resolvedProjectId, e)
        }
        // The volume subgraph reads from `graphEdges`, which the inserts above
        // already populate with the volume stamped on — the second write through
        // the volume store was what produced the duplicate row.
      }

      pendingChanges.value = []
      return true
    } finally {
      isCommitting.value = false
    }
  }

  return {
    pendingChanges,
    isDiscovering,
    isCommitting,
    discoverSync,
    commitSync
  }
}
