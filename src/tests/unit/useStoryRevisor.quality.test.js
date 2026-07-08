import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockDocPrompts = {
  creative: { revisor: 'creative-revisor-prompt' },
  novel: { revisor: 'novel-revisor-prompt' }
}

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: mockDocPrompts
}))

describe('Revisor Quality — reviseScene edge cases and measurement', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns draft unchanged when no major issues present', async () => {
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()
    const draft = 'A perfectly fine scene draft with no problems at all.'

    const result = await revisor.reviseScene({
      draft,
      critiqueResult: {
        issues: [{ severity: 'minor', type: 'style', description: 'Tiny nitpick' }]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'G', charactersPresent: ['A'], tension: 'low' },
      storyBible: 'B'
    })

    expect(result).toBe(draft)
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('returns draft unchanged when only 1 minor issue', async () => {
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()

    const result = await revisor.reviseScene({
      draft: 'Some scene.',
      critiqueResult: { issues: [{ severity: 'minor', type: 'grammar', description: 'Typo' }] },
      sceneBrief: { title: 'T', emotionalGoal: 'H', charactersPresent: ['A'], tension: 'm' },
      storyBible: 'B'
    })

    expect(result).toBe('Some scene.')
  })

  it('returns draft on AI failure', async () => {
    mockAiGenerate.mockRejectedValue(new Error('API down'))

    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const { useProjectStore } = await import('@/stores/projectStore')
    useProjectStore().currentCategory = 'creative'

    const revisor = useStoryRevisor()

    const result = await revisor.reviseScene({
      draft: 'Scene text with major issue.',
      critiqueResult: { issues: [{ severity: 'major', type: 'plot', description: 'Fix this' }] },
      sceneBrief: { title: 'T', emotionalGoal: 'S', charactersPresent: ['B'], tension: 'h' },
      storyBible: 'B'
    })

    expect(result).toBe('Scene text with major issue.')
  })

  it('calls AI with correct prompt when major issues exist', async () => {
    mockAiGenerate.mockResolvedValue('Revised text with enough words for passing.')

    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const { useProjectStore } = await import('@/stores/projectStore')
    useProjectStore().currentCategory = 'novel'

    const revisor = useStoryRevisor()

    await revisor.reviseScene({
      draft: 'Scene with some text to revise.',
      critiqueResult: {
        issues: [
          { severity: 'major', type: 'plot_hole', description: 'Missing setup for ending' },
          { severity: 'major', type: 'character_voice', description: 'Character sounds wrong' }
        ]
      },
      sceneBrief: { title: 'T', emotionalGoal: 'A', charactersPresent: ['C'], tension: 'h' },
      storyBible: 'Bible content'
    })

    expect(mockAiGenerate).toHaveBeenCalled()

    const [userPrompt, systemPrompt, options] = mockAiGenerate.mock.calls[0]
    expect(systemPrompt).toBe('novel-revisor-prompt')
    expect(userPrompt).toContain('plot_hole')
    expect(userPrompt).toContain('character_voice')
    expect(userPrompt).toContain('Missing setup for ending')
    expect(userPrompt).toContain('T')
    expect(options).toHaveProperty('temperature')
  })

  it('passes mixed severity issues to AI correctly', async () => {
    mockAiGenerate.mockResolvedValue('Revised text with several fixes.')

    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const { useProjectStore } = await import('@/stores/projectStore')
    useProjectStore().currentCategory = 'creative'

    const revisor = useStoryRevisor()

    const result = await revisor.reviseScene({
      draft: 'Text with several issues present.',
      critiqueResult: {
        issues: [
          { severity: 'major', type: 'plot', description: 'Major plot issue' },
          { severity: 'minor', type: 'style', description: 'Small style issue' },
          { severity: 'minor', type: 'grammar', description: 'Tiny grammar fix' }
        ]
      },
      sceneBrief: { title: 'S1', emotionalGoal: 'Excited', charactersPresent: ['X'], tension: 'high' },
      storyBible: 'B'
    })

    expect(result).toBe('Revised text with several fixes.')
    expect(mockAiGenerate).toHaveBeenCalledTimes(1)
  })

  it('handles empty issues array by returning draft', async () => {
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()

    const result = await revisor.reviseScene({
      draft: 'Text with no issues.',
      critiqueResult: { issues: [] },
      sceneBrief: { title: 'T', emotionalGoal: 'G', charactersPresent: ['A'], tension: 'm' },
      storyBible: 'B'
    })

    expect(result).toBe('Text with no issues.')
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('uses creative prompt as fallback for unknown workspace types', async () => {
    mockAiGenerate.mockResolvedValue('Revised text with a few words.')

    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const { useProjectStore } = await import('@/stores/projectStore')
    useProjectStore().currentCategory = 'unknown_type'

    const revisor = useStoryRevisor()

    await revisor.reviseScene({
      draft: 'Text with major issue.',
      critiqueResult: { issues: [{ severity: 'major', type: 'error', description: 'Big problem' }] },
      sceneBrief: { title: 'T', emotionalGoal: 'G', charactersPresent: ['A'], tension: 'm' },
      storyBible: 'B'
    })

    const [, systemPrompt] = mockAiGenerate.mock.calls[0]
    expect(systemPrompt).toBe('creative-revisor-prompt')
  })
})
