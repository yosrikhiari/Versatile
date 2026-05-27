import { useProjectStore } from '../../../stores/projectStore'
import { getEntityContext } from './entityContext'
import { getManuscriptContext } from './manuscriptContext'
import { getRelationshipContext } from './relationshipContext'

export async function buildGenerationContext({ entityType, manuscriptContext }) {
  const entityContext = getEntityContext()
  const relationshipBlock = await getRelationshipContext(entityType)
  const manuscriptBlock = getManuscriptContext(manuscriptContext)
  const project = useProjectStore()

  return {
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
}
