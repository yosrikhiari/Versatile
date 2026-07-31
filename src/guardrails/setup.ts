import { GuardrailRegistry } from './registry'
import { GroundingService } from './ontology/grounding'
import { buildOntologySnapshot, emptySnapshot } from './ontology/instantiate'
import type { OntologySnapshot } from './ontology/types'
import { createEntityGuard } from './guards/entityGuard'
import { createRelationshipGuard } from './guards/relationshipGuard'
import { createSchemaGuard } from './guards/schemaGuard'
import { createFactCanonGuard } from './guards/factCanonGuard'
import { createContentSafetyGuard } from './guards/contentSafetyGuard'
import { createPiiGuard } from './guards/piiGuard'
import { createCrossTurnGuard } from './guards/crossTurnGuard'
import { createCacheGuard } from './guards/cacheGuard'
import { createInputGuard } from './guards/inputGuard'
import { createQualityGuard } from './guards/qualityGuard'
import { createCircuitBreakerGuard } from './guards/circuitBreakerGuard'
import { createIntegrityGuard } from './guards/integrityGuard'
import type { GuardrailKind } from './types'

export interface GuardrailSetupOptions {
  /** Supplies the ontology snapshot guards validate against. Omit for an empty ontology. */
  buildSnapshot?: () => OntologySnapshot
  /** Existing canonical facts, for the fact-canon guard. */
  getFactLedger?: () => string[]
  /** Declared pronouns per canonical entity name, for the cross-turn guard. */
  getPronouns?: () => Record<string, string>
  /** Deployment-specific content lexicon. Empty by default — see `contentSafetyGuard`. */
  blockedTerms?: string[]
  /** Per-session invocation cap for `llm`-cost guards. */
  llmBudget?: number
  /** Register only these kinds. Defaults to all twelve. */
  only?: GuardrailKind[]
}

/**
 * Registers the full guard catalog against a shared `GroundingService`.
 *
 * Call once at app start. Returns the grounding service so the host can swap
 * the snapshot builder when the active project changes.
 */
export function installGuardrails(options: GuardrailSetupOptions = {}): GroundingService {
  const { buildSnapshot, getFactLedger, getPronouns, blockedTerms = [], llmBudget, only } = options

  const grounding = new GroundingService()
  grounding.setBuilder(buildSnapshot ?? (() => emptySnapshot()))
  grounding.refresh()

  if (typeof llmBudget === 'number') GuardrailRegistry.setLlmBudget(llmBudget)

  const wanted = (kind: GuardrailKind): boolean => !only || only.includes(kind)
  const register = GuardrailRegistry.register.bind(GuardrailRegistry)

  if (wanted('entity')) register('entity', createEntityGuard(grounding))
  if (wanted('relationship')) register('relationship', createRelationshipGuard(grounding))
  if (wanted('schema_conformance')) register('schema_conformance', createSchemaGuard())
  if (wanted('fact_canon')) register('fact_canon', createFactCanonGuard(grounding, { getFactLedger }))
  if (wanted('content_safety')) register('content_safety', createContentSafetyGuard({ blockedTerms }))
  if (wanted('pii_leakage')) register('pii_leakage', createPiiGuard())
  if (wanted('cross_turn_consistency')) register('cross_turn_consistency', createCrossTurnGuard(grounding, { getPronouns }))
  if (wanted('cache_integrity')) register('cache_integrity', createCacheGuard())
  if (wanted('input')) register('input', createInputGuard())
  if (wanted('quality')) register('quality', createQualityGuard())
  if (wanted('circuit_breaker')) register('circuit_breaker', createCircuitBreakerGuard())
  if (wanted('integrity')) register('integrity', createIntegrityGuard(grounding))

  return grounding
}

/** Convenience re-export so hosts can build a snapshot without a deep import. */
export { buildOntologySnapshot, emptySnapshot }
