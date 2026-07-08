import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'

const mockAiGenerate = vi.fn()
const mockAiStream = vi.fn()

vi.mock('../services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args)
}))

vi.mock('../stores/useProjectStore', () => ({
  useProjectStore: () => ({
    activeWorkspaceType: 'creative'
  })
}))

describe('writeSceneStructured pastEvalResults integration', () => {
  let writeSceneStructured

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const mockResolved = JSON.stringify({
      prose: 'Once upon a time...',
      title: 'Test Scene',
      summary: 'A test scene.',
      characters: [],
      location: '',
      plotAdvancement: '',
      emotionalBeat: '',
      sensoryDetails: ''
    })
    mockAiGenerate.mockResolvedValue(mockResolved)
    mockAiStream.mockImplementation(async (_prompt, _sys, onChunk) => {
      onChunk(mockResolved)
    })

    const mod = await import('../composables/useStoryWriter')
    writeSceneStructured = mod.useStoryWriter().writeSceneStructured
  })

  function getSystemPrompt() {
    return mockAiStream.mock.calls[0][1]
  }

  it('includes PAST EVALUATION FEEDBACK section when pastEvalResults is provided', async () => {
    const evalFeedback = `## PAST EVALUATION FEEDBACK\nScene 1: FAIL (4.5)\n  - weak pacing\n`

    await writeSceneStructured({
      sceneBrief: { sceneNumber: 1, title: 'Test', goal: 'test', obstacle: 'test', characters: [], location: 'here', change: 'nothing', toneNote: '' },
      storyArc: { title: 'Arc' },
      chapterLog: '',
      storyBible: '',
      pastEvalResults: evalFeedback,
      onChunk: () => {}
    })

    const systemPrompt = getSystemPrompt()
    expect(systemPrompt).toContain('## PAST EVALUATION FEEDBACK')
    expect(systemPrompt).toContain('Scene 1: FAIL (4.5)')
    expect(systemPrompt).toContain('weak pacing')
  })

  it('omits PAST EVALUATION FEEDBACK section when pastEvalResults is empty', async () => {
    await writeSceneStructured({
      sceneBrief: { sceneNumber: 1, title: 'Test', goal: 'test', obstacle: 'test', characters: [], location: 'here', change: 'nothing', toneNote: '' },
      storyArc: { title: 'Arc' },
      chapterLog: '',
      storyBible: '',
      pastEvalResults: '',
      onChunk: () => {}
    })

    const systemPrompt = getSystemPrompt()
    expect(systemPrompt).not.toContain('PAST EVALUATION FEEDBACK')
  })

  it('omits PAST EVALUATION FEEDBACK section when pastEvalResults is undefined', async () => {
    await writeSceneStructured({
      sceneBrief: { sceneNumber: 1, title: 'Test', goal: 'test', obstacle: 'test', characters: [], location: 'here', change: 'nothing', toneNote: '' },
      storyArc: { title: 'Arc' },
      chapterLog: '',
      storyBible: '',
      onChunk: () => {}
    })

    const systemPrompt = getSystemPrompt()
    expect(systemPrompt).not.toContain('PAST EVALUATION FEEDBACK')
  })

  it('includes feedback from formatEvalFeedback output correctly', async () => {
    const { formatEvalFeedback } = await import('../services/evalFeedback')
    const feedback = formatEvalFeedback([
      { sceneIndex: 1, passed: false, score: 4.5, topIssues: ['weak pacing', 'dialogue feels flat'] }
    ])

    await writeSceneStructured({
      sceneBrief: { sceneNumber: 2, title: 'Test', goal: 'test', obstacle: 'test', characters: [], location: 'here', change: 'nothing', toneNote: '' },
      storyArc: { title: 'Arc' },
      chapterLog: '',
      storyBible: '',
      pastEvalResults: feedback,
      onChunk: () => {}
    })

    const systemPrompt = getSystemPrompt()
    expect(systemPrompt).toContain('## PAST EVALUATION FEEDBACK')
    expect(systemPrompt).toContain('Scene 1: FAIL (4.5)')
  })

  it('includes both pastEvalResults and antiPatterns sections when both are provided', async () => {
    const feedback = '## PAST EVALUATION FEEDBACK\nScene 1: FAIL (4.5)\n  - weak pacing'

    await writeSceneStructured({
      sceneBrief: { sceneNumber: 2, title: 'Test', goal: 'test', obstacle: 'test', characters: [], location: 'here', change: 'nothing', toneNote: '' },
      storyArc: { title: 'Arc' },
      chapterLog: '',
      storyBible: '',
      pastEvalResults: feedback,
      rejectedPatterns: [{ context: 'info dumps' }, { context: 'passive voice' }],
      onChunk: () => {}
    })

    const systemPrompt = getSystemPrompt()
    expect(systemPrompt).toContain('## PAST EVALUATION FEEDBACK')
    expect(systemPrompt).toContain('AVOID producing output')
    expect(systemPrompt).toContain('info dumps')
  })

  it('includes pastEvalResults when antiPatterns is empty', async () => {
    const feedback = '## PAST EVALUATION FEEDBACK\nScene 1: FAIL (4.5)'

    await writeSceneStructured({
      sceneBrief: { sceneNumber: 2, title: 'Test', goal: 'test', obstacle: 'test', characters: [], location: 'here', change: 'nothing', toneNote: '' },
      storyArc: { title: 'Arc' },
      chapterLog: '',
      storyBible: '',
      pastEvalResults: feedback,
      rejectedPatterns: [],
      onChunk: () => {}
    })

    const systemPrompt = getSystemPrompt()
    expect(systemPrompt).toContain('## PAST EVALUATION FEEDBACK')
    expect(systemPrompt).toContain('Scene 1: FAIL (4.5)')
  })
})
