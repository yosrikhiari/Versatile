import { PROVIDERS, PROVIDER_MODELS } from '../config/ai'
import { getApiKeyStorageKey } from '../config/storageKeys'
import type { ProviderName, ProviderModule } from '../types/ai'
import * as ollamaProvider from './providers/ollama'
import * as openaiProvider from './providers/openai'
import * as anthropicProvider from './providers/anthropic'
import * as geminiProvider from './providers/gemini'
import * as groqProvider from './providers/groq'
import { decrypt } from './ollamaService'
import { getAuthHeaders } from './api'

const PROVIDER_MAP = {
  [PROVIDERS.OLLAMA]: ollamaProvider as unknown as ProviderModule,
  [PROVIDERS.OPENAI]: openaiProvider as ProviderModule,
  [PROVIDERS.ANTHROPIC]: anthropicProvider as ProviderModule,
  [PROVIDERS.GEMINI]: geminiProvider as ProviderModule,
  [PROVIDERS.GROQ]: groqProvider as ProviderModule
} as unknown as Record<ProviderName, ProviderModule>

async function getApiKey(provider: ProviderName): Promise<string | null> {
  if (provider === PROVIDERS.OLLAMA) return null

  // Try backend first (authenticated users)
  try {
    const headers = getAuthHeaders()
    if (headers.Authorization) {
      const res = await fetch(`/api/apikeys/${provider}`, { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.key) return data.key
      }
    }
  } catch {
    // fall through to localStorage
  }

  // Fallback to localStorage (offline / unauthenticated)
  const storageKey = getApiKeyStorageKey(provider)
  const encrypted = localStorage.getItem(storageKey)
  if (!encrypted) return ''
  try {
    return await decrypt(encrypted)
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
