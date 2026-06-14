import { useProjectStore } from '../../../stores/projectStore'
import { getEntityContext } from './entityContext'
import { getManuscriptContext } from './manuscriptContext'
import { getRelationshipContext } from './relationshipContext'
import { debugSnapshot } from '../../../services/debugSnapshot'

export async function buildGenerationContext({ entityType, manuscriptContext }) {
  const entityContext = getEntityContext()
  const relationshipBlock = await getRelationshipContext(entityType)
  const manuscriptBlock = getManuscriptContext(manuscriptContext)
  const project = useProjectStore()

  const result = {
    entityType,
    project: {
      category: project.currentCategory || '',
      description: project.currentDescription || ''
    },
    entities: entityContext,
    relationships: relationshipBlock,
    manuscript: manuscriptBlock,
    narrativeState: null
  }

  debugSnapshot(`context-${entityType}-built`, {
    entityType,
    project: result.project,
    entityCounts: {
      characters: entityContext.characters?.length || 0,
      locations: entityContext.locations?.length || 0,
      plotThreads: entityContext.plotThreads?.length || 0
    },
    characterNames: entityContext.characters?.map(c => c.name) || [],
    locationNames: entityContext.locations?.map(l => l.name) || [],
    plotThreadTitles: entityContext.plotThreads?.map(t => t.title) || [],
    hasRelationshipContext: !!relationshipBlock,
    relationshipsLength: relationshipBlock?.length || 0,
    hasManuscriptContext: !!manuscriptBlock,
    manuscriptLength: manuscriptBlock?.length || 0,
    manuscriptContextProvided: !!manuscriptContext
  })

  return result
}
