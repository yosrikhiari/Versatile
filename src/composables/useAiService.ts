import { aiGenerate, aiStream } from '../services/aiService'
import type { AiGenerateOptions, FeatureName } from '../types/ai'

export function useAiService() {
  async function generate(
    prompt: string,
    systemPrompt: string,
    feature?: FeatureName,
    options: AiGenerateOptions = {}
  ): Promise<string> {
    return aiGenerate(prompt, systemPrompt, { ...options, feature })
  }

  async function stream(
    prompt: string,
    systemPrompt: string,
    onChunk?: (chunk: string, full: string) => void,
    options: AiGenerateOptions = {}
  ): Promise<string> {
    return aiStream(prompt, systemPrompt, onChunk, options)
  }

  return { generate, stream }
}
