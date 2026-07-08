import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useStoryRevisor } from '../composables/useStoryRevisor'

vi.mock('../services/aiService', () => ({
  aiGenerate: vi.fn()
}))
import { aiGenerate } from '../services/aiService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useStoryRevisor — reviseScene', () => {
  it('returns draft unchanged when there are no issues', async () => {
    const { reviseScene } = useStoryRevisor()
    const draft = 'This is a test draft.'

    const result = await reviseScene({
      draft,
      critiqueResult: { issues: [] },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(result).toBe(draft)
    expect(aiGenerate).not.toHaveBeenCalled()
  })

  it('returns draft unchanged when 2 minor issues (within threshold)', async () => {
    const { reviseScene } = useStoryRevisor()
    const draft = 'Test draft.'

    const result = await reviseScene({
      draft,
      critiqueResult: {
        issues: [
          { severity: 'minor', type: 'grammar', description: 'typo' },
          { severity: 'minor', type: 'style', description: 'wordy' }
        ]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(result).toBe(draft)
    expect(aiGenerate).not.toHaveBeenCalled()
  })

  it('calls aiGenerate when there are major issues', async () => {
    aiGenerate.mockResolvedValue('Revised draft text.')
    const { reviseScene } = useStoryRevisor()
    const draft = 'Original draft with problems.'

    const result = await reviseScene({
      draft,
      critiqueResult: {
        issues: [{ severity: 'major', type: 'plot', description: 'Plot hole' }]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(result).toBe('Revised draft text.')
    expect(aiGenerate).toHaveBeenCalledTimes(1)
  })

  it('calls aiGenerate when more than 2 minor issues', async () => {
    aiGenerate.mockResolvedValue('Revised text.')
    const { reviseScene } = useStoryRevisor()
    const draft = 'Original draft.'

    const result = await reviseScene({
      draft,
      critiqueResult: {
        issues: [
          { severity: 'minor', type: 'a', description: 'x' },
          { severity: 'minor', type: 'b', description: 'y' },
          { severity: 'minor', type: 'c', description: 'z' }
        ]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(result).toBe('Revised text.')
    expect(aiGenerate).toHaveBeenCalledTimes(1)
  })

  it('uses major issues (not minor) when both present', async () => {
    aiGenerate.mockResolvedValue('Revised.')
    const { reviseScene } = useStoryRevisor()
    const draft = 'Draft.'
    const issues = [
      { severity: 'major', type: 'plot', description: 'Plot hole' },
      { severity: 'minor', type: 'style', description: 'Wordy' }
    ]

    await reviseScene({
      draft,
      critiqueResult: { issues },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    const prompt = aiGenerate.mock.calls[0][0]
    expect(prompt).toContain('[major]')
    expect(prompt).not.toContain('[minor]')
  })

  it('includes word count constraints in the prompt', async () => {
    aiGenerate.mockResolvedValue('Revised text.')
    const { reviseScene } = useStoryRevisor()
    const draft = Array(101).join('word ').trim()

    await reviseScene({
      draft,
      critiqueResult: {
        issues: [{ severity: 'major', type: 'plot', description: 'Bad' }]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    const prompt = aiGenerate.mock.calls[0][0]
    expect(prompt).toContain('The original draft is 100 words')
    expect(prompt).toContain('between 85 and 115')
  })

  it('returns draft as fallback when aiGenerate throws', async () => {
    aiGenerate.mockRejectedValue(new Error('API error'))
    const { reviseScene } = useStoryRevisor()
    const draft = 'Original draft.'

    const result = await reviseScene({
      draft,
      critiqueResult: {
        issues: [{ severity: 'major', type: 'plot', description: 'Plot hole' }]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(result).toBe(draft)
  })

  it('passes revisor system prompt to aiGenerate with temperature 0.4', async () => {
    aiGenerate.mockResolvedValue('Revised.')
    const { reviseScene } = useStoryRevisor()

    await reviseScene({
      draft: 'Original draft.',
      critiqueResult: {
        issues: [{ severity: 'major', type: 'plot', description: 'Plot hole' }]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(aiGenerate).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ temperature: 0.4, feature: 'story_generation' })
    )
  })

  it('tracks isRevising state correctly', async () => {
    let resolvePromise
    aiGenerate.mockReturnValue(new Promise(r => { resolvePromise = r }))
    const { reviseScene, isRevising } = useStoryRevisor()

    const promise = reviseScene({
      draft: 'Original',
      critiqueResult: {
        issues: [{ severity: 'major', type: 'plot', description: 'Plot hole' }]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'E', charactersPresent: ['A'], tension: 'L' },
      storyBible: 'B'
    })

    expect(isRevising.value).toBe(true)
    resolvePromise('Revised.')
    await promise
    expect(isRevising.value).toBe(false)
  })
})
