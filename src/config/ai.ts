import type { FeatureDefaults, FeatureName, ProviderName, EmbeddingCapabilities } from '../types/ai'

export const PROVIDERS: Record<string, ProviderName> = {
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  GROQ: 'groq'
} as const

export const PROVIDER_LABELS = {
  [PROVIDERS.OLLAMA]: 'Ollama (Local)',
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.ANTHROPIC]: 'Anthropic (Claude)',
  [PROVIDERS.GEMINI]: 'Google Gemini',
  [PROVIDERS.GROQ]: 'Groq'
} as Record<ProviderName, string>

export const PROVIDER_BASE_URLS: Partial<Record<ProviderName, string>> = {
  [PROVIDERS.OPENAI]: 'https://api.openai.com/v1',
  [PROVIDERS.ANTHROPIC]: 'https://api.anthropic.com/v1',
  [PROVIDERS.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta',
  [PROVIDERS.GROQ]: 'https://api.groq.com/openai/v1'
}

export const PROVIDER_MODELS: Partial<Record<ProviderName, string[]>> = {
  [PROVIDERS.OPENAI]: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  [PROVIDERS.ANTHROPIC]: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-3'],
  [PROVIDERS.GEMINI]: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro'],
  [PROVIDERS.GROQ]: [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3-32b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
    'allam-2-7b'
  ]
}

export const FEATURES: Record<string, FeatureName> = {
  SPARK: 'spark',
  POLISH: 'polish',
  CONTENT: 'content',
  WORLDBUILDING: 'worldbuilding',
  COMPACTION: 'compaction',
  STORY_GENERATION: 'story_generation',
  NETWORK: 'network',
  TAGGING: 'tagging',
  CHARACTER_CHAT: 'character_chat',
  POV_WRITING: 'pov_writing'
} as const

export const FEATURE_LABELS = {
  [FEATURES.SPARK]: 'Spark (prompts & outlines)',
  [FEATURES.POLISH]: 'Polish (prose analysis)',
  [FEATURES.CONTENT]: 'Content generation',
  [FEATURES.WORLDBUILDING]: 'Worldbuilding (characters, locations, plots)',
  [FEATURES.COMPACTION]: 'Context compaction',
  [FEATURES.STORY_GENERATION]: 'Story Generation (Director/Writer/Critic)',
  [FEATURES.NETWORK]: 'Network (relationship suggestions)',
  [FEATURES.TAGGING]: 'Research auto-tagging',
  [FEATURES.CHARACTER_CHAT]: 'Character chat',
  [FEATURES.POV_WRITING]: 'POV writing assistant'
} as Record<FeatureName, string>

export const FEATURE_DEFAULTS = {
  [FEATURES.SPARK]: { provider: PROVIDERS.OLLAMA, model: 'phi4-mini:3.8b' },
  [FEATURES.POLISH]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.CONTENT]: { provider: PROVIDERS.OLLAMA, model: 'dolphin-mistral:7b' },
  [FEATURES.WORLDBUILDING]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.COMPACTION]: { provider: PROVIDERS.OLLAMA, model: 'phi4-mini:3.8b' },
  [FEATURES.STORY_GENERATION]: { provider: PROVIDERS.OLLAMA, model: 'dolphin-mistral:7b' },
  [FEATURES.NETWORK]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.TAGGING]: { provider: PROVIDERS.OLLAMA, model: 'phi4-mini:3.8b' },
  [FEATURES.CHARACTER_CHAT]: { provider: PROVIDERS.OLLAMA, model: 'dolphin-mistral:7b' },
  [FEATURES.POV_WRITING]: { provider: PROVIDERS.OLLAMA, model: 'dolphin-mistral:7b' }
} as FeatureDefaults

export const PROVIDER_DEFAULT: ProviderName = PROVIDERS.OLLAMA
export const FALLBACK_NONE = null

export const API_KEY_STORAGE_PREFIX = 'versatile_apikey_'

export const FEATURE_LIST: FeatureName[] = Object.values(FEATURES) as FeatureName[]
export const PROVIDER_LIST: ProviderName[] = Object.values(PROVIDERS) as ProviderName[]

export const EMBEDDING_PROVIDERS: Record<string, string> = {
  OLLAMA: 'ollama',
  MISTRAL: 'mistral'
} as const

export const EMBEDDING_PROVIDER_LABELS: Record<string, string> = {
  [EMBEDDING_PROVIDERS.OLLAMA]: 'Ollama (Local)',
  [EMBEDDING_PROVIDERS.MISTRAL]: 'Mistral'
}

export const EMBEDDING_MODELS: Record<string, string[] | null> = {
  [EMBEDDING_PROVIDERS.OLLAMA]: null,
  [EMBEDDING_PROVIDERS.MISTRAL]: ['mistral-embed']
}

export const EMBEDDING_VERSION = 1

export const EMBEDDING_PROVIDER_CAPABILITIES: Record<string, EmbeddingCapabilities> = {
  [EMBEDDING_PROVIDERS.OLLAMA]: {
    maxBatchSize: 128,
    supportsBatching: true,
    maxInputTokens: 8192,
    maxConcurrentRequests: 4
  },
  [EMBEDDING_PROVIDERS.MISTRAL]: {
    maxBatchSize: 16,
    supportsBatching: true,
    maxInputTokens: 8192,
    maxConcurrentRequests: 3
  }
}

export function getEmbeddingCapabilities(provider: string): EmbeddingCapabilities | null {
  return EMBEDDING_PROVIDER_CAPABILITIES[provider] || null
}

export const EMBEDDING_DEFAULTS = {
  provider: EMBEDDING_PROVIDERS.OLLAMA,
  model: 'nomic-embed-text',
  threshold: 0.75,
  batchSize: EMBEDDING_PROVIDER_CAPABILITIES[EMBEDDING_PROVIDERS.OLLAMA].maxBatchSize
}

export const RESEARCH_CHUNKS_DEFAULT = 3

export const EMBEDDING_THRESHOLD_MIN = 0.4
export const EMBEDDING_THRESHOLD_MAX = 0.98
export const EMBEDDING_THRESHOLD_STEP = 0.01
