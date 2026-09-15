export const MODEL_PRICING = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
  'gemini-2.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'openai/gpt-oss-120b': { input: 0.0, output: 0.0 },
  'openai/gpt-oss-20b': { input: 0.0, output: 0.0 },
  'qwen/qwen3-32b': { input: 0.0, output: 0.0 },
  'llama-3.3-70b-versatile': { input: 0.0, output: 0.0 },
  'llama-3.1-8b-instant': { input: 0.0, output: 0.0 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.0, output: 0.0 },
  'mixtral-8x7b-32768': { input: 0.0, output: 0.0 },
  'gemma2-9b-it': { input: 0.0, output: 0.0 },
  'allam-2-7b': { input: 0.0, output: 0.0 }
}

const DEFAULT_PRICING = { input: 0.0, output: 0.0 }

interface TokenUsage {
  promptTokens: number
  completionTokens: number
}

export function computeCost(model: string, usage: TokenUsage | null | undefined): number {
  if (!usage) return 0
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING] || DEFAULT_PRICING
  const inputCost = (usage.promptTokens / 1_000_000) * pricing.input
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.output
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000
}
