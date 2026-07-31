import { PROVIDERS, FEATURES, FEATURE_DEFAULTS, PROVIDER_MODELS } from './ai'
import { WORKSPACE_TYPES as WS_TYPES } from './workspace'
import { useSettingsStore } from '../stores/settingsStore'
import { usePreferenceStore } from '../stores/preferenceStore'
import { getApiKeyStorageKey } from './storageKeys'

/**
 * Whether a provider can actually be called right now.
 *
 * Ollama is local and needs no credential. Every hosted provider does, and the
 * key's presence is readable synchronously — only decrypting it is async — so
 * routing can consult it without becoming async itself.
 */
export function isProviderUsable(provider: string): boolean {
  if (!provider) return false
  if (provider === PROVIDERS.OLLAMA) return true
  try {
    return !!localStorage.getItem(getApiKeyStorageKey(provider))
  } catch {
    // No localStorage (SSR, tests): assume configured rather than routing
    // everything to a fallback on an environment detail.
    return true
  }
}

const WORKSPACE_TYPES: Record<string, string> = WS_TYPES

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
  'allam-2-7b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 8192, capabilityTier: COST_TIERS.BUDGET },

  // Local Ollama models. Without entries here `getContextWindow` returns null for
  // every local model, so `maxOutputTokensForModel` fell back to a flat 4,096
  // regardless of the prompt — which is how a three-scene planning call was
  // handed the same runway as a hundred-chapter one and simply ran until it was
  // cut off. Context windows are the models' real ones as reported by /api/tags.
  'qwen3:8b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.SLOW, contextWindow: 40960, capabilityTier: COST_TIERS.STANDARD },
  'phi4-mini:3.8b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.FAST, contextWindow: 131072, capabilityTier: COST_TIERS.BUDGET },
  'dolphin-mistral:7b': { costTier: COST_TIERS.BUDGET, speedTier: SPEED_TIERS.MEDIUM, contextWindow: 32768, capabilityTier: COST_TIERS.BUDGET }
}

/**
 * Learn a local model's real context window at runtime.
 *
 * Which models exist is a property of the user's machine, not of this file, so
 * the static table above can only ever cover the common ones. `/api/tags`
 * reports `context_length` per model; feeding that in here keeps token budgets
 * honest for models we have never heard of instead of silently assuming 8K.
 */
export function registerLocalModelMeta(
  model: string,
  meta: { contextWindow: number; speedTier?: string }
) {
  if (!model || !meta?.contextWindow) return
  ;(MODEL_META as Record<string, unknown>)[model] = {
    costTier: COST_TIERS.BUDGET,
    speedTier: meta.speedTier || SPEED_TIERS.MEDIUM,
    contextWindow: meta.contextWindow,
    capabilityTier: COST_TIERS.BUDGET
  }
}

function matrixEntry(complexity: any, provider: any, model: any) {
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

export function computeComplexityLevel({ feature, sceneBrief, storyArc, chapterIndex, totalChapters }: any) {
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

export function getModelMetadata(provider: any, model: any) {
  if (!model) return null
  const meta = MODEL_META[model as keyof typeof MODEL_META]
  if (meta) return meta
  return null
}

export function resolveOptimalModel(feature: any, options: any = {}) {
  const complexity = options.complexity || COMPLEXITY.STANDARD
  const workspaceType = options.workspaceType

  const store = useSettingsStore()
  const override = store.featureModels?.[feature]

  const defaultModelFor = (provider: any): any =>
    provider === PROVIDERS.OLLAMA ? store.ollamaModel : PROVIDER_MODELS[provider]?.[0] || null

  const fullMatch = (entry: any) => ({
    provider: entry.provider,
    model: entry.model || defaultModelFor(entry.provider),
    matrixMatch: true,
    complexity: entry.complexity
  })

  // An explicit per-feature choice outranks the matrix.
  //
  // This used to be consulted only AFTER the matrix, and the matrix has an entry
  // for every feature at every complexity — so the setting was unreachable for
  // any call that passed a complexity (which is every scene the writer makes).
  // A user running Ollama-only would have their choice silently discarded and a
  // cloud provider attempted instead. The matrix is a default; a setting the user
  // deliberately made is not something to route around.
  if (override?.provider && override.provider !== 'default') {
    return {
      provider: override.provider,
      model: override.model || defaultModelFor(override.provider),
      matrixMatch: false
    }
  }

  if (workspaceType && WORKSPACE_OVERRIDES[workspaceType]) {
    const wsOverrides = WORKSPACE_OVERRIDES[workspaceType]
    if (wsOverrides[feature] && wsOverrides[feature][complexity]) {
      return fullMatch(wsOverrides[feature][complexity])
    }
  }

  if (BASE_MATRIX[feature] && BASE_MATRIX[feature][complexity]) {
    return fullMatch(BASE_MATRIX[feature][complexity])
  }

  const config: any = FEATURE_DEFAULTS[feature as keyof typeof FEATURE_DEFAULTS] || {}
  return {
    provider: config.provider || store.aiProvider,
    model: config.model || defaultModelFor(config.provider || store.aiProvider),
    matrixMatch: false
  }
}

export function resolveOptimalModelWithPreferences(feature: any, options: any = {}) {
  const base = resolveOptimalModel(feature, options)

  if (options.projectId) {
    try {
      const prefStore = usePreferenceStore()
      const weight = prefStore.getPreferenceWeight(base.provider, base.model)
      if (weight > 1.1) {
        return { ...base, preferenceBoost: weight, preferredMatch: true }
      }
    } catch {
    }
  }

  return { ...base, preferenceBoost: 1, preferredMatch: false }
}

export function getOptimalModel(feature: any, options: any) {
  return resolveOptimalModel(feature, options).model
}

export function getOptimalProvider(feature: any, options: any) {
  return resolveOptimalModel(feature, options).provider
}
