import { ref, toRaw } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStoryNetworkStore } from '../stores/volumeStoryNetworkStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useProjectStore } from '../stores/projectStore'
import { db, deepPlain } from '../services/dbService'

const TARGET_TABLES = [
  db.characters,
  db.locations,
  db.plotThreads,
  db.nodePositions,
  db.volumeEntities
]

function buildNameToIdMap(bibleStore) {
  const map = {}
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

function lowerSet(arr) {
  return new Set((arr || []).map((s) => s.toLowerCase().trim()))
}

export function useChapterGenerationSync() {
  const pendingChanges = ref([])
  const isDiscovering = ref(false)
  const isCommitting = ref(false)

  function discoverSync(structured) {
    isDiscovering.value = true
    try {
      const bibleStore = useStoryBibleStore()
      const knownCharNames = lowerSet(bibleStore.characters.map((c) => c.name))
      const knownLocNames = lowerSet(bibleStore.locations.map((l) => l.name))
      const knownThreadTitles = lowerSet(bibleStore.plotThreads.map((t) => t.title))

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
  }) {
    isCommitting.value = true
    try {
      const bibleStore = useStoryBibleStore()
      const networkStore = useVolumeStoryNetworkStore()
      const graphStore = useStoryGraphStore()
      const projectStore = useProjectStore()
      const resolvedProjectId = projectId || projectStore.currentProjectId

      const nameToId = { ...buildNameToIdMap(bibleStore) }

      // Deduplicate accepted entities by name within each type
      const seen = { character: new Set(), location: new Set(), plotThread: new Set() }
      const uniqueChanges = acceptedEntities.filter((c) => {
        const key = (c.entity.name || c.entity.title || '').toLowerCase().trim()
        if (seen[c.type].has(key)) return false
        seen[c.type].add(key)
        return true
      })

      async function cleanupFailedEntity(entityId, type, name, preEntityNodeSnapshot) {
        const arr =
          type === 'character'
            ? bibleStore.characters
            : type === 'location'
              ? bibleStore.locations
              : bibleStore.plotThreads
        const idx = arr.findIndex((e) => e.id === entityId)
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
        let entityId = null
        const name = change.entity.name || change.entity.title
        const preEntityNodeSnapshot = deepPlain(toRaw(graphStore.nodeInstances.value))

        try {
          await db.transaction('rw', TARGET_TABLES, async () => {
            if (change.type === 'character') {
              entityId = await bibleStore.addCharacterData(
                resolvedProjectId,
                {
                  name: change.entity.name,
                  role: change.entity.role || 'unknown',
                  description: change.entity.description || ''
                },
                'generated',
                chapterId || null
              )
              const nodeKey = `char-${entityId}`
              nameToId[name] = { id: entityId, type: 'character' }
              if (!graphStore.nodeInstances[nodeKey]) graphStore.nodeInstances[nodeKey] = []
              const instanceKey = `inst-${nodeKey}-${Date.now()}`
              graphStore.nodeInstances[nodeKey].push(instanceKey)
              await graphStore.saveNodeInstances(resolvedProjectId)
            } else if (change.type === 'location') {
              entityId = await bibleStore.addLocationData(
                resolvedProjectId,
                {
                  name: change.entity.name,
                  type: change.entity.type || 'unknown',
                  description: change.entity.description || ''
                },
                'generated',
                chapterId || null
              )
              const nodeKey = `loc-${entityId}`
              nameToId[name] = { id: entityId, type: 'location' }
              if (!graphStore.nodeInstances[nodeKey]) graphStore.nodeInstances[nodeKey] = []
              const instanceKey = `inst-${nodeKey}-${Date.now()}`
              graphStore.nodeInstances[nodeKey].push(instanceKey)
              await graphStore.saveNodeInstances(resolvedProjectId)
            } else if (change.type === 'plotThread') {
              entityId = await bibleStore.addPlotThreadData(
                resolvedProjectId,
                {
                  title: change.entity.title,
                  status: change.entity.status || 'open',
                  summary: change.entity.summary || ''
                },
                'generated',
                chapterId || null
              )
              const nodeKey = `thread-${entityId}`
              nameToId[name] = { id: entityId, type: 'plotThread' }
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

      for (const event of allNetworkEvents) {
        const from = nameToId[event.from]
        const to = nameToId[event.to]
        if (from && to) {
          await networkStore.createVolumeEdge(
            resolvedProjectId,
            from.type,
            from.id,
            to.type,
            to.id,
            event.label || 'relates_to',
            volumeId || null
          )
          await graphStore.addEdgeData(resolvedProjectId, {
            sourceId: String(from.id),
            sourceType: from.type,
            targetId: String(to.id),
            targetType: to.type,
            relationshipType: event.label || 'relates_to',
            description: event.label || '',
            volumeId: volumeId || null
          })
        }
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
