import { db as _db } from './db-core'

const db = _db as any

export async function getVolumeEntities(_projectId: string | null, volumeId: string, entityType: string | null = null) {
  let query = db.volumeEntities.where('volumeId').equals(volumeId)
  if (entityType) {
    query = query.filter((item: any) => item.entityType === entityType)
  }
  const entities = await query.toArray()
  const results = await Promise.all(
    entities.map(async (item: any) => {
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
      return entity
        ? {
            ...entity,
            volumeAssignment: { isPrimary: item.isPrimary, assignedAt: item.assignedAt }
          }
        : null
    })
  )
  return results.filter(Boolean)
}

export async function addEntityToVolume(
  // Vestigial — volume rows are keyed by volumeId; callers pass null.
  _projectId: string | null,
  entityType: string,
  entityId: string,
  volumeId: string,
  isPrimary = false
) {
  const now = new Date().toISOString()
  const existing = await db.volumeEntities
    .where('volumeId')
    .equals(volumeId)
    .and((item: any) => item.entityType === entityType && item.entityId === entityId)
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

export async function removeEntityFromVolume(entityType: string, entityId: string, volumeId: string) {
  return db.volumeEntities
    .where('volumeId')
    .equals(volumeId)
    .and((item: any) => item.entityType === entityType && item.entityId === entityId)
    .delete()
}

export async function removeEntityFromAllVolumes(entityType: string, entityId: string) {
  return db.volumeEntities
    .where('entityType')
    .equals(entityType)
    .and((item: any) => item.entityId === entityId)
    .delete()
}

export async function getEntityVolumes(entityType: string, entityId: string) {
  const assignments = await db.volumeEntities
    .where('entityType')
    .equals(entityType)
    .and((item: any) => item.entityId === entityId)
    .toArray()
  return assignments.map((a: any) => a.volumeId)
}

export async function getVolumeEntityCount(volumeId: string, entityType: string | null = null) {
  let query = db.volumeEntities.where('volumeId').equals(volumeId)
  if (entityType) {
    query = query.filter((item: any) => item.entityType === entityType)
  }
  return query.count()
}

export async function getVolumeEdgeCount(volumeId: string, includeGlobal = false) {
  if (includeGlobal) {
    return db.graphEdges.where('volumeId').equals(volumeId).or('volumeId').equals(null).count()
  }
  return db.graphEdges.where('volumeId').equals(volumeId).count()
}

export async function addVolumeEdge(
  projectId: string,
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  relationshipType: string,
  volumeId: string | null = null
) {
  const existing = await db.graphEdges
    .where('sourceId')
    .equals(sourceId)
    .and((e: any) => e.sourceType === sourceType)
    .filter((e: any) => e.targetId === targetId)
    .and((e: any) => e.targetType === targetType)
    .and((e: any) => e.relationshipType === relationshipType)
    .and((e: any) => e.volumeId === volumeId)
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

export async function updateVolumeEdgeVolume(edgeId: string, newVolumeId: string) {
  return db.graphEdges.update(edgeId, { volumeId: newVolumeId })
}

export async function getVolumeEdges(volumeId: string, includeGlobal = true) {
  if (includeGlobal) {
    return db.graphEdges.where('volumeId').equals(volumeId).or('volumeId').equals(null).toArray()
  }
  return db.graphEdges.where('volumeId').equals(volumeId).toArray()
}
