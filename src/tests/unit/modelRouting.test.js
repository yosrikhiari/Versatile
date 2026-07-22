import { describe, it, expect, vi } from 'vitest'
import { PROVIDERS, FEATURES, FEATURE_DEFAULTS, PROVIDER_MODELS } from '../../config/ai'

vi.mock('../../config/ai', () => ({
  PROVIDERS: {
    OLLAMA: 'ollama',
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GEMINI: 'gemini',
    GROQ: 'groq'
  },
  FEATURES: {
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
  },
  FEATURE_DEFAULTS: {
    spark: { provider: 'ollama', model: null },
    polish: { provider: 'ollama', model: null },
    content: { provider: 'ollama', model: null },
    worldbuilding: { provider: 'ollama', model: null },
    compaction: { provider: 'ollama', model: null },
    story_generation: { provider: 'ollama', model: null },
    network: { provider: 'ollama', model: null },
    tagging: { provider: 'ollama', model: null },
    character_chat: { provider: 'ollama', model: null },
    pov_writing: { provider: 'ollama', model: null },
    shape_analysis: { provider: 'ollama', model: null },
    blurb: { provider: 'ollama', model: null }
  },
  PROVIDER_MODELS: {
    ollama: ['llama3'],
    openai: ['gpt-4o-mini', 'gpt-4o'],
    anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-5'],
    gemini: ['gemini-2.5-flash'],
    groq: ['llama-3.3-70b-versatile']
  },
  PROVIDER_LABELS: {},
  PROVIDER_DEFAULT: 'ollama'
}))

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn(() => ({
    featureModels: {},
    aiProvider: 'ollama',
    ollamaModel: 'llama3'
  }))
}))

vi.mock('../../config/workspace', () => ({
  WORKSPACE_TYPES: {
    CREATIVE: 'creative',
    NOVEL: 'novel',
    LEGAL: 'legal',
    TECHNICAL: 'technical',
    BUSINESS: 'business',
    RESEARCH: 'research'
  }
}))

vi.mock('../../services/aiService', () => ({
  aiGenerate: vi.fn(() => Promise.resolve('{ "key": "val" }'))
}))

describe('resolveOptimalModel', () => {
  let modelRouting

  beforeAll(async () => {
    modelRouting = await import('../../config/modelRouting')
  })

  it('returns standard complexity for CONTENT by default', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.CONTENT)
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o')
    expect(result.matrixMatch).toBe(true)
  })

  it('returns draft model for SPARK at DRAFT complexity', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.SPARK, {
      complexity: modelRouting.COMPLEXITY.DRAFT
    })
    expect(result.provider).toBe('ollama')
    expect(result.model).toBe('llama3')
    expect(result.matrixMatch).toBe(true)
  })

  it('escalates CONTENT from draft through critical', () => {
    const draft = modelRouting.resolveOptimalModel(FEATURES.CONTENT, {
      complexity: modelRouting.COMPLEXITY.DRAFT
    })
    expect(draft.model).toBe('gpt-4o-mini')

    const standard = modelRouting.resolveOptimalModel(FEATURES.CONTENT, {
      complexity: modelRouting.COMPLEXITY.STANDARD
    })
    expect(standard.model).toBe('gpt-4o')

    const critical = modelRouting.resolveOptimalModel(FEATURES.CONTENT, {
      complexity: modelRouting.COMPLEXITY.CRITICAL
    })
    expect(critical.provider).toBe('anthropic')
    expect(critical.model).toBe('claude-sonnet-4-5')
  })

  it('returns Ollama for TAGGING at all complexity levels', () => {
    for (const c of Object.values(modelRouting.COMPLEXITY)) {
      const result = modelRouting.resolveOptimalModel(FEATURES.TAGGING, { complexity: c })
      expect(result.provider).toBe('ollama')
    }
  })

  it('uses POV_WRITING with Anthropic', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.POV_WRITING)
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-sonnet-4-5')
  })

  it('applies LEGAL workspace override for CONTENT at critical complexity', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.CONTENT, {
      complexity: modelRouting.COMPLEXITY.CRITICAL,
      workspaceType: 'legal'
    })
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-opus-4-5')
  })

  it('applies RESEARCH workspace override for SHAPE_ANALYSIS', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.SHAPE_ANALYSIS, {
      complexity: modelRouting.COMPLEXITY.CRITICAL,
      workspaceType: 'research'
    })
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-sonnet-4-5')
  })

  it('applies TECHNICAL workspace override for CONTENT', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.CONTENT, {
      complexity: modelRouting.COMPLEXITY.STANDARD,
      workspaceType: 'technical'
    })
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4o')
  })

  it('ignores workspace override for CREATIVE (not in overrides)', () => {
    const result = modelRouting.resolveOptimalModel(FEATURES.CONTENT, {
      complexity: modelRouting.COMPLEXITY.STANDARD,
      workspaceType: 'creative'
    })
    expect(result.model).toBe('gpt-4o')
  })
})

