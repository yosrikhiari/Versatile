import { backendStream } from '../../services/backendAiService'
import { providerBudget, BudgetExceededError } from '../../services/aiProviderBudget'
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
