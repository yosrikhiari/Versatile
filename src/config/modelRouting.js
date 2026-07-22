import { PROVIDERS, FEATURES, FEATURE_DEFAULTS, PROVIDER_MODELS } from './ai'
import { WORKSPACE_TYPES } from './workspace'
import { useSettingsStore } from '../stores/settingsStore'

export const COMPLEXITY = {
  DRAFT: 'draft',
  STANDARD: 'standard',
  CRITICAL: 'critical'
}

export const COMPLEXITY_ORDER = [COMPLEXITY.DRAFT, COMPLEXITY.STANDARD, COMPLEXITY.CRITICAL]

export const COST_TIERS = {
  BUDGET: 'budget',
  STANDARD: 'standard',
  PREMIUM: 'premium',
  CRITICAL: 'critical'
}

export const SPEED_TIERS = {
  FAST: 'fast',
  MEDIUM: 'medium',
  SLOW: 'slow'
}

export const MODEL_META = {
  'gpt-4o-mini': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 128000, capabilityTier: COST_TIERS.BUDGET },
  'gpt-4o': { costTier: COST_TIERS.STANDARD, speedTier: SPEED_TIERS.FAST, contextWindow: 128000, capabilityTier: COST_TIERS.STANDARD },
  'gpt-4-turbo': { costTier: COST_TIERS.PREMIUM, speedTier: SPEED_TIERS.MEDIUM, contextWindow: 128000, capabilityTier: COST_TIERS.PREMIUM },
  'gpt-4': { costTier: COST_TIERS.PREMIUM, speedTier: SPEED_TIERS.SLOW, contextWindow: 8192, capabilityTier: COST_TIERS.PREMIUM },
  'gpt-3.5-turbo': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 16384, capabilityTier: COST_TIERS.BUDGET },
  'claude-haiku-4-5': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 200000, capabilityTier: COST_TIERS.BUDGET },
  'claude-sonnet-4-5': { costTier: COST_TIERS.STANDARD, speedTier: SPEED_TIERS.MEDIUM, contextWindow: 200000, capabilityTier: COST_TIERS.STANDARD },
  'claude-opus-4-5': { costTier: COST_TIERS.CRITICAL, speedTier: SPEED_TIERS.SLOW, contextWindow: 200000, capabilityTier: COST_TIERS.CRITICAL },
  'gemini-2.5-flash': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 1048576, capabilityTier: COST_TIERS.BUDGET },
  'gemini-2.5-pro': { costTier: COST_TIERS.STANDARD, speedTier: SPEED_TIERS.FAST, contextWindow: 1048576, capabilityTier: COST_TIERS.STANDARD },
  'gemini-1.5-pro': { costTier: COST_TIERS.STANDARD, speedTier: SPEED_TIERS.MEDIUM, contextWindow: 1048576, capabilityTier: COST_TIERS.STANDARD },
  'openai/gpt-oss-120b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.MEDIUM, contextWindow: 16384, capabilityTier: COST_TIERS.STANDARD },
  'openai/gpt-oss-20b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 8192, capabilityTier: COST_TIERS.BUDGET },
  'qwen/qwen3-32b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 32768, capabilityTier: COST_TIERS.STANDARD },
  'llama-3.3-70b-versatile': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 32768, capabilityTier: COST_TIERS.STANDARD },
  'llama-3.1-8b-instant': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 32768, capabilityTier: COST_TIERS.BUDGET },
  'meta-llama/llama-4-scout-17b-16e-instruct': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 262144, capabilityTier: COST_TIERS.BUDGET },
  'mixtral-8x7b-32768': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.MEDIUM, contextWindow: 32768, capabilityTier: COST_TIERS.BUDGET },
  'gemma2-9b-it': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 8192, capabilityTier: COST_TIERS.BUDGET },
  'allam-2-7b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 8192, capabilityTier: COST_TIERS.BUDGET }
}

function matrixEntry(complexity, provider, model) {
  return { complexity, provider, model }
}

