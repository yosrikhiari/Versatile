import { buildGenerationContext } from '../context'
import { shapeContext } from '../shaping'
import { buildPrompt } from './promptBuilder'
import { executeGeneration } from './modelRunner'
import { entitySchemaRegistry } from '../schemas'
import { DEFAULT_BUDGET_CHARS } from '../shaping/tokenBudget'

const ENTITY_BUDGET = {
  character: 8000,
  location: 6000,
  plotThread: 5000
}

export async function generateEntity(entityType, extraInstructions = '', options = {}) {
  const schema = entitySchemaRegistry[entityType]
  if (!schema) throw new Error(`Unknown entity type: ${entityType}`)

  const rawContext = await buildGenerationContext({
    entityType,
    manuscriptContext: options.manuscriptContext || null
  })

  const tokenBudget = options.tokenBudget ?? ENTITY_BUDGET[entityType] ?? DEFAULT_BUDGET_CHARS

  const shapedBundle = shapeContext(rawContext, {
    tokenBudget,
    systemPrompt: schema.systemPrompt
  })

  const { userPrompt, systemPrompt } = buildPrompt({
    shapedBundle,
    schema,
    extraInstructions
  })

  const result = await executeGeneration({
    userPrompt,
    systemPrompt,
    schema,
    complexity: options.complexity,
    workspaceType: options.workspaceType
  })

  return result
}
