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

function typeFromKey(key) {
  if (key.startsWith('char')) return 'character'
  if (key.startsWith('loc')) return 'location'
  return 'plotThread'
}

export const useStoryGraphStore = defineStore('storyGraph', () => {
  const edges = ref([])
  const groupEdges = ref([])
  const nodePositions = ref({})
  const nodeInstances = ref({})
  const selectedEdge = ref(null)
  const selectedNode = ref(null)
  const missingCharacterPositions = ref([])
  const isLoading = ref(false)
  const loadError = ref(null)

  async function loadEdges(projectId) {
    isLoading.value = true
    loadError.value = null
    try {
      const graphEdgesData = await getGraphEdges(projectId)
      const charRelationshipsData = await getCharacterRelationships(projectId)
      const storyBibleStore = useStoryBibleStore()
      const existingCharIds = new Set(storyBibleStore.characters.map((c) => c.id))

      const charEdges = charRelationshipsData
        .filter(
          (rel) =>
            existingCharIds.has(rel.fromCharacterId) && existingCharIds.has(rel.toCharacterId)
        )
        .map((rel) => ({
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
    } catch (e) {
      loadError.value = e.message
      console.error('[storyGraphStore] loadEdges failed:', e)
    } finally {
      isLoading.value = false
    }
  }

  async function loadNodePositions(projectId) {
    const positions = await getNodePositions(projectId)
    nodePositions.value = positions || {}
    const storyBibleStore = useStoryBibleStore()
    const cleaned = {}
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

  function saveNodePosition(projectId, nodeId, position) {
    nodePositions.value[nodeId] = { x: position.x, y: position.y }
    syncQueue.push('nodePositions', projectId, nodePositions.value)
  }

  async function saveAllNodePositions(projectId, positions) {
    nodePositions.value = positions
    await saveNodePositions(projectId, toRaw(positions))
  }

  async function loadNodeInstances(projectId) {
    const instances = await getNodeInstances(projectId)
    const storyBibleStore = useStoryBibleStore()
    const cleaned = {}

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

  async function saveNodeInstances(projectId) {
    await dbSaveNodeInstances(projectId, toRaw(nodeInstances.value))
  }

  async function loadGroups(projectId) {
    const groups = await getGraphGroups(projectId)
    return groups || []
  }

  async function saveGroups(projectId, groups) {
    await saveGraphGroups(projectId, toRaw(groups))
  }

  async function loadNodeParents(projectId) {
    const parents = await dbGetNodeParents(projectId)
    return parents || {}
  }

  async function saveNodeParents(projectId, nodeParents) {
    await dbSaveNodeParents(projectId, toRaw(nodeParents))
  }

  async function addEdgeData(projectId, edgeData) {
    const plainData = toRaw(edgeData)
    const id = await addGraphEdge(projectId, plainData)
    edges.value.push({ id, projectId, ...plainData })
    return id
  }

  async function updateEdgeData(id, edgeData, _projectId) {
    await updateGraphEdge(id, toRaw(edgeData))
    const index = edges.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      edges.value[index] = { ...edges.value[index], ...edgeData }
    }
  }

  async function deleteEdgeData(id, _projectId) {
    await deleteGraphEdge(id)
    edges.value = edges.value.filter((e) => e.id !== id)
  }

  async function deleteLegacyEdge(legacyId) {
    await deleteCharacterRelationship(legacyId)
    edges.value = edges.value.filter((e) => e.id !== `char-rel-${legacyId}`)
  }

  async function clearAllEdges(projectId) {
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
    const endpointMissing = (type, id) =>
      (type === 'character' || type === 'location' || type === 'plotThread') &&
      !existing[type].has(String(id))
    return edges.value.filter(
      (e) =>
        !e.isLegacy &&
        (endpointMissing(e.sourceType, e.sourceId) || endpointMissing(e.targetType, e.targetId))
    )
  }

  async function cleanOrphanedEdges(projectId) {
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

  function getEdgesForNode(nodeId) {
    return edges.value.filter((e) => e.sourceId === nodeId || e.targetId === nodeId)
  }

  function getConnectedNodes(nodeId) {
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

  async function loadGroupEdges(projectId) {
    const data = await getGroupEdges(projectId)
    groupEdges.value = data || []
  }

  async function addGroupEdgeData(projectId, data) {
    const plainData = toRaw(data)
    const id = await addGroupEdge(projectId, plainData)
    groupEdges.value.push({ id, projectId, ...plainData })
    return id
  }

  async function updateGroupEdgeData(id, data, _projectId) {
    await updateGroupEdge(id, toRaw(data))
    const index = groupEdges.value.findIndex((e) => e.id === id)
    if (index !== -1) {
      groupEdges.value[index] = { ...groupEdges.value[index], ...data }
    }
  }

  async function deleteGroupEdgeData(id, _projectId) {
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
