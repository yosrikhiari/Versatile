import { backendStream } from '../../services/backendAiService'
import { providerBudget } from '../../services/aiProviderBudget'
import type { aiGenerateJson } from '../useAiService'

const CHARS_PER_TOKEN = 4
const RATES: Record<string, { input: number; output: number }> = {
  openai: { input: 0.005, output: 0.015 },
  anthropic: { input: 0.008, output: 0.024 },
  google: { input: 0.00075, output: 0.003 },
  groq: { input: 0.0002, output: 0.0006 },
  deepseek: { input: 0.00014, output: 0.00028 }
}

function estimateCost(inputTokens: number, outputTokens: number, provider: string): number {
  const rate = RATES[provider] || RATES.openai
  return ((inputTokens * rate.input) + (outputTokens * rate.output)) / 1000
}

export interface CloudBatchInjectorOptions {
  provider: string
  model: string
  localGenerateJson: typeof aiGenerateJson
  onFallback?: (reason: string) => void
}

export function buildCloudBatchInjector({ provider, model, localGenerateJson, onFallback }: CloudBatchInjectorOptions) {
  const fallBack = async (reason: string, prompt: string, systemPrompt: string, opts: any) => {
    onFallback?.(reason)
    try {
      return await localGenerateJson(prompt, systemPrompt, opts)
    } catch {
      return null
    }
  }
  return async (prompt: string, systemPrompt: string, opts: any) => {
    const inputTokens = Math.ceil((prompt.length + systemPrompt.length) / CHARS_PER_TOKEN)
    try {
      providerBudget.check(provider)
    } catch (err: any) {
      return fallBack(`cloud budget exceeded (${err?.message || err}); used local model`, prompt, systemPrompt, opts)
    }
    let text: string
    try {
      text = await backendStream(prompt, systemPrompt, model, undefined, { provider })
    } catch (err: any) {
      return fallBack(`cloud call failed (${err?.message || err}); used local model`, prompt, systemPrompt, opts)
    }
    let parsed: any = null
    try {
      parsed = JSON.parse(text)
    } catch {
      return fallBack('cloud output was not valid JSON; used local model', prompt, systemPrompt, opts)
    }
    const outputTokens = Math.ceil(text.length / CHARS_PER_TOKEN)
    try {
      providerBudget.record(provider, inputTokens + outputTokens, estimateCost(inputTokens, outputTokens, provider))
    } catch {
      // Recording must never fail the batch the cloud just judged.
    }
    return parsed
  }
}

export type AnalysisTier = 'local' | 'cloud-on-demand' | 'cloud-audit'

export interface BatchInjectorContext {
  tier: AnalysisTier
  cloudAvailable: boolean
  runOptIn: boolean
  projectOptIn: boolean
  provider: string
  model: string
  localGenerateJson: typeof aiGenerateJson
  onFallback?: (reason: string) => void
}

export function resolveBatchInjector(ctx: BatchInjectorContext) {
  if (!ctx.cloudAvailable) return undefined
  if (ctx.tier === 'cloud-on-demand' && !ctx.runOptIn) return undefined
  if (ctx.tier === 'cloud-audit' && !ctx.projectOptIn) return undefined
  if (ctx.tier === 'local') return undefined
  return buildCloudBatchInjector({
    provider: ctx.provider,
    model: ctx.model,
    localGenerateJson: ctx.localGenerateJson,
    onFallback: ctx.onFallback
  })
}

/**
 * Combine per-pass disclosures into one full-audit disclosure.
 *
 * Each routed pass previously overwrote the panel line, so a three-pass
 * cloud run displayed one pass's estimate. Sums tokens, cost and text;
 * provider/model/warning come from the first entry. A lone disclosure
 * passes through untouched (same values, no relabel) so single-pass runs
 * read exactly as before; empty input yields null.
 */
export function combineDisclosures(disclosures: any[]): any | null {
  const list = (disclosures || []).filter(Boolean)
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  const first = list[0]
  return {
    ...first,
    operation: 'Full manuscript quality audit',
    textLength: list.reduce((a, d) => a + (d.textLength || 0), 0),
    estimatedTokens: list.reduce((a, d) => a + (d.estimatedTokens || 0), 0),
    estimatedCostUsd: list.reduce((a, d) => a + (d.estimatedCostUsd || 0), 0)
  }
}
