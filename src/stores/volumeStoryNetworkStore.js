import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getVolumeEntities,
  getVolumeEntityCount,
  getVolumeEdges,
  addEntityToVolume,
  removeEntityFromVolume,
  removeEntityFromAllVolumes,
  getEntityVolumes,
  getVolumeEdgeCount,
  addVolumeEdge
} from '../services/dbService'

export const useVolumeStoryNetworkStore = defineStore('volumeStoryNetwork', () => {
  const volumeEntities = ref({}) // volumeId -> entity list
  const volumeEdges = ref({})   // volumeId -> edge list
  const loading = ref(false)

  async function loadVolumeEntities(volumeId, entityType = null) {
    loading.value = true
    try {
      const entities = await getVolumeEntities(null, volumeId, entityType)
      if (!volumeEntities.value[volumeId]) {
        volumeEntities.value[volumeId] = {}
      }
      volumeEntities.value[volumeId][entityType || 'all'] = entities
      return entities
    } finally {
      loading.value = false
    }
  }

  async function loadVolumeEdges(volumeId, includeGlobal = true) {
    loading.value = true
    try {
      const edges = await getVolumeEdges(volumeId, includeGlobal)
      volumeEdges.value[volumeId] = edges
      return edges
    } finally {
      loading.value = false
    }
  }

  async function loadVolumeSubgraph(volumeId, options = {}) {
    const {
      includeGlobalEdges = true,
      entityTypes = ['character', 'location', 'plotThread']
    } = options

    loading.value = true
    try {
      // Load all entity types
      const entities = []
      for (const type of entityTypes) {
        const typeEntities = await loadVolumeEntities(volumeId, type)
        entities.push(...typeEntities)
      }

      // Load edges
      const edges = await loadVolumeEdges(volumeId, includeGlobalEdges)

      return {
        entities,
        edges
      }
    } finally {
      loading.value = false
    }
  }

  async function assignEntityToVolume(entityType, entityId, volumeId, isPrimary = false) {
    const id = await addEntityToVolume(null, entityType, entityId, volumeId, isPrimary)
    // Invalidate cache
    if (volumeEntities.value[volumeId]) {
      delete volumeEntities.value[volumeId][entityType]
      delete volumeEntities.value[volumeId].all
    }
    return id
  }

  async function removeEntityFromVolumeAction(entityType, entityId, volumeId) {
    await removeEntityFromVolume(entityType, entityId, volumeId)
    // Invalidate cache
    if (volumeEntities.value[volumeId]) {
      delete volumeEntities.value[volumeId][entityType]
      delete volumeEntities.value[volumeId].all
    }
  }

  async function removeEntityFromAllVolumesAction(entityType, entityId) {
    await removeEntityFromAllVolumes(entityType, entityId)
    // Invalidate all caches
    for (const volId in volumeEntities.value) {
      delete volumeEntities.value[volId][entityType]
      delete volumeEntities.value[volId].all
    }
  }

  async function createVolumeEdge(projectId, sourceType, sourceId, targetType, targetId, relationshipType, volumeId = null) {
    const id = await addVolumeEdge(projectId, sourceType, sourceId, targetType, targetId, relationshipType, volumeId)
    // Invalidate edge cache for this volume
    if (volumeId !== null) {
      delete volumeEdges.value[volumeId]
    }
    return id
  }

  function getCachedEntities(volumeId, entityType = null) {
    if (!volumeEntities.value[volumeId]) return []
    if (entityType) {
      return volumeEntities.value[volumeId][entityType] || []
    }
    return volumeEntities.value[volumeId].all || []
  }

  function getCachedEdges(volumeId) {
    return volumeEdges.value[volumeId] || []
  }

  async function getVolumeEntityCounts(volumeId) {
    const counts = {}
    const types = ['character', 'location', 'plotThread']
    for (const type of types) {
      counts[type] = await getVolumeEntityCount(volumeId, type)
    }
    return counts
  }

  return {
    // State
    volumeEntities,
    volumeEdges,
    loading,

    // Actions
    loadVolumeEntities,
    loadVolumeEdges,
    loadVolumeSubgraph,
    assignEntityToVolume,
    removeEntityFromVolume: removeEntityFromVolumeAction,
    removeEntityFromAllVolumes: removeEntityFromAllVolumesAction,
    createVolumeEdge,

    // Cached getters
    getCachedEntities,
    getCachedEdges,
    getVolumeEntityCounts
  }
})