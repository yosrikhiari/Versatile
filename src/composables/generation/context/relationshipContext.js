import { useGraphContext } from '../../useGraphContext'
import { useStoryBibleStore } from '../../../stores/storyBibleStore'

export async function getRelationshipContext(entityType) {
  const { getRelationshipContext } = useGraphContext()
  const entities = getEntitiesForType(entityType)
  if (entities.length === 0) {
    return ''
  }
  const sampleSize = Math.min(3, entities.length)
  const shuffled = [...entities].sort(() => Math.random() - 0.5)
  const topIds = shuffled.slice(0, sampleSize).map((e) => ({ type: entityType, id: e.id }))

  try {
    const relationshipContext = await getRelationshipContext(topIds, 2)
    if (relationshipContext) {
      return `\n\nRelationship context:\n${relationshipContext}\n`
    }
  } catch (e) {}
  return ''
}

function getEntitiesForType(entityType) {
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
