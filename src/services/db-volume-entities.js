import { db } from './db-core'

export async function getVolumeEntities(projectId, volumeId, entityType = null) {
  let query = db.volumeEntities.where('volumeId').equals(volumeId)
  if (entityType) {
    query = query.filter(item => item.entityType === entityType)
  }
  const entities = await query.toArray()
  const results = await Promise.all(entities.map(async (item) => {
    let entity = null
    switch (item.entityType) {
      case 'character':
        entity = await db.characters.get(item.entityId)
        break
      case 'location':
        entity = await db.locations.get(item.entityId)
        break
      case 'plotThread':
        entity = await db.plotThreads.get(item.entityId)
        break
    }
    return entity ? { ...entity, volumeAssignment: { isPrimary: item.isPrimary, assignedAt: item.assignedAt } } : null
  }))
  return results.filter(Boolean)
}

export async function addEntityToVolume(projectId, entityType, entityId, volumeId, isPrimary = false) {
  const now = new Date().toISOString()
  const existing = await db.volumeEntities
    .where('volumeId').equals(volumeId)
    .and(item => item.entityType === entityType && item.entityId === entityId)
    .first()
    
  if (existing) {
    return existing.id
  }
    
  return db.volumeEntities.add({
    volumeId,
    entityType,
    entityId,
    isPrimary,
    assignedAt: now
  })
}

export async function removeEntityFromVolume(entityType, entityId, volumeId) {
  return db.volumeEntities
    .where('volumeId').equals(volumeId)
    .and(item => item.entityType === entityType && item.entityId === entityId)
    .delete()
}

export async function removeEntityFromAllVolumes(entityType, entityId) {
  return db.volumeEntities
    .where('entityType').equals(entityType)
    .and(item => item.entityId === entityId)
    .delete()
}

export async function getEntityVolumes(entityType, entityId) {
  const assignments = await db.volumeEntities
    .where('entityType').equals(entityType)
    .and(item => item.entityId === entityId)
    .toArray()
  return assignments.map(a => a.volumeId)
}

export async function getVolumeEntityCount(volumeId, entityType = null) {
  let query = db.volumeEntities.where('volumeId').equals(volumeId)
  if (entityType) {
    query = query.filter(item => item.entityType === entityType)
  }
  return query.count()
}

export async function getVolumeEdgeCount(volumeId, includeGlobal = false) {
  if (includeGlobal) {
    return db.graphEdges.where('volumeId').equals(volumeId).or('volumeId').equals(null).count()
  }
  return db.graphEdges.where('volumeId').equals(volumeId).count()
}

export async function addVolumeEdge(projectId, sourceType, sourceId, targetType, targetId, relationshipType, volumeId = null) {
  const existing = await db.graphEdges
    .where('sourceId').equals(sourceId)
    .and(e => e.sourceType === sourceType)
    .filter(e => e.targetId === targetId)
    .and(e => e.targetType === targetType)
    .and(e => e.relationshipType === relationshipType)
    .and(e => e.volumeId === volumeId)
    .first()
    
  if (existing) {
    return existing.id
  }
    
  return db.graphEdges.add({
    projectId,
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationshipType,
    volumeId
  })
}

export async function updateVolumeEdgeVolume(edgeId, newVolumeId) {
  return db.graphEdges.update(edgeId, { volumeId: newVolumeId })
}

export async function getVolumeEdges(volumeId, includeGlobal = true) {
  if (includeGlobal) {
    return db.graphEdges
      .where('volumeId').equals(volumeId)
      .or('volumeId').equals(null)
      .toArray()
  }
  return db.graphEdges.where('volumeId').equals(volumeId).toArray()
}
