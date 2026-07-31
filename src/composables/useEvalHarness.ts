import type { ModelVariant, HarnessResult, HarnessConfig } from '@/types/eval'
import { aiGenerateJson } from './useAiService'
import { useEvalStore } from '@/stores/evalStore'
import { useCostTrackingStore } from '@/stores/costTrackingStore'
import { computeCost } from '@/config/modelPricing'

function estimateTokens(text: string): number {
  return Math.round(text.length / 4)
}

async function runSingleVariant(
  prompt: string,
  variant: ModelVariant,
  systemPrompt: string | undefined,
  signal: AbortSignal | undefined
): Promise<HarnessResult> {
  const startTime = performance.now()
  let score = 0
  let dimensionScores: Record<string, number> = {}
  let error: string | undefined

  try {
    const result = await aiGenerateJson<{ score: number; dimensionScores?: Record<string, number> }>(
      prompt,
      systemPrompt || '',
      {
        provider: variant.provider,
        model: variant.model,
        temperature: variant.temperature,
        signal,
        schema: {
          type: 'object',
          properties: {
            score: { type: 'number', description: 'Overall quality score 1-10' },
            dimensionScores: { type: 'object', description: 'Per-dimension scores 1-10' },
            issues: { type: 'array', items: { type: 'string' } },
            strengths: { type: 'array', items: { type: 'string' } }
          },
          required: ['score']
        },
        schemaName: 'eval_result'
      }
    )
    score = result.score ?? 0
    dimensionScores = result.dimensionScores ?? {}
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    score = 0
  }

  const latencyMs = performance.now() - startTime
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt
  const promptTokens = estimateTokens(combinedPrompt)
  const outputTokens = estimateTokens(JSON.stringify({ score, dimensionScores }))

  const cost = computeCost(variant.model, {
    promptTokens,
    completionTokens: outputTokens
  })

  return {
    variantId: variant.id,
    label: variant.label || variant.model,
    provider: variant.provider,
    model: variant.model,
    score,
    dimensionScores,
    latencyMs,
    cost,
    tokenCount: { input: promptTokens, output: outputTokens },
    error
  }
}

export async function runEvalHarness(
  prompt: string,
  variants: ModelVariant[],
  options?: HarnessConfig
): Promise<HarnessResult[]> {
  const harnessRunId = `harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const concurrency = options?.concurrency ?? variants.length
  const systemPrompt = options?.systemPrompt
  const signal = options?.signal
  const onVariantComplete = options?.onVariantComplete

  const allResults: HarnessResult[] = []

  for (let i = 0; i < variants.length; i += concurrency) {
    const batch = variants.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(v => runSingleVariant(prompt, v, systemPrompt, signal))
    )
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        allResults.push(result.value)
      }
    }
  }

  allResults.sort((a, b) => b.score - a.score)

  const evalStore = useEvalStore()
  const costStore = useCostTrackingStore()

  for (const result of allResults) {
    evalStore.addResult({
      ...result,
      harnessRunId
    })
    costStore.logCost({
      model: result.model,
      provider: result.provider,
      feature: 'eval-harness',
      cost: result.cost,
      promptTokens: result.tokenCount.input,
      completionTokens: result.tokenCount.output,
      totalTokens: result.tokenCount.input + result.tokenCount.output
    })
    onVariantComplete?.(result)
  }

  return allResults
}
