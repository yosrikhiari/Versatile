import { toRaw } from 'vue'
import { db as _db } from './db-core'
import {
  guardStorageWrite,
  guardStorageWriteBatch
} from '../guardrails/integration/storageGuardrails'

const db = _db as any

// ========== STORY ELEMENTS ==========

export async function getStoryElements(projectId: any) {
  return db.storyElements.where('projectId').equals(projectId).toArray()
}

export async function addStoryElement(projectId: any, data: any) {
  return db.storyElements.add({ projectId, ...data })
}

/**
 * Atomic bulk insert for the canvas sync — one transaction, so a mid-run failure
 * cannot leave the canvas half-populated.
 */
export async function addStoryElementsBatch(projectId: any, elements: any[]) {
  if (!Array.isArray(elements) || elements.length === 0) return []
  const rows = elements.map((e) => ({ projectId, ...e }))
  return db.transaction('rw', db.storyElements, async () => {
    return db.storyElements.bulkAdd(rows, { allKeys: true })
  })
}

export async function updateStoryElement(id: any, data: any) {
  return db.storyElements.update(id, data)
}

export async function deleteStoryElement(id: any) {
  return db.storyElements.delete(id)
}

// ========== GRAPH EDGES ==========

export async function getGraphEdges(projectId: any) {
  return db.graphEdges.where('projectId').equals(projectId).toArray()
}

export async function addGraphEdge(projectId: any, data: any) {
  guardStorageWrite('graphEdges', data, {
    parentValues: { projectId },
    entryPoint: 'db-graph.addGraphEdge'
  })
  return db.graphEdges.add({ projectId, createdAt: new Date().toISOString(), ...data })
}

// Atomic bulk insert for the Story Network stage — one transaction so a mid-run
// failure never leaves a half-written edge set.
export async function addGraphEdgesBatch(projectId: any, edges: any) {
  if (!Array.isArray(edges) || edges.length === 0) return []
  guardStorageWriteBatch('graphEdges', edges, {
    parentValues: { projectId },
    entryPoint: 'db-graph.addGraphEdgesBatch'
  })
  const now = new Date().toISOString()
  const rows = edges.map((e) => ({ projectId, createdAt: now, ...e }))
  return db.transaction('rw', db.graphEdges, async () => {
    return db.graphEdges.bulkAdd(rows, { allKeys: true })
  })
}

export async function updateGraphEdge(id: any, data: any) {
  return db.graphEdges.update(id, data)
}

export async function deleteGraphEdge(id: any) {
  return db.graphEdges.delete(id)
}

export async function deleteGraphEdgesByEntity(projectId: any, entityType: any, entityId: any) {
  const edges = await db.graphEdges
    .where('projectId')
    .equals(projectId)
    .filter(
      (e: any) =>
        (e.sourceType === entityType && e.sourceId === entityId) ||
        (e.targetType === entityType && e.targetId === entityId)
    )
    .toArray()
  if (edges.length > 0) {
    await db.graphEdges.bulkDelete(edges.map((e: any) => e.id))
  }
  return edges.length
}

function getNodePrefix(entityType: any) {
  if (entityType === 'character') return 'char'
  if (entityType === 'location') return 'loc'
  return 'thread'
}

export async function removeEntityFromNodeInstances(projectId: any, entityType: any, entityId: any) {
  const prefix = getNodePrefix(entityType)
  const nodeId = `${prefix}-${entityId}`
  await db.graphNodeInstances.delete([projectId, nodeId])
}

export async function removeEntityFromNodePositions(projectId: any, entityType: any, entityId: any) {
  const prefix = getNodePrefix(entityType)
  const nodeId = `${prefix}-${entityId}`
  await db.graphNodePositions.delete([projectId, nodeId])
}

export async function removeEntityFromNodeParents(projectId: any, entityType: any, entityId: any) {
  const prefix = getNodePrefix(entityType)
  const nodeId = `${prefix}-${entityId}`
  await db.graphNodeParents.delete([projectId, nodeId])
}

export async function clearAllGraphEdges(projectId: any) {
  const allEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
  const edgeIds = allEdges.map((e: any) => e.id)
  if (edgeIds.length > 0) {
    await db.graphEdges.bulkDelete(edgeIds)
  }
  return edgeIds.length
}

// ========== NODE POSITIONS ==========

export async function getNodePositions(projectId: any) {
  const rows = await db.graphNodePositions.where('projectId').equals(projectId).toArray()
  const result: any = {}
  for (const row of rows) {
    result[row.nodeId] = { x: row.x, y: row.y }
  }
  return result
}

