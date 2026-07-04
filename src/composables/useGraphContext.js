import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'

export function useGraphContext() {
  const storyGraphStore = useStoryGraphStore()
  const storyBibleStore = useStoryBibleStore()

  function getEntityTypePrefix(type) {
    switch (type) {
      case 'character':
        return 'char'
      case 'location':
        return 'loc'
      case 'plotThread':
        return 'thread'
      default:
        return 'unknown'
    }
  }

  function parseNodeId(nodeId) {
    const [prefix, ...idParts] = nodeId.split('-')
    const id = idParts.join('-')

    let type
    switch (prefix) {
      case 'char':
        type = 'character'
        break
      case 'loc':
        type = 'location'
        break
      case 'thread':
        type = 'plotThread'
        break
      default:
        return null
    }

    return { type, id: parseInt(id, 10) }
  }

  function buildNodeId(type, id) {
    return `${getEntityTypePrefix(type)}-${id}`
  }

  function getEntityName(type, id) {
    switch (type) {
      case 'character': {
        const entity = storyBibleStore.characters.find((c) => c.id === id)
        return entity?.name || `Character ${id}`
      }
      case 'location': {
        const entity = storyBibleStore.locations.find((l) => l.id === id)
        return entity?.name || `Location ${id}`
      }
      case 'plotThread': {
        const entity = storyBibleStore.plotThreads.find((t) => t.id === id)
        return entity?.title || `Plot ${id}`
      }
      default:
        return `Entity ${id}`
    }
  }

  const relationshipLabels = {
    ally: 'allied with',
    enemy: 'opposed to',
    family: 'family of',
    romantic: 'romantically connected to',
    mentor: 'mentors',
    rival: 'rivals with',
    neutral: 'neutral toward',
    appears_in: 'appears in',
    involved_in: 'involved in',
    located_at: 'located at',
    connects_to: 'connected to',
    intersects_with: 'intersects with',
    features: 'features'
  }

  function getRelationshipLabel(relationshipType) {
    return relationshipLabels[relationshipType] || relationshipType
  }

  function getNeighbors(nodeId) {
    const neighbors = []

    for (const edge of storyGraphStore.edges) {
      const sourceId = buildNodeId(edge.sourceType, edge.sourceId)
      const targetId = buildNodeId(edge.targetType, edge.targetId)

      if (sourceId === nodeId) {
        neighbors.push({
          nodeId: targetId,
          relationship: edge.relationshipType,
          fromNode: nodeId,
          toNode: targetId
        })
      } else if (targetId === nodeId) {
        neighbors.push({
          nodeId: sourceId,
          relationship: edge.relationshipType,
          fromNode: nodeId,
          toNode: sourceId
        })
      }
    }

    return neighbors
  }

  function serializePath(pathNodes) {
    if (pathNodes.length === 0) return ''

    const parts = []

    for (let i = 0; i < pathNodes.length; i++) {
      const node = pathNodes[i]
      const parsed = parseNodeId(node.nodeId)

      if (!parsed) continue

      parts.push(getEntityName(parsed.type, parsed.id))

      if (i < pathNodes.length - 1) {
        parts.push('→', getRelationshipLabel(node.relationship))
      }
    }

    return parts.join(' ')
  }

  async function getRelationshipContext(entityIds, depth = 2) {
    if (!entityIds || entityIds.length === 0) {
      return ''
    }

    const startNodeIds = entityIds.map((e) => buildNodeId(e.type, e.id))

    const visited = new Set(startNodeIds)
    const allPaths = []

    const queue = startNodeIds.map((startId) => ({
      nodeId: startId,
      path: [{ nodeId: startId, relationship: null }],
      depth: 0
    }))

    while (queue.length > 0) {
      const current = queue.shift()

      if (current.depth >= depth) continue

      const neighbors = getNeighbors(current.nodeId)

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.nodeId)) continue

        visited.add(neighbor.nodeId)

        const newPath = [
          ...current.path,
          { nodeId: neighbor.nodeId, relationship: neighbor.relationship }
        ]

        allPaths.push(newPath)

        queue.push({
          nodeId: neighbor.nodeId,
          path: newPath,
          depth: current.depth + 1
        })
      }
    }

    if (allPaths.length === 0) {
      return ''
    }

    const serializedPaths = allPaths.map((path) => serializePath(path)).filter((s) => s.length > 0)

    if (serializedPaths.length === 0) {
      return ''
    }

    return serializedPaths.join('\n')
  }

  async function getEntityRelationshipContext(entityType, entityId, depth = 2) {
    return getRelationshipContext([{ type: entityType, id: entityId }], depth)
  }

  return {
    getRelationshipContext,
    getEntityRelationshipContext,
    getEntityName,
    buildNodeId,
    parseNodeId,
    getEntityTypePrefix,
    getRelationshipLabel
  }
}
