import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import {
  getGraphEdges,
  addGraphEdge,
  updateGraphEdge,
  deleteGraphEdge,
  clearAllGraphEdges,
  getNodePositions,
  saveNodePositions,
  getNodeInstances,
  saveNodeInstances as dbSaveNodeInstances,
  getGraphGroups,
  saveGraphGroups,
  getNodeParents as dbGetNodeParents,
  saveNodeParents as dbSaveNodeParents,
  getGroupEdges,
  addGroupEdge,
} from '../services/db-graph'
import {
  updateGroupEdge,
  deleteGroupEdge,
  getCharacterRelationships,
  deleteCharacterRelationship,
} from '../services/dbService'
import { syncQueue } from '../services/sync-queue'
import { useStoryBibleStore } from './storyBibleStore'

syncQueue.register('nodePositions', async (_projectId, positions) => {
  await saveNodePositions(_projectId, positions)
})

function typeFromKey(key: any) {
  if (key.startsWith('char')) return 'character'
  if (key.startsWith('loc')) return 'location'
  return 'plotThread'
}

export const useStoryGraphStore = defineStore('storyGraph', () => {
  const edges = ref<any[]>([])
  const groupEdges = ref<any[]>([])
  const nodePositions = ref<Record<string, any>>({})
  const nodeInstances = ref<Record<string, any>>({})
  const selectedEdge = ref<any | null>(null)
  const selectedNode = ref<any | null>(null)
  const missingCharacterPositions = ref<any[]>([])
  const isLoading = ref(false)
  const loadError = ref<any | null>(null)

  async function loadEdges(projectId: any) {
    isLoading.value = true
    loadError.value = null
    try {
      const graphEdgesData = await getGraphEdges(projectId)
      const charRelationshipsData = await getCharacterRelationships(projectId)
      const storyBibleStore = useStoryBibleStore()
      const existingCharIds = new Set(storyBibleStore.characters.map((c: any) => c.id))

      const charEdges = charRelationshipsData
        .filter(
          (rel: any) =>
            existingCharIds.has(rel.fromCharacterId) && existingCharIds.has(rel.toCharacterId)
        )
        .map((rel: any) => ({
          id: `char-rel-${rel.id}`,
          sourceId: rel.fromCharacterId,
          sourceType: 'character',
          targetId: rel.toCharacterId,
          targetType: 'character',
          relationshipType: rel.type,
          description: rel.notes || '',
          isLegacy: true
        }))

      edges.value = [...graphEdgesData, ...charEdges]

      const charIds = new Set()
      for (const edge of charEdges) {
        charIds.add(String(edge.sourceId))
        charIds.add(String(edge.targetId))
      }

      missingCharacterPositions.value = Array.from(charIds)
    } catch (e: any) {
      loadError.value = e.message
      console.error('[storyGraphStore] loadEdges failed:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function loadNodePositions(projectId: any) {
    const positions = await getNodePositions(projectId)
    nodePositions.value = positions || {}
    const storyBibleStore = useStoryBibleStore()
    const cleaned: Record<string, any> = {}
    let changed = false

    const existingCharIds = new Set(storyBibleStore.characters.map((c) => String(c.id)))
    const existingLocIds = new Set(storyBibleStore.locations.map((l) => String(l.id)))
    const existingThreadIds = new Set(storyBibleStore.plotThreads.map((t) => String(t.id)))

    for (const [key, pos] of Object.entries(nodePositions.value)) {
      const type = typeFromKey(key)
      const entityId = key.replace(/^(char|loc|thread)-/, '')
      let exists = false
      if (type === 'character') {
        exists = existingCharIds.has(entityId)
      } else if (type === 'location') {
        exists = existingLocIds.has(entityId)
      } else {
        exists = existingThreadIds.has(entityId)
      }
      if (exists) {
        cleaned[key] = pos
      } else {
        changed = true
      }
    }
    if (changed) {
      nodePositions.value = cleaned
      await saveNodePositions(projectId, toRaw(cleaned))
    }
  }

  function saveNodePosition(projectId: any, nodeId: any, position: any) {
    nodePositions.value[nodeId] = { x: position.x, y: position.y }
    syncQueue.push('nodePositions', projectId, nodePositions.value)
  }

  async function saveAllNodePositions(projectId: any, positions: any) {
    nodePositions.value = positions
    await saveNodePositions(projectId, toRaw(positions))
  }

  async function loadNodeInstances(projectId: any) {
    const instances = await getNodeInstances(projectId)
    const storyBibleStore = useStoryBibleStore()
    const cleaned: Record<string, any> = {}

    const existingCharIds = new Set(storyBibleStore.characters.map((c) => String(c.id)))
    const existingLocIds = new Set(storyBibleStore.locations.map((l) => String(l.id)))
    const existingThreadIds = new Set(storyBibleStore.plotThreads.map((t) => String(t.id)))

    for (const [baseId, instanceIds] of Object.entries(instances || {})) {
      const type = typeFromKey(baseId)
      const entityId = baseId.replace(/^(char|loc|thread)-/, '')
      let exists = false
      if (type === 'character') {
        exists = existingCharIds.has(entityId)
      } else if (type === 'location') {
        exists = existingLocIds.has(entityId)
      } else {
        exists = existingThreadIds.has(entityId)
      }
      if (exists) {
        cleaned[baseId] = instanceIds
      }
    }
    nodeInstances.value = cleaned
    if (Object.keys(cleaned).length < Object.keys(instances || {}).length) {
      await dbSaveNodeInstances(projectId, toRaw(cleaned))
    }
  }

  async function saveNodeInstances(projectId: any) {
    await dbSaveNodeInstances(projectId, toRaw(nodeInstances.value))
  }

  /**
   * Put freshly created entities on the network canvas.
   *
   * The canvas renders only what `nodeInstances` lists, and nothing seeds it
   * outside `initGraph`'s first-run backfill — so an entity written straight to
   * the story bible (by the bootstrapper or the cast expander) existed
   * everywhere except the one view meant to show it, and `groupByVolume` skipped
   * it because it had no instance to place.
   *
   * Only ever ADDS. An entity the user removed from the canvas keeps its own
   * instance list, and re-running this must not resurrect it — which is also why
   * the `initGraph` backfill stays gated on an empty canvas rather than being
   * turned into a general repair.
   */
  async function ensureNodeInstances(projectId: any, baseIds: string[]) {
    if (!projectId || !baseIds?.length) return 0
    let added = 0
    for (const baseId of baseIds) {
      if (!baseId || nodeInstances.value[baseId]) continue
      nodeInstances.value[baseId] = [baseId]
      added++
    }
    if (added > 0) await dbSaveNodeInstances(projectId, toRaw(nodeInstances.value))
    return added
  }

  async function loadGroups(projectId: any) {
    const groups = await getGraphGroups(projectId)
    return groups || []
  }

  async function saveGroups(projectId: any, groups: any) {
    await saveGraphGroups(projectId, toRaw(groups))
  }

  async function loadNodeParents(projectId: any) {
    const parents = await dbGetNodeParents(projectId)
    return parents || {}
  }

  async function saveNodeParents(projectId: any, nodeParents: any) {
    await dbSaveNodeParents(projectId, toRaw(nodeParents))
  }

  async function addEdgeData(projectId: any, edgeData: any) {
    const plainData = toRaw(edgeData)
    const id = await addGraphEdge(projectId, plainData)
    edges.value.push({ id, projectId, ...plainData })
    return id
  }

  async function updateEdgeData(id: any, edgeData: any, _projectId: any) {
    await updateGraphEdge(id, toRaw(edgeData))
    const index = edges.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      edges.value[index] = { ...edges.value[index], ...edgeData }
    }
  }

  async function deleteEdgeData(id: any, _projectId: any) {
    await deleteGraphEdge(id)
    edges.value = edges.value.filter((e) => e.id !== id)
  }

  async function deleteLegacyEdge(legacyId: any) {
    await deleteCharacterRelationship(legacyId)
    edges.value = edges.value.filter((e) => e.id !== `char-rel-${legacyId}`)
  }

  async function clearAllEdges(projectId: any) {
    await clearAllGraphEdges(projectId)
    edges.value = []
  }

  // A graph edge is orphaned when an entity-typed endpoint points at a character/
  // location/plot thread that no longer exists (e.g. the entity was deleted, or the
  // edge leaked in from another project). These render as "Character 42" placeholders
  // and add noise to the network — this finds them without touching anything else.
  // Legacy char↔char edges are already existence-filtered in loadEdges, and edges to
  // groups/other node types are deliberately left alone.
  function findOrphanedEdges() {
    const bible = useStoryBibleStore()
    const existing = {
      character: new Set(bible.characters.map((c) => String(c.id))),
      location: new Set(bible.locations.map((l) => String(l.id))),
      plotThread: new Set(bible.plotThreads.map((t) => String(t.id)))
    }
    const endpointMissing = (type: string, id: any) =>
      (type === 'character' || type === 'location' || type === 'plotThread') &&
      !existing[type].has(String(id))
    return edges.value.filter(
      (e) =>
        !e.isLegacy &&
        (endpointMissing(e.sourceType, e.sourceId) || endpointMissing(e.targetType, e.targetId))
    )
  }

  async function cleanOrphanedEdges(projectId: any) {
    if (!projectId) return { removed: 0 }
    // Work from fresh truth so we never delete based on a stale in-memory list.
    await loadEdges(projectId)
    const orphans = findOrphanedEdges()
    for (const edge of orphans) {
      await deleteGraphEdge(edge.id)
    }
    if (orphans.length > 0) {
      const removedIds = new Set(orphans.map((e) => e.id))
      edges.value = edges.value.filter((e) => !removedIds.has(e.id))
    }
    return { removed: orphans.length }
  }

  function getEdgesForNode(nodeId: any) {
    return edges.value.filter((e) => e.sourceId === nodeId || e.targetId === nodeId)
  }

  function getConnectedNodes(nodeId: any) {
    const connected = []
    for (const edge of edges.value) {
      if (edge.sourceId === nodeId) {
        connected.push({ id: edge.targetId, type: edge.targetType, edge })
      } else if (edge.targetId === nodeId) {
        connected.push({ id: edge.sourceId, type: edge.sourceType, edge })
      }
    }
    return connected
  }

  async function loadGroupEdges(projectId: any) {
    const data = await getGroupEdges(projectId)
    groupEdges.value = data || []
  }

  async function addGroupEdgeData(projectId: any, data: any) {
    const plainData = toRaw(data)
    const id = await addGroupEdge(projectId, plainData)
    groupEdges.value.push({ id, projectId, ...plainData })
    return id
  }

  async function updateGroupEdgeData(id: any, data: any, _projectId: any) {
    await updateGroupEdge(id, toRaw(data))
    const index = groupEdges.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      groupEdges.value[index] = { ...groupEdges.value[index], ...data }
    }
  }

  async function deleteGroupEdgeData(id: any, _projectId: any) {
    await deleteGroupEdge(id)
    groupEdges.value = groupEdges.value.filter((e) => e.id !== id)
  }

  return {
    edges,
    groupEdges,
    nodePositions,
    nodeInstances,
    selectedEdge,
    selectedNode,
    missingCharacterPositions,
    loadEdges,
    loadNodePositions,
    saveNodePosition,
    saveAllNodePositions,
    loadNodeInstances,
    saveNodeInstances,
    ensureNodeInstances,
    loadGroups,
    saveGroups,
    loadNodeParents,
    saveNodeParents,
    addEdgeData,
    updateEdgeData,
    deleteEdgeData,
    deleteLegacyEdge,
    clearAllEdges,
    findOrphanedEdges,
    cleanOrphanedEdges,
    getEdgesForNode,
    getConnectedNodes,
    loadGroupEdges,
    addGroupEdgeData,
    updateGroupEdgeData,
    deleteGroupEdgeData
  }
})
