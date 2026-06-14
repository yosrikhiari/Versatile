import { useGraphContext } from '../../useGraphContext'
import { useStoryBibleStore } from '../../../stores/storyBibleStore'
import { debugSnapshot } from '../../../services/debugSnapshot'

export async function getRelationshipContext(entityType) {
  const { getRelationshipContext } = useGraphContext()
  const entities = getEntitiesForType(entityType)
  if (entities.length === 0) {
    debugSnapshot(`context-relationships-${entityType}`, {
      entityType,
      entityCount: 0,
      reason: 'no_entities'
    })
    return ''
  }
  const sampleSize = Math.min(3, entities.length)
  const shuffled = [...entities].sort(() => Math.random() - 0.5)
  const topIds = shuffled.slice(0, sampleSize).map(e => ({ type: entityType, id: e.id }))

  debugSnapshot(`context-relationships-${entityType}`, {
    entityType,
    entityCount: entities.length,
    sampleSize,
    sampledIds: topIds.map(e => e.id)
  })

  try {
    const relationshipContext = await getRelationshipContext(topIds, 2)
    if (relationshipContext) {
      debugSnapshot(`context-relationships-${entityType}-result`, {
        entityType,
        relationshipLength: relationshipContext.length,
        relationshipPreview: relationshipContext.slice(0, 300)
      })
      return `\n\nRelationship context:\n${relationshipContext}\n`
    }
  } catch (e) {
    debugSnapshot(`context-relationships-${entityType}-error`, {
      entityType,
      errorMessage: e?.message || 'Unknown error'
    })
  }
  return ''
}

function getEntitiesForType(entityType) {
  const storyBible = useStoryBibleStore()
  switch (entityType) {
    case 'character': return storyBible.characters
    case 'location': return storyBible.locations
    case 'plotThread': return storyBible.plotThreads
    default: return []
  }
}
