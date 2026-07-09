import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockDocPrompts = {
  creative: {
    critic: `You are a story critic. Score 1-10. Return JSON with score, issues, strengths.`
  }
}

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiGenerateStructured: async (...args) => {
    const r = await mockAiGenerate(...args)
    if (r && typeof r === 'object') return r
    const cleaned = String(r)
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('structured parse failed')
    return JSON.parse(m[0])
  }
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: mockDocPrompts
}))

function makeResponse(overrides = {}) {
  return JSON.stringify({
    score: overrides.score ?? 8,
    issues: overrides.issues ?? [],
    strengths: overrides.strengths ?? ['Good prose']
  })
}

describe('Critic Consistency — evaluateScene parsing & scoring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('parses a valid AI response correctly', async () => {
    mockAiGenerate.mockResolvedValue(
      makeResponse({
        score: 9,
        issues: [{ type: 'pacing', severity: 'minor', description: 'Slightly fast' }],
        strengths: ['Engaging']
      })
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(result.pass).toBe(true)
    expect(result.score).toBe(9)
    expect(result.issues).toHaveLength(1)
    expect(result.strengths).toEqual(['Engaging'])
  })

  it('flags scene as not-passing when major issues exist', async () => {
    mockAiGenerate.mockResolvedValue(
      makeResponse({
        score: 4,
        issues: [{ type: 'plot_hole', severity: 'major', description: 'Missing setup' }],
        strengths: []
      })
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(result.pass).toBe(false)
    expect(result.score).toBe(4)
  })

  it('flags scene as not-passing when more than 2 minor issues exist', async () => {
    mockAiGenerate.mockResolvedValue(
      makeResponse({
        score: 6,
        issues: [
          { type: 'style', severity: 'minor', description: 'A' },
          { type: 'style', severity: 'minor', description: 'B' },
          { type: 'style', severity: 'minor', description: 'C' }
        ],
        strengths: ['Readable']
      })
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: '## Character1\n## Character2',
      chapterLog: ''
    })

    expect(result.pass).toBe(false)
  })

  it('handles malformed JSON by returning default pass', async () => {
    mockAiGenerate.mockResolvedValue('not json at all')

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(result.pass).toBe(true)
    // Parse failure must NOT fabricate a passing score — it's flagged unavailable
    expect(result.score).toBe(null)
    expect(result.evalUnavailable).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('handles markdown-fenced JSON', async () => {
    mockAiGenerate.mockResolvedValue(
      '```json\n{"score": 6, "issues": [{"type": "pacing", "severity": "minor", "description": "Rushed"}], "strengths": []}\n```'
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(result.score).toBe(6)
    expect(result.issues).toHaveLength(1)
  })

  it('passes when fewer than 2 characters and no major issues', async () => {
    mockAiGenerate.mockResolvedValue(
      makeResponse({
        score: 7,
        issues: [{ type: 'style', severity: 'minor', description: 'Tweak needed' }],
        strengths: []
      })
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: '## Only one character', // matches countCharacters regex
      chapterLog: ''
    })

    expect(result.pass).toBe(true)
  })

  it('uses workspace-specific prompts when available', async () => {
    mockDocPrompts.novel = { critic: 'Novel-specific critic prompt' }
    mockAiGenerate.mockResolvedValue(makeResponse({ score: 7, issues: [], strengths: [] }))

    const { useProjectStore } = await import('@/stores/projectStore')
    const projectStore = useProjectStore()
    projectStore.currentCategory = 'novel'

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    const [, systemPrompt] = mockAiGenerate.mock.calls[0]
    expect(systemPrompt).toBe('Novel-specific critic prompt')
  })

  it('falls back to creative prompts for unknown workspace types', async () => {
    mockAiGenerate.mockResolvedValue(makeResponse())

    const { useProjectStore } = await import('@/stores/projectStore')
    const projectStore = useProjectStore()
    projectStore.currentCategory = 'sci_fi'

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    const [, systemPrompt] = mockAiGenerate.mock.calls[0]
    expect(systemPrompt).toBe(mockDocPrompts.creative.critic)
  })

  it('handles AI throwing an error gracefully', async () => {
    mockAiGenerate.mockRejectedValue(new Error('Network failure'))

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(result.pass).toBe(true)
    // Critic error must NOT fabricate a passing score — it's flagged unavailable
    expect(result.score).toBe(null)
    expect(result.evalUnavailable).toBe(true)
    expect(result.strengths[0]).toContain('unavailable')
  })

  it('preserves all issue types and severities from AI response', async () => {
    mockAiGenerate.mockResolvedValue(
      makeResponse({
        score: 5,
        issues: [
          { type: 'plot_hole', severity: 'major', description: 'Missing clue' },
          { type: 'character_voice', severity: 'major', description: 'OOC dialogue' },
          { type: 'pacing', severity: 'minor', description: 'Slightly rushed ending' },
          { type: 'continuity', severity: 'minor', description: 'Time skip unclear' }
        ],
        strengths: ['Good dialogue', 'Strong opening']
      })
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const result = await critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(result.issues).toHaveLength(4)
    expect(result.issues.filter((i) => i.severity === 'major')).toHaveLength(2)
    expect(result.issues.filter((i) => i.severity === 'minor')).toHaveLength(2)
    expect(result.pass).toBe(false)
  })

  it('tracks evaluating state', async () => {
    mockAiGenerate.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(makeResponse()), 50))
    )

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const promise = critic.evaluateScene({
      draft: 'Scene text.',
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: 'Bible',
      chapterLog: ''
    })

    expect(critic.isEvaluating.value).toBe(true)
    await promise
    expect(critic.isEvaluating.value).toBe(false)
  })
})
