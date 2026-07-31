import { GuardrailRegistry } from '../registry'
import type { GuardrailContext, GuardrailKind, GuardrailRunResult } from '../types'

/** Full prose validation — scene text that will be persisted. */
const SCENE_KINDS: GuardrailKind[] = [
  'entity',
  'relationship',
  'fact_canon',
  'content_safety',
  'pii_leakage',
  'schema_conformance',
]

/** Free-form prose with no entity contract to honour (what-if branches, sparks). */
const FREEFORM_KINDS: GuardrailKind[] = ['content_safety', 'pii_leakage', 'schema_conformance']

/** Structural prose that names entities but isn't narrative (outlines, blurbs). */
const STRUCTURAL_KINDS: GuardrailKind[] = ['content_safety', 'entity', 'schema_conformance']

type ProseContext = Omit<GuardrailContext, 'layer' | 'kinds'>

/**
 * Guardrails for the prose-generation flow. Each method maps to a row of the
 * touchpoint table in `planning/guardrails.md` — the kind set is fixed per
 * entry point so a blurb isn't held to a scene's fact-canon contract.
 */
export function useProseGuardrails() {
  const run = (context: ProseContext, kinds: GuardrailKind[]): Promise<GuardrailRunResult> =>
    GuardrailRegistry.run({ ...context, layer: 'ai_output', kinds })

  return {
    validateScene: (context: ProseContext) => run(context, SCENE_KINDS),
    validateWhatIf: (context: ProseContext) => run(context, FREEFORM_KINDS),
    validateSpark: (context: ProseContext) => run(context, ['content_safety', 'pii_leakage']),
    validateOutline: (context: ProseContext) => run(context, STRUCTURAL_KINDS),
    validateBlurb: (context: ProseContext) => run(context, STRUCTURAL_KINDS),
    /** Scene edits and rewrites — same contract as a fresh scene, minus the schema envelope. */
    validateRewrite: (context: ProseContext) =>
      run(context, ['entity', 'relationship', 'fact_canon', 'content_safety']),
  }
}
