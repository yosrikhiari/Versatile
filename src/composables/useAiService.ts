import { aiGenerate as _aiGenerate, aiStream as _aiStream, resolveFeatureConfig as _resolveFeatureConfig } from '../services/aiService'
import type { AiGenerateOptions, FeatureName } from '../types/ai'
import { useSettingsStore } from '../stores/settingsStore'

function injectSettings(options: AiGenerateOptions = {}): AiGenerateOptions {
  const settingsStore = useSettingsStore()
  return {
    ...options,
    defaultProvider: settingsStore.aiProvider,
    defaultModel: settingsStore.ollamaModel,
    featureModels: settingsStore.featureModels,
    fallbackProvider: settingsStore.aiProviderFallback
  }
}

/** Store-aware drop-in replacement for aiService's aiGenerate */
export async function aiGenerate(
  prompt: string,
  systemPrompt: string,
  options: AiGenerateOptions = {}
): Promise<string> {
  return _aiGenerate(prompt, systemPrompt, injectSettings(options))
}

/** Store-aware drop-in replacement for aiService's aiStream */
export async function aiStream(
  prompt: string,
  systemPrompt: string,
  onChunk?: (chunk: string, full: string) => void,
  options: AiGenerateOptions = {}
): Promise<string> {
  return _aiStream(prompt, systemPrompt, onChunk, injectSettings(options))
}

/** Pure re-export (no store injection — resolveFeatureConfig is stateless) */
export { _resolveFeatureConfig as resolveFeatureConfig }

export function useAiService() {
  async function generate(
    prompt: string,
    systemPrompt: string,
    feature?: FeatureName,
    options: AiGenerateOptions = {}
  ): Promise<string> {
    return _aiGenerate(prompt, systemPrompt, { ...injectSettings(options), feature })
  }

  async function stream(
    prompt: string,
    systemPrompt: string,
    onChunk?: (chunk: string, full: string) => void,
    options: AiGenerateOptions = {}
  ): Promise<string> {
    return _aiStream(prompt, systemPrompt, onChunk, injectSettings(options))
  }

  return { generate, stream }
}
