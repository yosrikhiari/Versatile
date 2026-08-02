import { backendStream, backendTestConnection } from './backendAiService'
import { useSettingsStore } from '../stores/settingsStore'

export interface CloudEscalationOptions {
  projectId: string
  operation: 'full-audit' | 'contradiction-sweep' | 'pacing-review' | 'structural-arc' | 'escalation-on-failure'
  text: string
  systemPrompt: string
  model?: string
  provider?: string
  onProgress?: (progress: { stage: string; current: number; total: number; message: string }) => void
  abortSignal?: AbortSignal
}

export interface CloudEscalationResult {
  success: boolean
  result?: string
  error?: string
  costEstimate?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number }
}

export interface CloudDisclosure {
  operation: string
  textLength: number
  estimatedTokens: number
  provider: string
  model: string
  estimatedCostUsd: number
  warning: string
}

const TOKEN_ESTIMATE_CHARS = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATE_CHARS)
}

function estimateCost(inputTokens: number, outputTokens: number, provider: string, model: string): number {
  const rates: Record<string, { input: number; output: number }> = {
    openai: { input: 0.005, output: 0.015 },
    anthropic: { input: 0.008, output: 0.024 },
    google: { input: 0.00075, output: 0.003 },
    groq: { input: 0.0002, output: 0.0006 },
    deepseek: { input: 0.00014, output: 0.00028 }
  }

  const rate = rates[provider] || { input: 0.005, output: 0.015 }
  return (inputTokens * rate.input + outputTokens * rate.output) / 1000
}

export async function buildCloudDisclosure(options: CloudEscalationOptions): Promise<CloudDisclosure> {
  const settings = useSettingsStore()
  const provider = options.provider || settings.aiProvider
  const model = options.model || settings.ollamaModel
  const systemPromptTokens = estimateTokens(options.systemPrompt)
  const textTokens = estimateTokens(options.text)
  const estimatedOutputTokens = Math.min(textTokens * 2, 8000)
  const estimatedCost = estimateCost(systemPromptTokens + textTokens, estimatedOutputTokens, provider, model)

  const operationLabels: Record<string, string> = {
    'full-audit': 'Full manuscript quality audit',
    'contradiction-sweep': 'Cross-scene contradiction sweep',
    'pacing-review': 'Pacing and structure review',
    'structural-arc': 'Structural arc analysis',
    'escalation-on-failure': 'Quality gate escalation'
  }

  return {
    operation: operationLabels[options.operation] || options.operation,
    textLength: options.text.length,
    estimatedTokens: systemPromptTokens + textTokens,
    provider,
    model,
    estimatedCostUsd: estimatedCost,
    warning: 'This will send your manuscript text to a cloud AI provider. The text leaves your device and is processed on external servers. This action cannot be undone.'
  }
}

export async function requestCloudEscalation(options: CloudEscalationOptions): Promise<CloudEscalationResult> {
  const settings = useSettingsStore()
  const provider = options.provider || settings.aiProvider
  const model = options.model || settings.ollamaModel

  if (!provider || provider === 'ollama') {
    return { success: false, error: 'No cloud provider configured. Please set up an API key in settings.' }
  }

  if (options.abortSignal?.aborted) {
    return { success: false, error: 'Operation aborted' }
  }

  options.onProgress?.({ stage: 'connecting', current: 0, total: 100, message: 'Connecting to cloud provider...' })

  const connTest = await backendTestConnection(provider, model)
  if (!connTest.success) {
    return { success: false, error: `Cloud provider connection failed: ${connTest.error}` }
  }

  options.onProgress?.({ stage: 'streaming', current: 10, total: 100, message: 'Streaming analysis from cloud...' })

  try {
    const result = await backendStream(
      options.text,
      options.systemPrompt,
      model,
      (chunk, accumulated) => {
        options.onProgress?.({
          stage: 'streaming',
          current: Math.min(10 + Math.floor(accumulated.length / options.text.length * 80), 90),
          total: 100,
          message: `Received ${accumulated.length} chars...`
        })
      },
      { provider, signal: options.abortSignal }
    )

    options.onProgress?.({ stage: 'complete', current: 100, total: 100, message: 'Cloud analysis complete' })

    const inputTokens = estimateTokens(options.text + options.systemPrompt)
    const outputTokens = estimateTokens(result)
    const costEstimate = {
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCost(inputTokens, outputTokens, provider, model)
    }

    return { success: true, result, costEstimate }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Operation aborted by user' }
    }
    return { success: false, error: err.message || 'Cloud escalation failed' }
  }
}

export function canUseCloudEscalation(): boolean {
  const settings = useSettingsStore()
  return settings.analysisTier !== 'local' && !!settings.aiProvider && settings.aiProvider !== 'ollama'
}

export function getAnalysisTier(): 'local' | 'cloud-on-demand' | 'cloud-audit' {
  const settings = useSettingsStore()
  return settings.analysisTier as 'local' | 'cloud-on-demand' | 'cloud-audit'
}