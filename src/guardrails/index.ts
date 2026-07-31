export { GuardrailRegistry } from './registry'
export { installGuardrails } from './setup'
export type { GuardrailSetupOptions } from './setup'
export { GroundingService } from './ontology/grounding'
export { emptySnapshot, buildOntologySnapshot } from './ontology/instantiate'

export { createEntityGuard } from './guards/entityGuard'
export { createRelationshipGuard } from './guards/relationshipGuard'
export { createSchemaGuard } from './guards/schemaGuard'
export { createFactCanonGuard } from './guards/factCanonGuard'
export { createContentSafetyGuard } from './guards/contentSafetyGuard'
export { createPiiGuard } from './guards/piiGuard'
export { createCrossTurnGuard } from './guards/crossTurnGuard'
export { createCacheGuard, digest } from './guards/cacheGuard'
export { createInputGuard } from './guards/inputGuard'
export { createQualityGuard } from './guards/qualityGuard'
export { createCircuitBreakerGuard, resetCircuitBreaker, getCircuitBreakerState } from './guards/circuitBreakerGuard'
export { createIntegrityGuard } from './guards/integrityGuard'

export {
  setGuardrailEnforcement,
  getGuardrailEnforcement,
  GuardrailBlockedError,
  guardPrompt,
  guardStructuredOutput,
  guardCacheWrite,
  recordProviderFailure,
} from './integration/aiGuardrails'
export type { GuardrailEnforcement } from './integration/aiGuardrails'
export {
  guardScene,
  guardFreeformProse,
  guardPlan,
  guardCritique,
  guardAnalysis,
} from './integration/composableGuardrails'
export {
  guardStorageWrite,
  guardStorageWriteBatch,
  guardSyncPush,
  TABLE_CONTRACTS,
} from './integration/storageGuardrails'
export type { TableContract } from './integration/storageGuardrails'

export { useOutputGuardrails } from './hooks/useOutputGuardrails'
export { useProseGuardrails } from './hooks/useProseGuardrails'
export { useEntityGuardrails } from './hooks/useEntityGuardrails'
export { useEvalGuardrails } from './hooks/useEvalGuardrails'
export { useInputGuardrails } from './hooks/useInputGuardrails'
export { useEditGuardrails } from './hooks/useEditGuardrails'
export { useStorageGuardrails } from './hooks/useStorageGuardrails'
export { useSyncGuardrails } from './hooks/useSyncGuardrails'

export {
  onGuardrailNotification,
  dismissGuardrailNotification,
  clearGuardrailNotifications,
  getGuardrailNotifications,
  useGuardrailNotifications,
} from './reporting/useGuardrailReporting'
export { default as GuardrailIndicator } from './reporting/components/GuardrailIndicator.vue'
export { default as GuardrailFeed } from './reporting/components/GuardrailFeed.vue'

export type {
  GuardrailContext,
  GuardrailResult,
  GuardrailEvent,
  GuardrailRunResult,
  GuardrailKind,
  GuardrailCategory,
  GuardrailCost,
  GuardrailLayer,
  GuardrailSeverity,
  GuardFunction,
  GuardMeta,
  GuardRegistration,
} from './types'
export type { OntologySnapshot, CanonicalEntity, CanonicalRelationship } from './ontology/types'
export type { GuardrailUserNotification } from './reporting/useGuardrailReporting'
