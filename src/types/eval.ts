import type { ProviderName } from './ai'

export interface ModelVariant {
  id: string
  provider: ProviderName
  model: string
  label?: string
  temperature?: number
}

export interface HarnessResult {
  variantId: string
  label: string
  provider: ProviderName
  model: string
  score: number
  dimensionScores: Record<string, number>
  latencyMs: number
  cost: number
  tokenCount: { input: number; output: number }
  error?: string
}

export interface HarnessConfig {
  concurrency?: number
  systemPrompt?: string
  signal?: AbortSignal
  onVariantComplete?: (result: HarnessResult) => void
}
