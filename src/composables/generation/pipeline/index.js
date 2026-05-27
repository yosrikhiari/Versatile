import { buildGenerationContext } from '../context'
import { shapeContext } from '../shaping'
import { buildPrompt } from './promptBuilder'
import { executeGeneration } from './modelRunner'
import { entitySchemaRegistry } from '../schemas'

export async function generateEntity(entityType, extraInstructions = '', options = {}) {
  const schema = entitySchemaRegistry[entityType]
  if (!schema) throw new Error(`Unknown entity type: ${entityType}`)

  const rawContext = await buildGenerationContext({
    entityType,
    manuscriptContext: options.manuscriptContext || null
  })

  const shapedBundle = shapeContext(rawContext, {
    tokenBudget: options.tokenBudget
  })

  const { userPrompt, systemPrompt } = buildPrompt({
    shapedBundle,
    schema,
    extraInstructions
  })

  return executeGeneration({ userPrompt, systemPrompt, schema })
}