describe('getModelMetadata', () => {
  let modelRouting

  beforeAll(async () => {
    modelRouting = await import('../../config/modelRouting')
  })

  it('returns metadata for known model', () => {
    const meta = modelRouting.getModelMetadata('openai', 'gpt-4o')
    expect(meta.costTier).toBe('standard')
    expect(meta.speedTier).toBe('fast')
    expect(meta.contextWindow).toBe(128000)
    expect(meta.capabilityTier).toBe('standard')
  })

  it('returns null for unknown model', () => {
    const meta = modelRouting.getModelMetadata('openai', 'unknown-model')
    expect(meta).toBeNull()
  })

  it('returns null when model is null', () => {
    const meta = modelRouting.getModelMetadata('ollama', null)
    expect(meta).toBeNull()
  })

  it('returns metadata for budget-tier model', () => {
    const meta = modelRouting.getModelMetadata('openai', 'gpt-4o-mini')
    expect(meta.costTier).toBe('budget')
    expect(meta.speedTier).toBe('fast')
  })
})

describe('COMPLEXITY constants', () => {
  let modelRouting

  beforeAll(async () => {
    modelRouting = await import('../../config/modelRouting')
  })

  it('defines three levels in order', () => {
    expect(modelRouting.COMPLEXITY_ORDER).toEqual([
      modelRouting.COMPLEXITY.DRAFT,
      modelRouting.COMPLEXITY.STANDARD,
      modelRouting.COMPLEXITY.CRITICAL
    ])
  })
})

describe('modelRunner integration', () => {
  it('passes complexity and workspaceType through to aiGenerate', async () => {
    const { aiGenerate } = await import('../../services/aiService')

    const { executeGeneration } = await import('../../composables/generation/pipeline/modelRunner')
    await executeGeneration({
      userPrompt: 'test',
      systemPrompt: 'sys',
      schema: { promptKeys: [], modelKeys: [] },
      complexity: 'critical',
      workspaceType: 'legal'
    })

    expect(aiGenerate).toHaveBeenCalledWith('test', 'sys', {
      feature: 'worldbuilding',
      complexity: 'critical',
      workspaceType: 'legal'
    })
  })

  it('omits complexity when not provided', async () => {
    const { aiGenerate } = await import('../../services/aiService')

    const { executeGeneration } = await import('../../composables/generation/pipeline/modelRunner')
    await executeGeneration({
      userPrompt: 'test',
      systemPrompt: 'sys',
      schema: { promptKeys: [], modelKeys: [] }
    })

    expect(aiGenerate).toHaveBeenCalledWith('test', 'sys', {
      feature: 'worldbuilding',
      complexity: undefined,
      workspaceType: undefined
    })
  })
})

describe('computeComplexityLevel', () => {
  let modelRouting

  beforeAll(async () => {
    modelRouting = await import('../../config/modelRouting')
  })

  it('returns DRAFT for low-need feature with no scene factors', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'tagging'
    })
    expect(result).toBe('draft')
  })

  it('returns STANDARD for high-need feature with no scene factors', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'story_generation'
    })
    expect(result).toBe('standard')
  })

  it('elevates to CRITICAL for peak-tension scene with long word target', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'story_generation',
      sceneBrief: {
        tension: 'peak',
        estimatedWords: 3000,
        emotionalGoal: 'Triumph',
        pov: 'Lyra'
      }
    })
    expect(result).toBe('critical')
  })

  it('elevates to STANDARD for high-tension scene on simple feature', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'worldbuilding',
      sceneBrief: {
        tension: 'high',
        estimatedWords: 1500
      }
    })
    expect(result).toBe('standard')
  })

  it('boosts opening chapter position', () => {
    const standard = modelRouting.computeComplexityLevel({
      feature: 'story_generation',
      chapterIndex: 0,
      totalChapters: 10
    })
    expect(standard).toBe('standard')
  })

  it('boosts closing chapter position', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'story_generation',
      chapterIndex: 9,
      totalChapters: 10
    })
    expect(result).toBe('standard')
  })

  it('returns CRITICAL when tension, emotionalGoal, word target, and chapter position combine', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'story_generation',
      sceneBrief: {
        tension: 'climax',
        emotionalGoal: 'Resolution',
        pov: 'Hero',
        estimatedWords: 2500,
        pacing: 'intense'
      },
      chapterIndex: 9,
      totalChapters: 10
    })
    expect(result).toBe('critical')
  })

  it('returns DRAFT for tagging with intense pacing but no other factors', () => {
    const result = modelRouting.computeComplexityLevel({
      feature: 'tagging',
      sceneBrief: {
        pacing: 'intense',
        tension: 'medium',
        estimatedWords: 800
      }
    })
    expect(result).toBe('draft')
  })
})