export async function saveNodePositions(projectId: any, positions: any) {
  const plainPositions = JSON.parse(JSON.stringify(toRaw(positions)))
  const rows = Object.entries(plainPositions).map(([nodeId, pos]: [string, any]) => ({
    projectId,
    nodeId,
    nodeType: nodeId.startsWith('char-')
      ? 'character'
      : nodeId.startsWith('loc-')
        ? 'location'
        : 'plotThread',
    x: pos.x ?? 0,
    y: pos.y ?? 0
  }))
  await db.transaction('rw', db.graphNodePositions, async () => {
    await db.graphNodePositions.where('projectId').equals(projectId).delete()
    if (rows.length > 0) {
      await db.graphNodePositions.bulkAdd(rows)
    }
  })
}

export async function getNodeInstances(projectId: any) {
  const rows = await db.graphNodeInstances.where('projectId').equals(projectId).toArray()
  const result: any = {}
  for (const row of rows) {
    result[row.nodeId] = [row.nodeId]
  }
  return result
}

export async function saveNodeInstances(projectId: any, instances: any) {
  const plainInstances = JSON.parse(JSON.stringify(toRaw(instances)))
  const rows = Object.keys(plainInstances).map((nodeId) => ({
    projectId,
    nodeId
  }))
  await db.transaction('rw', db.graphNodeInstances, async () => {
    await db.graphNodeInstances.where('projectId').equals(projectId).delete()
    if (rows.length > 0) {
      await db.graphNodeInstances.bulkAdd(rows)
    }
  })
}

// ========== GRAPH GROUPS ==========

export async function getGraphGroups(projectId: any) {
  const rows = await db.graphGroupsV2.where('projectId').equals(projectId).toArray()
  return rows
    .sort((a: any, b: any) => a.groupOrder - b.groupOrder)
    .map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      // Neither of these survived a round-trip before, and both are structural.
      // `volumeId` is how `computeVolumeGroups` recognises a volume's existing
      // group — without it, regrouping after a reload built a SECOND group with
      // the same `group-vol-N` id and the bulkAdd blew up on the duplicate key.
      // `parentGroupId` is what makes a group nested; dropping it silently
      // flattened the hierarchy every time the project was reopened.
      volumeId: r.volumeId ?? null,
      parentVolumeId: r.parentVolumeId ?? null,
      parentGroupId: r.parentGroupId ?? null
    }))
}

export async function saveGraphGroups(projectId: any, groups: any) {
  const plainGroups = JSON.parse(JSON.stringify(toRaw(groups)))
  const rows = plainGroups.map((g: any, i: any) => ({
    id: g.id,
    projectId,
    name: g.name || '',
    color: g.color || '#6e8bb5',
    x: g.x ?? 100,
    y: g.y ?? 100,
    width: g.width ?? 300,
    height: g.height ?? 200,
    volumeId: g.volumeId ?? null,
    parentVolumeId: g.parentVolumeId ?? null,
    parentGroupId: g.parentGroupId ?? null,
    groupOrder: i
  }))
  await db.transaction('rw', db.graphGroupsV2, async () => {
    await db.graphGroupsV2.where('projectId').equals(projectId).delete()
    if (rows.length > 0) {
      await db.graphGroupsV2.bulkAdd(rows)
    }
  })
}

export async function getNodeParents(projectId: any) {
  const rows = await db.graphNodeParents.where('projectId').equals(projectId).toArray()
  const result: any = {}
  for (const row of rows) {
    result[row.nodeId] = row.groupId
  }
  return result
}

export async function saveNodeParents(projectId: any, nodeParents: any) {
  const plainParents = JSON.parse(JSON.stringify(toRaw(nodeParents)))
  const rows = Object.entries(plainParents)
    .filter(([, groupId]) => groupId != null)
    .map(([nodeId, groupId]) => ({
      projectId,
      nodeId,
      nodeType: nodeId.startsWith('char-')
        ? 'character'
        : nodeId.startsWith('loc-')
          ? 'location'
          : 'plotThread',
      groupId: String(groupId)
    }))
  await db.transaction('rw', db.graphNodeParents, async () => {
    await db.graphNodeParents.where('projectId').equals(projectId).delete()
    if (rows.length > 0) {
      await db.graphNodeParents.bulkAdd(rows)
    }
  })
}

// ========== GROUP EDGES ==========

export async function getGroupEdges(projectId: any) {
  return db.groupEdges.where('projectId').equals(projectId).toArray()
}

export async function addGroupEdge(projectId: any, data: any) {
  const now = new Date().toISOString()
  return db.groupEdges.add({ projectId, createdAt: now, ...data })
}

export async function updateGroupEdge(id: any, data: any) {
  return db.groupEdges.update(id, data)
}

export async function deleteGroupEdge(id: any) {
  return db.groupEdges.delete(id)
}

export { getNodePrefix }
