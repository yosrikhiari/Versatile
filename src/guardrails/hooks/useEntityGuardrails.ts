import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailKind, GuardrailRunResult } from '../types'

/** A chat reply in an entity's voice — must stay consistent across turns. */
const CHAT_KINDS: GuardrailKind[] = [
  'entity',
  'relationship',
  'cross_turn_consistency',
  'content_safety',
]

/** A generated entity profile that will be written to the store. */
const PROFILE_KINDS: GuardrailKind[] = ['entity', 'schema_conformance', 'character_name']

/** A scene plan — names entities and asserts edges between them. */
const PLAN_KINDS: GuardrailKind[] = ['entity', 'relationship', 'schema_conformance']

type EntityContext = Omit<GuardrailContext, 'layer' | 'kinds'>

/**
 * Guardrails for entity creation, entity-voiced chat, and planning output.
 */
export function useEntityGuardrails() {
  const run = (context: EntityContext, kinds: GuardrailKind[]): Promise<GuardrailRunResult> =>
    GuardrailRegistry.run({ ...context, layer: 'ai_output', kinds })

  return {
    /** Pass `priorTurns` so cross-turn drift can be detected. */
    validateChatResponse: (context: EntityContext) => run(context, CHAT_KINDS),
    validateProfile: (context: EntityContext) => run(context, PROFILE_KINDS),
    validateScenePlan: (context: EntityContext) => run(context, PLAN_KINDS),
    /** Plot diagnoses and scene suggestions — overlay-only, no persistence. */
    validateSuggestion: (context: EntityContext) => run(context, ['entity', 'schema_conformance']),
  }
}
