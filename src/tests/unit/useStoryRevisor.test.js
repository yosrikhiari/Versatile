import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockDocPrompts = {
  creative: { revisor: 'creative-revisor-prompt' },
  nonfiction: { revisor: 'nonfiction-revisor-prompt' }
}

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: mockDocPrompts
}))

describe('useStoryRevisor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('exports reviseScene and isRevising', async () => {
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()
    expect(revisor).toHaveProperty('reviseScene')
    expect(revisor).toHaveProperty('isRevising')
    expect(revisor.isRevising.value).toBe(false)
  })

  it('returns draft unchanged when few minor issues', async () => {
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()
    const draft = 'This is a scene draft.'
    const result = await revisor.reviseScene({
      draft,
      critiqueResult: {
        issues: [{ severity: 'minor', type: 'style', description: 'Needs polish' }]
      },
      sceneBrief: {
        title: 'Test',
        emotionalGoal: 'Excited',
        charactersPresent: ['Alice'],
        tension: 'medium'
      },
      storyBible: 'Some bible'
    })
    expect(result).toBe(draft)
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('calls aiGenerate for major issues', async () => {
    mockAiGenerate.mockResolvedValue('Revised text')
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const { useProjectStore } = await import('@/stores/projectStore')
    const projectStore = useProjectStore()
    projectStore.activeWorkspaceType = 'creative'

    const revisor = useStoryRevisor()
    const draft = 'This is a longer scene draft with several words to test revision.'
    const result = await revisor.reviseScene({
      draft,
      critiqueResult: {
        issues: [{ severity: 'major', type: 'plot_hole', description: 'Missing motivation' }]
      },
      sceneBrief: {
        title: 'Test',
        emotionalGoal: 'Sad',
        charactersPresent: ['Bob'],
        tension: 'high'
      },
      storyBible: 'Bible content'
    })
    expect(result).toBe('Revised text')
    expect(mockAiGenerate).toHaveBeenCalled()
  })

  it('returns draft on AI failure', async () => {
    mockAiGenerate.mockRejectedValue(new Error('AI error'))
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()
    const draft = 'Scene text that should be returned on error.'
    const result = await revisor.reviseScene({
      draft,
      critiqueResult: { issues: [{ severity: 'major', type: 'continuity', description: 'Error' }] },
      sceneBrief: { title: 'X', emotionalGoal: 'Happy', charactersPresent: ['C'], tension: 'low' },
      storyBible: 'B'
    })
    expect(result).toBe(draft)
  })

  it('tracks revising state', async () => {
    mockAiGenerate.mockImplementation(() => new Promise((r) => setTimeout(() => r('Revised'), 50)))
    const { useStoryRevisor } = await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()
    const promise = revisor.reviseScene({
      draft: 'text',
      critiqueResult: { issues: [{ severity: 'major', type: 'error', description: 'Fix' }] },
      sceneBrief: { title: 'T', emotionalGoal: 'G', charactersPresent: ['A'], tension: 'm' },
      storyBible: 'B'
    })
    expect(revisor.isRevising.value).toBe(true)
    await promise
    expect(revisor.isRevising.value).toBe(false)
  })

  it('short-circuits at exactly MAX_MINOR_ISSUES_SHORT_CIRCUIT minors', async () => {
    const { useStoryRevisor, MAX_MINOR_ISSUES_SHORT_CIRCUIT } =
      await import('@/composables/useStoryRevisor')
    expect(MAX_MINOR_ISSUES_SHORT_CIRCUIT).toBe(2)
    const revisor = useStoryRevisor()
    const draft = 'Scene text at the boundary.'
    const issues = Array.from({ length: MAX_MINOR_ISSUES_SHORT_CIRCUIT }, (_, i) => ({
      severity: 'minor',
      type: 'style',
      description: `Polish ${i}`
    }))
    const result = await revisor.reviseScene({
      draft,
      critiqueResult: { issues },
      sceneBrief: { title: 'T', emotionalGoal: 'G', charactersPresent: ['A'], tension: 'm' },
      storyBible: 'B'
    })
    expect(result).toBe(draft)
    expect(mockAiGenerate).not.toHaveBeenCalled()
  })

  it('revises one past the short-circuit boundary', async () => {
    mockAiGenerate.mockResolvedValue('Revised text that is about the same length here')
    const { useStoryRevisor, MAX_MINOR_ISSUES_SHORT_CIRCUIT } =
      await import('@/composables/useStoryRevisor')
    const revisor = useStoryRevisor()
    const issues = Array.from({ length: MAX_MINOR_ISSUES_SHORT_CIRCUIT + 1 }, (_, i) => ({
      severity: 'minor',
      type: 'style',
      description: `Polish ${i}`
    }))
    await revisor.reviseScene({
      draft: 'A scene draft of moderate length for word band checks.',
      critiqueResult: { issues },
      sceneBrief: { title: 'T', emotionalGoal: 'G', charactersPresent: ['A'], tension: 'm' },
      storyBible: 'B'
    })
    expect(mockAiGenerate).toHaveBeenCalled()
  })

  it('exposes the word-count tolerance as a named constant', async () => {
    const { REVISION_WORD_TOLERANCE } = await import('@/composables/useStoryRevisor')
    expect(REVISION_WORD_TOLERANCE).toBe(0.15)
  })
})
