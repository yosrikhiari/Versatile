import { buildGenerationContext } from '../context'
import { shapeContext } from '../shaping'
import { buildPrompt } from './promptBuilder'
import { executeGeneration } from './modelRunner'
import { entitySchemaRegistry } from '../schemas'
import { debugSnapshot } from '../../../services/debugSnapshot'

export async function generateEntity(entityType, extraInstructions = '', options = {}) {
  const schema = entitySchemaRegistry[entityType]
  if (!schema) throw new Error(`Unknown entity type: ${entityType}`)

  debugSnapshot(`entity-gen-${entityType}-start`, {
    entityType,
    extraInstructionsLength: extraInstructions.length,
    hasManuscriptContext: !!options.manuscriptContext,
    optionsTokenBudget: options.tokenBudget
  })

  const rawContext = await buildGenerationContext({
    entityType,
    manuscriptContext: options.manuscriptContext || null
  })

  debugSnapshot(`entity-gen-${entityType}-raw-context`, {
    entityType,
    entityCount: {
      characters: rawContext.entities?.characters?.length || 0,
      locations: rawContext.entities?.locations?.length || 0,
      plotThreads: rawContext.entities?.plotThreads?.length || 0
    },
    projectCategory: rawContext.project?.category || '',
    projectDescription: rawContext.project?.description || '',
    manuscriptLength: rawContext.manuscript?.length || 0,
    relationshipsLength: rawContext.relationships?.length || 0
  })

  const shapedBundle = shapeContext(rawContext, {
    tokenBudget: options.tokenBudget
  })

  debugSnapshot(`entity-gen-${entityType}-shaped-context`, {
    entityType,
    shapes: {
      projectBlockLength: shapedBundle.projectBlock?.length || 0,
      charactersBlockLength: shapedBundle.charactersBlock?.length || 0,
      locationsBlockLength: shapedBundle.locationsBlock?.length || 0,
      plotThreadsBlockLength: shapedBundle.plotThreadsBlock?.length || 0,
      relationshipsBlockLength: shapedBundle.relationshipsBlock?.length || 0,
      manuscriptBlockLength: shapedBundle.manuscriptBlock?.length || 0
    }
  })

  const { userPrompt, systemPrompt } = buildPrompt({
    shapedBundle,
    schema,
    extraInstructions
  })

  debugSnapshot(`entity-gen-${entityType}-prompt`, {
    entityType,
    systemPrompt,
    userPrompt,
    extraInstructions,
    schemaPromptKeys: schema.promptKeys,
    schemaModelKeys: schema.modelKeys
  })

  const result = await executeGeneration({ userPrompt, systemPrompt, schema })

  debugSnapshot(`entity-gen-${entityType}-result`, {
    entityType,
    result
  })

  return result
}
