import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { getGraphEdges, addGraphEdge, updateGraphEdge, deleteGraphEdge, clearAllGraphEdges, getNodePositions, saveNodePositions, getNodeInstances, saveNodeInstances as dbSaveNodeInstances, getCharacterRelationships, deleteCharacterRelationship, getGraphGroups, saveGraphGroups, getNodeParents as dbGetNodeParents, saveNodeParents as dbSaveNodeParents, getGroupEdges, addGroupEdge, updateGroupEdge, deleteGroupEdge } from '../services/dbService'
import { useStoryBibleStore } from './storyBibleStore'

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
    const existingCharIds = new Set(storyBibleStore.characters.map(c => c.id))
    
    const charEdges = charRelationshipsData
      .filter(rel => existingCharIds.has(rel.fromCharacterId) && existingCharIds.has(rel.toCharacterId))
      .map(rel => ({
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

    const existingCharIds = new Set(storyBibleStore.characters.map(c => String(c.id)))
    const existingLocIds = new Set(storyBibleStore.locations.map(l => String(l.id)))
    const existingThreadIds = new Set(storyBibleStore.plotThreads.map(t => String(t.id)))

    for (const [key, pos] of Object.entries(nodePositions.value)) {
      const type = key.startsWith('char') ? 'character' : key.startsWith('loc') ? 'location' : 'plotThread'
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

  async function saveNodePosition(projectId, nodeId, position) {
    nodePositions.value[nodeId] = { x: position.x, y: position.y }
    await saveNodePositions(projectId, toRaw(nodePositions.value))
  }

  async function saveAllNodePositions(projectId, positions) {
    nodePositions.value = positions
    await saveNodePositions(projectId, toRaw(positions))
  }

  async function loadNodeInstances(projectId) {
    const instances = await getNodeInstances(projectId)
    const storyBibleStore = useStoryBibleStore()
    const cleaned = {}

    const existingCharIds = new Set(storyBibleStore.characters.map(c => String(c.id)))
    const existingLocIds = new Set(storyBibleStore.locations.map(l => String(l.id)))
    const existingThreadIds = new Set(storyBibleStore.plotThreads.map(t => String(t.id)))

    for (const [baseId, instanceIds] of Object.entries(instances || {})) {
      const type = baseId.startsWith('char') ? 'character' : baseId.startsWith('loc') ? 'location' : 'plotThread'
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

  async function updateEdgeData(id, edgeData, projectId) {
    await updateGraphEdge(id, toRaw(edgeData))
    const index = edges.value.findIndex(e => e.id === id)
    if (index !== -1) {
      edges.value[index] = { ...edges.value[index], ...edgeData }
    }
  }

  async function deleteEdgeData(id, projectId) {
    await deleteGraphEdge(id)
    edges.value = edges.value.filter(e => e.id !== id)
  }

  async function deleteLegacyEdge(legacyId) {
    await deleteCharacterRelationship(legacyId)
    edges.value = edges.value.filter(e => e.id !== `char-rel-${legacyId}`)
  }

  async function clearAllEdges(projectId) {
    await clearAllGraphEdges(projectId)
    edges.value = []
  }

  function getEdgesForNode(nodeId) {
    return edges.value.filter(e => e.sourceId === nodeId || e.targetId === nodeId)
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

  async function updateGroupEdgeData(id, data, projectId) {
    await updateGroupEdge(id, toRaw(data))
    const index = groupEdges.value.findIndex(e => e.id === id)
    if (index !== -1) {
      groupEdges.value[index] = { ...groupEdges.value[index], ...data }
    }
  }

  async function deleteGroupEdgeData(id, projectId) {
    await deleteGroupEdge(id)
    groupEdges.value = groupEdges.value.filter(e => e.id !== id)
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
    getEdgesForNode,
    getConnectedNodes,
    loadGroupEdges,
    addGroupEdgeData,
    updateGroupEdgeData,
    deleteGroupEdgeData
  }
})