const BASE_MATRIX = {
  [FEATURES.SPARK]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.OPENAI, 'gpt-4o')
  },
  [FEATURES.POLISH]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-opus-4-5')
  },
  [FEATURES.CONTENT]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
  },
  [FEATURES.WORLDBUILDING]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.OPENAI, 'gpt-4o')
  },
  [FEATURES.COMPACTION]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.OPENAI, 'gpt-4o-mini')
  },
  [FEATURES.STORY_GENERATION]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-opus-4-5')
  },
  [FEATURES.NETWORK]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.OPENAI, 'gpt-4o')
  },
  [FEATURES.TAGGING]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.OLLAMA, null)
  },
  [FEATURES.CHARACTER_CHAT]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
  },
  [FEATURES.POV_WRITING]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.ANTHROPIC, 'claude-haiku-4-5'),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
  },
  [FEATURES.SHAPE_ANALYSIS]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OLLAMA, null),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-opus-4-5')
  },
  [FEATURES.BLURB]: {
    [COMPLEXITY.DRAFT]: matrixEntry(COMPLEXITY.DRAFT, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o-mini'),
    [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
  }
}

const WORKSPACE_OVERRIDES = {
  [WORKSPACE_TYPES.LEGAL]: {
    [FEATURES.CONTENT]: {
      [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5'),
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-opus-4-5')
    },
    [FEATURES.POLISH]: {
      [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5'),
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-opus-4-5')
    },
    [FEATURES.SPARK]: {
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
    }
  },
  [WORKSPACE_TYPES.TECHNICAL]: {
    [FEATURES.CONTENT]: {
      [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o'),
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
    }
  },
  [WORKSPACE_TYPES.RESEARCH]: {
    [FEATURES.CONTENT]: {
      [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o'),
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-opus-4-5')
    },
    [FEATURES.SHAPE_ANALYSIS]: {
      [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o'),
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
    }
  },
  [WORKSPACE_TYPES.BUSINESS]: {
    [FEATURES.CONTENT]: {
      [COMPLEXITY.STANDARD]: matrixEntry(COMPLEXITY.STANDARD, PROVIDERS.OPENAI, 'gpt-4o'),
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.ANTHROPIC, 'claude-sonnet-4-5')
    },
    [FEATURES.SPARK]: {
      [COMPLEXITY.CRITICAL]: matrixEntry(COMPLEXITY.CRITICAL, PROVIDERS.OPENAI, 'gpt-4o')
    }
  }
}

export function computeComplexityLevel({ feature, sceneBrief, storyArc, chapterIndex, totalChapters }) {
  let score = 0

  const highNeedFeatures = [FEATURES.STORY_GENERATION, FEATURES.POV_WRITING, FEATURES.POLISH]
  const mediumNeedFeatures = [FEATURES.CONTENT, FEATURES.CHARACTER_CHAT, FEATURES.WORLDBUILDING]

  if (highNeedFeatures.includes(feature)) {
    score += 3
  } else if (mediumNeedFeatures.includes(feature)) {
    score += 2
  } else {
    score += 1
  }

  if (sceneBrief) {
    if (sceneBrief.emotionalGoal) score += 1
    if (sceneBrief.pov) score += 1

    const tension = (sceneBrief.tension || 'medium').toLowerCase()
    if (tension === 'climax' || tension === 'peak') score += 3
    else if (tension === 'high') score += 2

    const pacing = (sceneBrief.pacing || 'medium').toLowerCase()
    if (pacing === 'intense') score += 1

    const wordTarget = sceneBrief.estimatedWords || 800
    if (wordTarget >= 2000) score += 2
    else if (wordTarget >= 1200) score += 1
  }

  if (totalChapters > 1 && chapterIndex !== undefined) {
    if (chapterIndex === 0 || chapterIndex === totalChapters - 1) score += 1
    if (chapterIndex === 1 || chapterIndex === totalChapters - 2) score += 1
  }

  if (score >= 6) return COMPLEXITY.CRITICAL
  if (score >= 3) return COMPLEXITY.STANDARD
  return COMPLEXITY.DRAFT
}

export function getModelMetadata(provider, model) {
  if (!model) return null
  const meta = MODEL_META[model]
  if (meta) return meta
  return null
}

export function resolveOptimalModel(feature, options = {}) {
  const complexity = options.complexity || COMPLEXITY.STANDARD
  const workspaceType = options.workspaceType

  const store = useSettingsStore()
  const override = store.featureModels?.[feature]

  const defaultModelFor = (provider) =>
    provider === PROVIDERS.OLLAMA ? store.ollamaModel : PROVIDER_MODELS[provider]?.[0] || null

  const fullMatch = (entry) => ({
    provider: entry.provider,
    model: entry.model || defaultModelFor(entry.provider),
    matrixMatch: true,
    complexity: entry.complexity
  })

  if (workspaceType && WORKSPACE_OVERRIDES[workspaceType]) {
    const wsOverrides = WORKSPACE_OVERRIDES[workspaceType]
    if (wsOverrides[feature] && wsOverrides[feature][complexity]) {
      return fullMatch(wsOverrides[feature][complexity])
    }
  }

  if (BASE_MATRIX[feature] && BASE_MATRIX[feature][complexity]) {
    return fullMatch(BASE_MATRIX[feature][complexity])
  }

  if (override?.provider && override.provider !== 'default') {
    return {
      provider: override.provider,
      model: override.model || defaultModelFor(override.provider),
      matrixMatch: false
    }
  }

  const config = FEATURE_DEFAULTS[feature] || {}
  return {
    provider: config.provider || store.aiProvider,
    model: config.model || defaultModelFor(config.provider || store.aiProvider),
    matrixMatch: false
  }
}

export function getOptimalModel(feature, options = {}) {
  return resolveOptimalModel(feature, options).model
}

export function getOptimalProvider(feature, options = {}) {
  return resolveOptimalModel(feature, options).provider
}
