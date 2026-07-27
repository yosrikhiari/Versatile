import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getVolumeEntities,
  getVolumeEntityCount,
  getVolumeEdges,
  addEntityToVolume,
  removeEntityFromVolume,
  removeEntityFromAllVolumes,
  addVolumeEdge
} from '../services/dbService'

export const useVolumeStoryNetworkStore = defineStore('volumeStoryNetwork', () => {
  const volumeEntities = ref<Record<string, any>>({}) // volumeId -> entity list
  const volumeEdges = ref<Record<string, any>>({}) // volumeId -> edge list
  const loading = ref(false)

  async function loadVolumeEntities(volumeId: any, entityType: any = null) {
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

  async function loadVolumeEdges(volumeId: any, includeGlobal: any = true) {
    loading.value = true
    try {
      const edges = await getVolumeEdges(volumeId, includeGlobal)
      volumeEdges.value[volumeId] = edges
      return edges
    } finally {
      loading.value = false
    }
  }

  async function loadVolumeSubgraph(volumeId: any, options: any = {}) {
    const { includeGlobalEdges = true, entityTypes = ['character', 'location', 'plotThread'] } =
      options

    loading.value = true
    try {
      // Load all entity types
      const entities: any[] = []
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

  async function assignEntityToVolume(entityType: any, entityId: any, volumeId: any, isPrimary: any = false) {
    const id = await addEntityToVolume(null, entityType, entityId, volumeId, isPrimary)
    // Invalidate cache
    if (volumeEntities.value[volumeId]) {
      delete volumeEntities.value[volumeId][entityType]
      delete volumeEntities.value[volumeId].all
    }
    return id
  }

  async function removeEntityFromVolumeAction(entityType: any, entityId: any, volumeId: any) {
    await removeEntityFromVolume(entityType, entityId, volumeId)
    // Invalidate cache
    if (volumeEntities.value[volumeId]) {
      delete volumeEntities.value[volumeId][entityType]
      delete volumeEntities.value[volumeId].all
    }
  }

  async function removeEntityFromAllVolumesAction(entityType: any, entityId: any) {
    await removeEntityFromAllVolumes(entityType, entityId)
    // Invalidate all caches
    for (const volId in volumeEntities.value) {
      delete volumeEntities.value[volId][entityType]
      delete volumeEntities.value[volId].all
    }
  }

  async function createVolumeEdge(
    projectId: any,
    sourceType: any,
    sourceId: any,
    targetType: any,
    targetId: any,
    relationshipType: any,
    volumeId: any = null
  ) {
    const id = await addVolumeEdge(
      projectId,
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationshipType,
      volumeId
    )
    // Invalidate edge cache for this volume
    if (volumeId !== null) {
      delete volumeEdges.value[volumeId]
    }
    return id
  }

  function getCachedEntities(volumeId: any, entityType: any = null) {
    if (!volumeEntities.value[volumeId]) return []
    if (entityType) {
      return volumeEntities.value[volumeId][entityType] || []
    }
    return volumeEntities.value[volumeId].all || []
  }

  function getCachedEdges(volumeId: any) {
    return volumeEdges.value[volumeId] || []
  }

  async function applyEventToVolumeNetwork(event: any, volumeId: any, nameToId: any, projectId: any) {
    if (!event.from || !event.to) return null

    const from = nameToId[event.from]
    const to = nameToId[event.to]
    if (!from || !to) {
      console.warn(
        `[volumeStoryNetwork] Could not resolve network event: ${event.from} -> ${event.to}`
      )
      return null
    }

    // Assign both entities to volume if not already (idempotent at db level)
    await assignEntityToVolume(from.type, from.id, volumeId, false).catch(() =>
      console.warn(
        `[volumeStoryNetwork] Could not assign ${from.type}:${from.id} to volume ${volumeId}`
      )
    )
    await assignEntityToVolume(to.type, to.id, volumeId, false).catch(() =>
      console.warn(
        `[volumeStoryNetwork] Could not assign ${to.type}:${to.id} to volume ${volumeId}`
      )
    )

    // Create the edge
    try {
      const edgeId = await createVolumeEdge(
        projectId,
        from.type,
        from.id,
        to.type,
        to.id,
        event.label || 'relates_to',
        volumeId
      )
      return edgeId
    } catch (err) {
      console.error(
        `[volumeStoryNetwork] Failed to create edge for ${event.from} -> ${event.to}:`,
        err
      )
      return null
    }
  }

  async function getVolumeEntityCounts(volumeId: any) {
    const counts: Record<string, any> = {}
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
    applyEventToVolumeNetwork,

    // Cached getters
    getCachedEntities,
    getCachedEdges,
    getVolumeEntityCounts
  }
})
