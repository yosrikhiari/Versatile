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

// These tests cover the COMBINED critic (one call, five scores) and the
// pipeline wired to it; its mocks answer in that shape. The focused critic is
// the default since §24 and has its own tests (criticIsolation.test.js), so
// pin the combined one here rather than let the default change what is tested.
beforeEach(() => {
  localStorage.setItem('versatile_critic_focused', 'false')
})
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

/**
 * The critic must judge the WHOLE scene, and it must be told the scale.
 *
 * Both of these were broken in production and neither was visible from the
 * outside: `draft.slice(0, 4000)` hid the last 26% of every scene in a real
 * 30-scene run, and the 1-10 rubric in `evalDimensions.ts` was never
 * interpolated into any prompt. The measured cost of the first was 7 of 30
 * scenes failed for `continuity: 6` and sent back for revision; with the full
 * text the same model and the same scenes pass 30/30.
 *
 * This is the third time this codebase has shipped a prompt that silently
 * dropped the end of a scene (see `chunkProseForMetadata` in useStoryWriter),
 * so it is a test, not a comment.
 */
describe('Critic prompt — what the model actually receives', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function promptForDraft(draft) {
    mockAiGenerate.mockResolvedValue(makeResponse({ score: 8 }))
    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    await useStoryCritic().evaluateScene({
      draft,
      sceneBrief: {
        title: 'T',
        emotionalGoal: 'G',
        charactersPresent: ['A'],
        payoff: 'P',
        tension: 'm'
      },
      storyBible: '## A — someone\n## B — someone else',
      chapterLog: ''
    })
    expect(mockAiGenerate).toHaveBeenCalled()
    return String(mockAiGenerate.mock.calls[0][0])
  }

  it('sends the end of a long scene, not just the first 4000 chars', async () => {
    const ending = 'SHE SET THE LAST STONE DOWN AND TURNED FOR HOME.'
    // Varied on purpose: repetitive filler trips the repetition detector and
    // the critic short-circuits before it ever builds a prompt.
    const body = Array.from(
      { length: 300 },
      (_, i) =>
        `Marker${i} bore${i} the${i} salt${i} sacks${i} westward${i} past dune${i} at hour${i}.`
    ).join(' ')
    const draft = `${body} ${ending}`
    expect(draft.length).toBeGreaterThan(5000)
    const prompt = await promptForDraft(draft)
    expect(prompt).toContain(ending)
  })

  it('includes the scoring anchors so the scale is not invented', async () => {
    const prompt = await promptForDraft('A short scene.')
    expect(prompt).toContain('SCORING SCALE')
    expect(prompt).toMatch(/continuity \(Continuity — threshold 7\)/)
    expect(prompt).toContain('  1 = ')
    expect(prompt).toContain('  10 = ')
  })

  it('says so when a runaway draft really is cut', async () => {
    const prompt = await promptForDraft('x'.repeat(30000))
    expect(prompt).toContain('The draft was cut here for length')
    expect(prompt).toContain('do NOT treat the missing ending')
  })
})

/**
 * A single scene can contradict the ledger, and the checker used to refuse to
 * look.
 *
 * `checkContradictions` only examined an entity appearing in two or more of the
 * scenes it was given. That is right when the scenes are all it has — one scene
 * cannot disagree with itself. It is wrong when a fact ledger is supplied,
 * because then there is canon to contradict from the first scene onward.
 * Measured against a real model (2026-09-23): a lone scene stating that a
 * living character "had been dead for two years", against a ledger saying he
 * leads the caravan, returned zero issues.
 */
describe('checkContradictions — how many scenes an entity needs', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const characters = [{ name: 'Halim', role: 'caravan master' }]
  const oneScene = [{ sceneNumber: 3, title: 'T', characters: ['Halim'], prose: 'Halim was dead.' }]

  it('checks a single scene when a ledger gives it something to contradict', async () => {
    mockAiGenerate.mockResolvedValue(
      JSON.stringify({ contradictions: [{ type: 'timeline', description: 'alive vs dead' }] })
    )
    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const report = await useStoryCritic().checkContradictions({
      characters,
      locations: [],
      sceneProse: oneScene,
      synopsis: '',
      ledger: ['Ch1: Halim is alive and leads the caravan']
    })
    expect(mockAiGenerate).toHaveBeenCalled()
    expect(report.characterIssues).toHaveLength(1)
  })

  it('still skips a single scene when there is no ledger', async () => {
    mockAiGenerate.mockResolvedValue(JSON.stringify({ contradictions: [] }))
    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const report = await useStoryCritic().checkContradictions({
      characters,
      locations: [],
      sceneProse: oneScene,
      synopsis: '',
      ledger: []
    })
    // Nothing to contradict, so no call is worth making.
    expect(mockAiGenerate).not.toHaveBeenCalled()
    expect(report.characterIssues).toHaveLength(0)
  })
})
