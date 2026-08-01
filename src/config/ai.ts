export const PROVIDERS = {
  OLLAMA: 'ollama',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  GROQ: 'groq'
}

export const PROVIDER_LABELS = {
  [PROVIDERS.OLLAMA]: 'Ollama (Local)',
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.ANTHROPIC]: 'Anthropic (Claude)',
  [PROVIDERS.GEMINI]: 'Google Gemini',
  [PROVIDERS.GROQ]: 'Groq'
}

export const PROVIDER_BASE_URLS = {
  [PROVIDERS.OPENAI]: 'https://api.openai.com/v1',
  [PROVIDERS.ANTHROPIC]: 'https://api.anthropic.com/v1',
  [PROVIDERS.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta',
  [PROVIDERS.GROQ]: 'https://api.groq.com/openai/v1'
}

export const PROVIDER_MODELS = {
  [PROVIDERS.OPENAI]: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  [PROVIDERS.ANTHROPIC]: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
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

export const FEATURES = {
  SPARK: 'spark',
  POLISH: 'polish',
  CONTENT: 'content',
  WORLDBUILDING: 'worldbuilding',
  COMPACTION: 'compaction',
  STORY_GENERATION: 'story_generation',
  NETWORK: 'network',
  TAGGING: 'tagging',
  CHARACTER_CHAT: 'character_chat',
  POV_WRITING: 'pov_writing',
  SHAPE_ANALYSIS: 'shape_analysis',
  BLURB: 'blurb'
}

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
  [FEATURES.POV_WRITING]: 'POV writing assistant',
  [FEATURES.SHAPE_ANALYSIS]: 'Story shape analysis',
  [FEATURES.BLURB]: 'Blurb/synopsis generation'
}

export const FEATURE_DEFAULTS = {
  [FEATURES.SPARK]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.POLISH]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.CONTENT]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.WORLDBUILDING]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.COMPACTION]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.STORY_GENERATION]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.NETWORK]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.TAGGING]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.CHARACTER_CHAT]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.POV_WRITING]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.SHAPE_ANALYSIS]: { provider: PROVIDERS.OLLAMA, model: null },
  [FEATURES.BLURB]: { provider: PROVIDERS.OLLAMA, model: null }
}

export const PROVIDER_DEFAULT = PROVIDERS.OLLAMA
export const FALLBACK_NONE = null

export const API_KEY_STORAGE_PREFIX = 'versatile_apikey_'

export const FEATURE_LIST = Object.values(FEATURES)
export const PROVIDER_LIST = Object.values(PROVIDERS)

export const EMBEDDING_PROVIDERS = {
  OLLAMA: 'ollama',
  MISTRAL: 'mistral'
}

export const EMBEDDING_PROVIDER_LABELS = {
  [EMBEDDING_PROVIDERS.OLLAMA]: 'Ollama (Local)',
  [EMBEDDING_PROVIDERS.MISTRAL]: 'Mistral'
}

export const EMBEDDING_MODELS = {
  [EMBEDDING_PROVIDERS.OLLAMA]: null,
  [EMBEDDING_PROVIDERS.MISTRAL]: ['mistral-embed']
}

export const EMBEDDING_VERSION = 1

export const EMBEDDING_PROVIDER_CAPABILITIES = {
  [EMBEDDING_PROVIDERS.OLLAMA]: {
    maxBatchSize: 128,
    supportsBatching: true,
    maxInputTokens: 8192,
    // One. Ollama is a single local process, so parallel embed requests do not
    // overlap usefully — they contend for the same GPU and, when a chat model is
    // also loaded, force it in and out of VRAM between batches. Four workers
    // here turned ~2s batches into ~270s ones. They also stack four deep in
    // front of any generation call sharing the provider semaphore.
    maxConcurrentRequests: 1
  },
  [EMBEDDING_PROVIDERS.MISTRAL]: {
    maxBatchSize: 16,
    supportsBatching: true,
    maxInputTokens: 8192,
    maxConcurrentRequests: 3
  }
}

export function getEmbeddingCapabilities(
  provider: keyof typeof EMBEDDING_PROVIDER_CAPABILITIES | string
) {
  return (
    EMBEDDING_PROVIDER_CAPABILITIES[provider as keyof typeof EMBEDDING_PROVIDER_CAPABILITIES] || null
  )
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

export const RERANKING_DEFAULTS = {
  provider: EMBEDDING_PROVIDERS.OLLAMA,
  model: 'jina/jina-reranker-v2-base-multilingual',
  topN: 10,
  minScore: 0.3
}

export const RERANKING_MODELS = {
  [EMBEDDING_PROVIDERS.OLLAMA]: [
    'jina/jina-reranker-v2-base-multilingual',
    'jina/jina-reranker-v2-base-multilingual-v2',
    'snowflake-arctic-embed2'
  ]
}
