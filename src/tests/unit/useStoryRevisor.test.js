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
})
