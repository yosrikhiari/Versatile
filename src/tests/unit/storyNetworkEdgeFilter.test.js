import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStoryGraphStore } from '../../stores/storyGraphStore'
import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { seedDemoStory } from '../../services/seedDemoStory'

// Replicates the `edges` computed in StoryNetwork.vue to verify the seeder's
// edges survive the component's own filtering (the layer between the DB and the
// canvas). If this produces 0 edges, the bug is in the filter; if it produces
// the expected count, the bug is purely in VueFlow rendering/geometry.
function prefixFromType(type) {
  return type === 'character' ? 'char' : type === 'location' ? 'loc' : 'thread'
}
function getEntityBaseId(type, entityId) {
  return `${prefixFromType(type)}-${entityId}`
}
function getEdgeCategory(edge) {
  const isCharChar = edge.sourceType === 'character' && edge.targetType === 'character'
  const isLocLoc = edge.sourceType === 'location' && edge.targetType === 'location'
  const isThreadThread = edge.sourceType === 'plotThread' && edge.targetType === 'plotThread'
  const isCharLoc =
    (edge.sourceType === 'character' && edge.targetType === 'location') ||
    (edge.sourceType === 'location' && edge.targetType === 'character')
  const isCharThread =
    (edge.sourceType === 'character' && edge.targetType === 'plotThread') ||
    (edge.sourceType === 'plotThread' && edge.targetType === 'character')
  const isLocThread =
    (edge.sourceType === 'location' && edge.targetType === 'plotThread') ||
    (edge.sourceType === 'plotThread' && edge.targetType === 'location')
  if (isCharChar) return 'char'
  if (isLocLoc) return 'loc'
  if (isThreadThread) return 'thread'
  if (isCharLoc) return 'loc'
  if (isCharThread || isLocThread) return 'thread'
  return 'other'
}

describe('StoryNetwork edge filter against seeded demo (100 chapters)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await seedDemoStory({ force: true })
  })

  it('produces visible edges from the seeded graphEdges', async () => {
    const graphStore = useStoryGraphStore()
    const bibleStore = useStoryBibleStore()
    const pid = await (
      await import('../../services/db-core')
    ).db.projects
      .where('name')
      .equals('Demo: The Lighthouse Watch (100 chapters)')
      .first()
      .then((p) => p.id)

    await bibleStore.loadAll(pid)
    await graphStore.loadNodePositions(pid)
    await graphStore.loadNodeInstances(pid)
    await graphStore.loadEdges(pid)

    const nodes = []
    for (const [baseId, instanceIds] of Object.entries(graphStore.nodeInstances)) {
      const ids = Array.isArray(instanceIds) ? instanceIds : [instanceIds]
      for (const instanceId of ids) {
        nodes.push({ id: instanceId, baseId })
      }
    }
    const validNodeIds = new Set(nodes.map((n) => n.id))

    const result = []
    for (const edge of graphStore.edges) {
      const sourceBaseId = getEntityBaseId(edge.sourceType, edge.sourceId)
      const targetBaseId = getEntityBaseId(edge.targetType, edge.targetId)
      const sourceInstances = graphStore.nodeInstances[sourceBaseId] || [sourceBaseId]
      const targetInstances = graphStore.nodeInstances[targetBaseId] || [targetBaseId]
      const validSource = sourceInstances.filter((id) => validNodeIds.has(id))
      const validTarget = targetInstances.filter((id) => validNodeIds.has(id))
      if (validSource.length === 0 || validTarget.length === 0) continue
      const category = getEdgeCategory(edge)
      if (category === 'other') continue
      result.push({ category, source: validSource[0], target: validTarget[0] })
    }

    expect(graphStore.edges.length).toBeGreaterThan(100)
    expect(result.length).toBeGreaterThan(100)
    const cats = new Set(result.map((r) => r.category))
    expect(cats.has('thread')).toBe(true)
    expect(cats.has('char')).toBe(true)
    expect(cats.has('loc')).toBe(true)
  })
})
