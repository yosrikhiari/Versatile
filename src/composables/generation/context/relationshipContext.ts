import { useGraphContext } from '../../useGraphContext'
import { useStoryBibleStore } from '../../../stores/storyBibleStore'
import { useStoryGraphStore } from '../../../stores/storyGraphStore'

// How many entities seed the relationship walk. Depth 2 from three well-chosen
// seeds already reaches most of a normal cast; more seeds mostly add paths that
// say the same thing twice.
const SEED_COUNT = 3

/**
 * Seeds for the relationship walk, most-connected first.
 *
 * This used to be `[...entities].sort(() => Math.random() - 0.5).slice(0, 3)` —
 * three entities picked at random, so the relationship context handed to entity
 * generation described a different, arbitrary corner of the story on every call,
 * and could just as easily pick three characters with no edges at all and return
 * nothing. Degree order is deterministic and picks the part of the graph that
 * actually carries the story.
 *
 * (A random comparator is not a shuffle either: `sort` with an inconsistent
 * comparator gives a biased, engine-dependent permutation rather than a uniform
 * one — so it was not even sampling evenly.)
 */
function seedEntities(entities: any[], entityType: any, edges: any[]) {
  const degree = new Map<string, number>()
  const bump = (type: any, id: any) => {
    if (type !== entityType) return
    const key = String(id)
    degree.set(key, (degree.get(key) || 0) + 1)
  }
  for (const e of edges) {
    bump(e.sourceType, e.sourceId)
    bump(e.targetType, e.targetId)
  }
  return [...entities]
    .sort((a, b) => (degree.get(String(b.id)) || 0) - (degree.get(String(a.id)) || 0))
    .slice(0, Math.min(SEED_COUNT, entities.length))
    .map((e) => ({ type: entityType, id: e.id }))
}

export async function getRelationshipContext(entityType: any, atChapter: number | null = null) {
  const { getRelationshipContext } = useGraphContext()
  const entities = getEntitiesForType(entityType)
  if (entities.length === 0) {
    return ''
  }
  const graphStore = useStoryGraphStore()
  const topIds = seedEntities(entities, entityType, (graphStore.edges as any[]) || [])

  try {
    const relationshipContext = await getRelationshipContext(topIds, 2, atChapter)
    if (relationshipContext) {
      return `\n\nRelationship context:\n${relationshipContext}\n`
    }
  } catch (e) {
    console.warn('[relationshipContext] Failed to load relationship context:', e)
  }
  return ''
}

function getEntitiesForType(entityType: any) {
  const storyBible = useStoryBibleStore()
  switch (entityType) {
    case 'character':
      return storyBible.characters
    case 'location':
      return storyBible.locations
    case 'plotThread':
      return storyBible.plotThreads
    default:
      return []
  }
}
