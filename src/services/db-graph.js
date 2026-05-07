import { db } from './db-core'
import { deepPlain } from './db-core'

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
  return db.graphEdges.add({ projectId, ...data })
}

export async function updateGraphEdge(id, data) {
  return db.graphEdges.update(id, data)
}

export async function deleteGraphEdge(id) {
  return db.graphEdges.delete(id)
}

export async function clearAllGraphEdges(projectId) {
  const allEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
  const edgeIds = allEdges.map(e => e.id)
  if (edgeIds.length > 0) {
    await db.graphEdges.bulkDelete(edgeIds)
  }
  return edgeIds.length
}

// ========== NODE POSITIONS ==========

export async function getNodePositions(projectId) {
  const result = await db.nodePositions.where('projectId').equals(projectId).first()
  return result?.positions || {}
}

export async function saveNodePositions(projectId, positions) {
  const plainPositions = deepPlain(positions)
  const existing = await db.nodePositions.where('projectId').equals(projectId).first()
  if (existing) {
    return db.nodePositions.update(existing.id, { positions: plainPositions })
  } else {
    return db.nodePositions.add({ projectId, positions: plainPositions })
  }
}

export async function getNodeInstances(projectId) {
  const result = await db.nodePositions.where('projectId').equals(projectId).first()
  return result?.instances || {}
}

export async function saveNodeInstances(projectId, instances) {
  const plainInstances = deepPlain(instances)
  const existing = await db.nodePositions.where('projectId').equals(projectId).first()
  if (existing) {
    return db.nodePositions.update(existing.id, { instances: plainInstances })
  } else {
    return db.nodePositions.add({ projectId, instances: plainInstances })
  }
}

// ========== GRAPH GROUPS ==========

export async function getGraphGroups(projectId) {
  const result = await db.graphGroups.where('projectId').equals(projectId).first()
  return result?.groups || []
}

export async function saveGraphGroups(projectId, groups) {
  const plainGroups = deepPlain(groups)
  const existing = await db.graphGroups.where('projectId').equals(projectId).first()
  if (existing) {
    return db.graphGroups.update(existing.id, { groups: plainGroups })
  } else {
    return db.graphGroups.add({ projectId, groups: plainGroups })
  }
}

export async function getNodeParents(projectId) {
  const result = await db.graphGroups.where('projectId').equals(projectId).first()
  return result?.nodeParents || {}
}

export async function saveNodeParents(projectId, nodeParents) {
  const plainParents = deepPlain(nodeParents)
  const existing = await db.graphGroups.where('projectId').equals(projectId).first()
  if (existing) {
    return db.graphGroups.update(existing.id, { nodeParents: plainParents })
  } else {
    return db.graphGroups.add({ projectId, groups: [], nodeParents: plainParents })
  }
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
