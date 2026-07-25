import { toRaw } from 'vue'
import { db } from './db-core'

// ========== STORY ELEMENTS ==========

export async function getStoryElements(projectId) {
  return db.storyElements.where('projectId').equals(projectId).toArray()
}

export async function addStoryElement(projectId, data) {
  return db.storyElements.add({ projectId, ...data })
}

export async function updateStoryElement(id, data) {
  return db.storyElements.update(id, data)
}

export async function deleteStoryElement(id) {
  return db.storyElements.delete(id)
}

// ========== GRAPH EDGES ==========

export async function getGraphEdges(projectId) {
  return db.graphEdges.where('projectId').equals(projectId).toArray()
}

export async function addGraphEdge(projectId, data) {
  return db.graphEdges.add({ projectId, createdAt: new Date().toISOString(), ...data })
}

// Atomic bulk insert for the Story Network stage — one transaction so a mid-run
// failure never leaves a half-written edge set.
export async function addGraphEdgesBatch(projectId, edges) {
  if (!Array.isArray(edges) || edges.length === 0) return []
  const now = new Date().toISOString()
  const rows = edges.map((e) => ({ projectId, createdAt: now, ...e }))
  return db.transaction('rw', db.graphEdges, async () => {
    return db.graphEdges.bulkAdd(rows, { allKeys: true })
  })
}

export async function updateGraphEdge(id, data) {
  return db.graphEdges.update(id, data)
}

export async function deleteGraphEdge(id) {
  return db.graphEdges.delete(id)
}

export async function deleteGraphEdgesByEntity(projectId, entityType, entityId) {
  const edges = await db.graphEdges
    .where('projectId')
    .equals(projectId)
    .filter(
      (e) =>
        (e.sourceType === entityType && e.sourceId === entityId) ||
        (e.targetType === entityType && e.targetId === entityId)
    )
    .toArray()
  if (edges.length > 0) {
    await db.graphEdges.bulkDelete(edges.map((e) => e.id))
  }
  return edges.length
}

function getNodePrefix(entityType) {
  if (entityType === 'character') return 'char'
  if (entityType === 'location') return 'loc'
  return 'thread'
}

export async function removeEntityFromNodeInstances(projectId, entityType, entityId) {
  const prefix = getNodePrefix(entityType)
  const nodeId = `${prefix}-${entityId}`
  await db.graphNodeInstances.delete([projectId, nodeId])
}

export async function removeEntityFromNodePositions(projectId, entityType, entityId) {
  const prefix = getNodePrefix(entityType)
  const nodeId = `${prefix}-${entityId}`
  await db.graphNodePositions.delete([projectId, nodeId])
}

export async function removeEntityFromNodeParents(projectId, entityType, entityId) {
  const prefix = getNodePrefix(entityType)
  const nodeId = `${prefix}-${entityId}`
  await db.graphNodeParents.delete([projectId, nodeId])
}

export async function clearAllGraphEdges(projectId) {
  const allEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
  const edgeIds = allEdges.map((e) => e.id)
  if (edgeIds.length > 0) {
    await db.graphEdges.bulkDelete(edgeIds)
  }
  return edgeIds.length
}

// ========== NODE POSITIONS ==========

export async function getNodePositions(projectId) {
  const rows = await db.graphNodePositions.where('projectId').equals(projectId).toArray()
  const result = {}
  for (const row of rows) {
    result[row.nodeId] = { x: row.x, y: row.y }
  }
  return result
}

export async function saveNodePositions(projectId, positions) {
  const plainPositions = JSON.parse(JSON.stringify(toRaw(positions)))
  const rows = Object.entries(plainPositions).map(([nodeId, pos]) => ({
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

export async function getNodeInstances(projectId) {
  const rows = await db.graphNodeInstances.where('projectId').equals(projectId).toArray()
  const result = {}
  for (const row of rows) {
    result[row.nodeId] = true
  }
  return result
}

export async function saveNodeInstances(projectId, instances) {
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

export async function getGraphGroups(projectId) {
  const rows = await db.graphGroupsV2.where('projectId').equals(projectId).toArray()
  return rows
    .sort((a, b) => a.groupOrder - b.groupOrder)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height
    }))
}

export async function saveGraphGroups(projectId, groups) {
  const plainGroups = JSON.parse(JSON.stringify(toRaw(groups)))
  const rows = plainGroups.map((g, i) => ({
    id: g.id,
    projectId,
    name: g.name || '',
    color: g.color || '#6e8bb5',
    x: g.x ?? 100,
    y: g.y ?? 100,
    width: g.width ?? 300,
    height: g.height ?? 200,
    groupOrder: i
  }))
  await db.transaction('rw', db.graphGroupsV2, async () => {
    await db.graphGroupsV2.where('projectId').equals(projectId).delete()
    if (rows.length > 0) {
      await db.graphGroupsV2.bulkAdd(rows)
    }
  })
}

export async function getNodeParents(projectId) {
  const rows = await db.graphNodeParents.where('projectId').equals(projectId).toArray()
  const result = {}
  for (const row of rows) {
    result[row.nodeId] = row.groupId
  }
  return result
}

export async function saveNodeParents(projectId, nodeParents) {
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

export async function getGroupEdges(projectId) {
  return db.groupEdges.where('projectId').equals(projectId).toArray()
}

export async function addGroupEdge(projectId, data) {
  const now = new Date().toISOString()
  return db.groupEdges.add({ projectId, createdAt: now, ...data })
}

export async function updateGroupEdge(id, data) {
  return db.groupEdges.update(id, data)
}

export async function deleteGroupEdge(id) {
  return db.groupEdges.delete(id)
}

export { getNodePrefix }
