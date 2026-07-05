import { PROVIDERS, PROVIDER_MODELS } from '../config/ai'
import { getApiKeyStorageKey } from '../config/storageKeys'
import type { ProviderName, ProviderModule } from '../types/ai'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'
import { deobfuscate } from './ollamaService'

const PROVIDER_MAP = {
  [PROVIDERS.OLLAMA]: ollamaProvider as unknown as ProviderModule,
  [PROVIDERS.OPENAI]: openaiProvider as ProviderModule,
  [PROVIDERS.ANTHROPIC]: anthropicProvider as ProviderModule,
  [PROVIDERS.GEMINI]: geminiProvider as ProviderModule,
  [PROVIDERS.GROQ]: groqProvider as ProviderModule
} as unknown as Record<ProviderName, ProviderModule>

function getApiKey(provider: ProviderName): string | null {
  if (provider === PROVIDERS.OLLAMA) return null
  const storageKey = getApiKeyStorageKey(provider)
  const encrypted = localStorage.getItem(storageKey)
  if (!encrypted) return ''
  try {
    return deobfuscate(encrypted)
  } catch {
    return ''
  }
}

function getDefaultModelForProvider(provider: ProviderName, defaultOllamaModel?: string): string | null {
  return provider === PROVIDERS.OLLAMA
    ? (defaultOllamaModel ?? null)
    : (PROVIDER_MODELS[provider]?.[0] || null)
}

function getProviderModule(provider: ProviderName): ProviderModule {
  const mod = PROVIDER_MAP[provider]
  if (!mod) throw new Error(`Unknown provider: ${provider}`)
  return mod
}

export { PROVIDER_MAP, getApiKey, getDefaultModelForProvider, getProviderModule }
