import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerateJson = vi.fn()
const mockAiGenerate = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative'
}

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...args) => mockAiGenerateJson(...args),
  aiGenerate: (...args) => mockAiGenerate(...args)
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
  const mod1 = await import('@/composables/useWhatIf')
  useWhatIf = mod1.useWhatIf
})

const SAMPLE_SCENE = {
  sceneProse:
    'The rain hammered the window of the interrogation room. ' +
    'Mara sat across from a man who called himself Elias Thorne. ' +
    '"You know why you are here," she said. Elias smiled.',
  sceneBrief: {
    goal: 'Extract confession about the missing persons',
    obstacle: 'Suspect is intelligent and manipulative',
    stakes: 'If she pushes too hard, he walks. If she does not, the trail goes cold.',
    setting: 'Police interrogation room, 2 AM, raining'
  },
  chapterLog: [
    'Chapter 1: Mara discovers a connection to Elias',
    'Chapter 2: Elias turns himself in voluntarily'
  ],
  storyArc: {
    genre: 'Crime thriller',
    tone: 'Gritty and atmospheric',
    centralConflict: 'Truth vs power'
  },
  voiceProfile: 'First person limited, present tense',
  activeCraftRules: ["Show don't tell emotional states", 'Every scene must turn']
}

describe('useWhatIf - full pipeline', () => {
  it('generates alternatives and applies one', async () => {
    mockAiGenerateJson.mockResolvedValue({
      alternatives: [
        { title: 'She refuses', prose: 'She shook her head slowly.', styleNote: 'Defiant' },
        { title: 'A third party intervenes', prose: 'The door burst open.', styleNote: 'Action' },
        { title: 'He concedes', prose: 'He lowered his eyes.', styleNote: 'Subdued' }
      ]
    })

    const { generateAlternatives, alternatives, applyAlternative, isGenerating, error } =
      useWhatIf()

    const result = await generateAlternatives(SAMPLE_SCENE)

    expect(result).toHaveLength(3)
    expect(alternatives.value).toHaveLength(3)
    expect(isGenerating.value).toBe(false)
    expect(error.value).toBeNull()
    expect(new Set(result.map((a) => a.title)).size).toBe(3)
    expect(applyAlternative(1)).toBe('The door burst open.')
    expect(applyAlternative(99)).toBeNull()

    const [systemPrompt] = mockAiGenerateJson.mock.calls[0]
    expect(systemPrompt).toContain('CURRENT SCENE PROSE:')
    expect(systemPrompt).toContain('SCENE BRIEF:')
  })
})
