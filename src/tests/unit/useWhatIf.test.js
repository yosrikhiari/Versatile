import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerateJson = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative'
}

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDERS: { OLLAMA: 'ollama' },
  PROVIDER_DEFAULT: 'ollama',
  FEATURE_DEFAULTS: {},
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.7 }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

let useWhatIf
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useWhatIf')
  useWhatIf = mod.useWhatIf
})

const mockAlternatives = {
  alternatives: [
    { title: 'She refuses', prose: 'She shook her head slowly.', styleNote: 'Defiant' },
    { title: 'A third party intervenes', prose: 'The door burst open.', styleNote: 'Action' },
    { title: 'He concedes', prose: 'He lowered his eyes.', styleNote: 'Subdued' }
  ]
}

describe('generateAlternatives', () => {
  it('returns alternatives from aiGenerateJson', async () => {
    mockAiGenerateJson.mockResolvedValue(mockAlternatives)
    const { generateAlternatives, alternatives } = useWhatIf()
    const result = await generateAlternatives({
      sceneProse: 'He stood at the window.',
      sceneBrief: { goal: 'Decision', obstacle: 'Fear' },
      chapterLog: []
    })
    expect(result).toEqual(mockAlternatives.alternatives)
    expect(alternatives.value).toEqual(mockAlternatives.alternatives)
  })

  it('sets isGenerating ref correctly', async () => {
    let resolve
    mockAiGenerateJson.mockReturnValue(new Promise((r) => (resolve = r)))
    const { generateAlternatives, isGenerating } = useWhatIf()
    const promise = generateAlternatives({
      sceneProse: 'Test.',
      sceneBrief: {},
      chapterLog: []
    })
    expect(isGenerating.value).toBe(true)
    resolve(mockAlternatives)
    await promise
    expect(isGenerating.value).toBe(false)
  })

  it('throws and sets error on failure', async () => {
    mockAiGenerateJson.mockRejectedValue(new Error('API unavailable'))
    const { generateAlternatives, error } = useWhatIf()
    await expect(
      generateAlternatives({ sceneProse: 'Test.', sceneBrief: {}, chapterLog: [] })
    ).rejects.toThrow('API unavailable')
    expect(error.value).toBe('API unavailable')
  })

  it('clears previous alternatives before generation', async () => {
    mockAiGenerateJson.mockResolvedValue(mockAlternatives)
    const { generateAlternatives, alternatives } = useWhatIf()
    alternatives.value = [{ title: 'Old', prose: 'Old prose', styleNote: '' }]
    expect(alternatives.value.length).toBe(1)
    await generateAlternatives({ sceneProse: 'Test.', sceneBrief: {}, chapterLog: [] })
    expect(alternatives.value.length).toBe(3)
  })
})

describe('clear', () => {
  it('resets alternatives and error', () => {
    const { alternatives, error, clear } = useWhatIf()
    alternatives.value = [{ title: 'X', prose: 'X', styleNote: '' }]
    error.value = 'something went wrong'
    clear()
    expect(alternatives.value).toEqual([])
    expect(error.value).toBeNull()
  })
})

describe('applyAlternative', () => {
  it('returns prose for a valid index', () => {
    const { alternatives, generateAlternatives, applyAlternative } = useWhatIf()
    alternatives.value = mockAlternatives.alternatives
    const prose = applyAlternative(1)
    expect(prose).toBe('The door burst open.')
  })

  it('returns null for an out-of-range index', () => {
    const { applyAlternative } = useWhatIf()
    expect(applyAlternative(99)).toBeNull()
  })
})
