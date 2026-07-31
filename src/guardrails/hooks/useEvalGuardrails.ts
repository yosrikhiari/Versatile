import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailKind, GuardrailRunResult } from '../types'

/** Analysis output is machine-read downstream, so shape is what matters. */
const ANALYSIS_KINDS: GuardrailKind[] = ['schema_conformance', 'content_safety']

type EvalContext = Omit<GuardrailContext, 'layer' | 'kinds'>

/**
 * Guardrails for evaluation and analysis flows (critic, beta reader, shape,
 * emotion, sensitivity). These write to `db.evalResults`, where a malformed
 * payload silently corrupts score aggregation — hence schema conformance on
 * every path.
 */
export function useEvalGuardrails() {
  const run = (context: EvalContext, kinds: GuardrailKind[]): Promise<GuardrailRunResult> =>
    GuardrailRegistry.run({ ...context, layer: 'ai_output', kinds })

  return {
    validateCritique: (context: EvalContext) => run(context, ['schema_conformance']),
    validateAnalysis: (context: EvalContext) => run(context, ANALYSIS_KINDS),
    /** Sensitivity reads handle charged material — content safety stays on. */
    validateSensitivityRead: (context: EvalContext) => run(context, ANALYSIS_KINDS),
    validateShapeAnalysis: (context: EvalContext) => run(context, ['schema_conformance']),
  }
}
