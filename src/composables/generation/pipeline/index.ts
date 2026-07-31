import { buildGenerationContext } from '../context'
import { shapeContext } from '../shaping'
import { buildRelevanceIndex } from '../shaping/semanticRelevance'
import { buildPrompt } from './promptBuilder'
import { executeGeneration } from './modelRunner'
import { entitySchemaRegistry } from '../schemas'
import { DEFAULT_BUDGET_TOKENS } from '../shaping/tokenBudget'

// Tokens, matching the unit `applyTokenBudget` now works in. Values are the old
// character budgets (8000/6000/5000) at the 4:1 ratio they were chosen under.
const ENTITY_BUDGET: Record<string, number> = {
  character: 2000,
  location: 1500,
  plotThread: 1250
}

export interface GenerateEntityOptions {
  manuscriptContext?: any
  tokenBudget?: number
  complexity?: any
  workspaceType?: any
}

export async function generateEntity(
  entityType: any,
  extraInstructions = '',
  options: GenerateEntityOptions = {}
) {
  const schema = (entitySchemaRegistry as Record<string, any>)[entityType]
  if (!schema) throw new Error(`Unknown entity type: ${entityType}`)

  const rawContext = await buildGenerationContext({
    entityType,
    manuscriptContext: options.manuscriptContext || null
  })

  const tokenBudget = options.tokenBudget ?? ENTITY_BUDGET[entityType] ?? DEFAULT_BUDGET_TOKENS

  // Rank entities by relevance to the scene rather than by recency, so the
  // per-type caps in `shapeContext` drop the least relevant rather than the
  // least recently edited. Returns null when embeddings are unavailable or the
  // scores carry no signal, in which case shaping keeps its heuristic order.
  const relevance = await buildRelevanceIndex({
    query: buildRelevanceQuery(rawContext, extraInstructions),
    entities: rawContext.entities || {}
  }).catch(() => null)

  const shapedBundle = shapeContext(rawContext, {
    tokenBudget,
    systemPrompt: schema.systemPrompt,
    relevance
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

/**
 * What entity relevance is measured against: the manuscript the entity will
 * appear in, plus whatever the caller asked for. Both are what actually
 * determines which characters and locations matter for this generation.
 */
function buildRelevanceQuery(rawContext: any, extraInstructions: string): string {
  return [rawContext?.manuscript, extraInstructions, rawContext?.project?.description]
    .filter(Boolean)
    .join('\n\n')
}
