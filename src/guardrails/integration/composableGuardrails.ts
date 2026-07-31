import { useProseGuardrails } from '../hooks/useProseGuardrails'
import { useEntityGuardrails } from '../hooks/useEntityGuardrails'
import { useEvalGuardrails } from '../hooks/useEvalGuardrails'
import { getGuardrailEnforcement, GuardrailBlockedError } from './aiGuardrails'
import type { GuardrailRunResult } from '../types'

const NOOP: GuardrailRunResult = {
  passed: true,
  results: [],
  blocking: [],
  detective: [],
  skipped: [],
  durationMs: 0,
}

async function settle(run: Promise<GuardrailRunResult>): Promise<GuardrailRunResult> {
  const result = await run
  if (getGuardrailEnforcement() === 'blocking' && result.blocking.length > 0) {
    throw new GuardrailBlockedError(result.blocking)
  }
  return result
}

function off(): boolean {
  return getGuardrailEnforcement() === 'off'
}

/**
 * Validates a written scene at its data-commit boundary.
 *
 * `structured` carries the entity/fact claims the writer made, `prose` the
 * text itself — both are checked, since a scene can name a phantom character
 * in its metadata or leak a credential in its body.
 */
export async function guardScene(input: {
  prose: string
  structured?: Record<string, unknown>
  sceneId?: string
  entryPoint?: string
}): Promise<GuardrailRunResult> {
  if (off()) return NOOP

  const { validateScene } = useProseGuardrails()
  return settle(
    validateScene({
      data: { ...(input.structured ?? {}), content: input.prose },
      sceneId: input.sceneId,
      entryPoint: input.entryPoint ?? 'useStoryWriter.writeSceneStructured',
    })
  )
}

/** Validates free-form prose with no entity contract (what-if branches, sparks). */
export async function guardFreeformProse(input: {
  text: string
  sceneId?: string
  entryPoint?: string
}): Promise<GuardrailRunResult> {
  if (off()) return NOOP

  const { validateWhatIf } = useProseGuardrails()
  return settle(
    validateWhatIf({
      data: { content: input.text },
      sceneId: input.sceneId,
      entryPoint: input.entryPoint ?? 'useStoryWriter.generateWhatIf',
    })
  )
}

/** Validates a generated story or scene plan before it is persisted. */
export async function guardPlan(input: {
  plan: unknown
  entryPoint?: string
}): Promise<GuardrailRunResult> {
  if (off()) return NOOP

  const { validateScenePlan } = useEntityGuardrails()
  return settle(
    validateScenePlan({
      data: input.plan,
      entryPoint: input.entryPoint ?? 'useStoryDirector.generateStoryPlan',
    })
  )
}

/** Validates critic output before it reaches the eval store. */
export async function guardCritique(input: {
  result: unknown
  sceneId?: string
  entryPoint?: string
}): Promise<GuardrailRunResult> {
  if (off()) return NOOP

  const { validateCritique } = useEvalGuardrails()
  return settle(
    validateCritique({
      data: input.result,
      sceneId: input.sceneId,
      entryPoint: input.entryPoint ?? 'useStoryCritic.evaluateScene',
    })
  )
}

/** Validates beta-reader / shape / emotion / sensitivity analysis output. */
export async function guardAnalysis(input: {
  result: unknown
  entryPoint?: string
}): Promise<GuardrailRunResult> {
  if (off()) return NOOP

  const { validateAnalysis } = useEvalGuardrails()
  return settle(
    validateAnalysis({
      data: input.result,
      entryPoint: input.entryPoint ?? 'useBetaReader.scan',
    })
  )
}
