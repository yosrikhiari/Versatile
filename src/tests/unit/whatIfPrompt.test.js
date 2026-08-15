import { describe, it, expect, vi, beforeEach } from 'vitest'

// What actually reaches the model. Every field asserted here was, at some point,
// accepted as a parameter and then silently dropped before the prompt was built.
const captured = []
vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: vi.fn(async (userPrompt, systemPrompt) => {
    captured.push({ userPrompt, systemPrompt })
    return { alternatives: [{ title: 't', prose: 'p' }] }
  })
}))

import { useWhatIf } from '@/composables/useWhatIf'

const base = {
  sceneProse: 'Kael stood at the drowned gate and did not go down.',
  sceneBrief: { goal: 'Kael hesitates', conflict: 'the tide is rising' },
  chapterLog: ['Ch1: They reach the gate', 'Ch2: Kael learns of the betrayal']
}

const run = async (over = {}) => {
  captured.length = 0
  const { generateAlternatives } = useWhatIf()
  await generateAlternatives({ ...base, ...over })
  return captured[0].userPrompt
}

describe('what-if prompt', () => {
  beforeEach(() => captured.splice(0))

  it("carries the author's premise, which is the entire point of the feature", async () => {
    const prompt = await run({ premise: 'Kael goes down alone, without telling Mira.' })
    expect(prompt).toContain('Kael goes down alone, without telling Mira.')
    expect(prompt).toContain('THE AUTHOR\'S "WHAT IF"')
  })

  it('tells the model to vary the consequence, not whether the premise happens', async () => {
    const prompt = await run({ premise: 'Kael goes down alone.' })
    expect(prompt).toContain('Vary how it plays out, not whether it happens.')
    expect(prompt).toContain('DIFFERENT consequence')
  })

  it('falls back to open-ended divergence when no premise is given', async () => {
    const prompt = await run({})
    expect(prompt).not.toContain('THE AUTHOR\'S "WHAT IF"')
    expect(prompt).toContain('different creative direction')
  })

  it('carries the measured author voice', async () => {
    const prompt = await run({ voiceProfile: '- Sentence length: 10 words on average' })
    expect(prompt).toContain('AUTHOR VOICE')
    expect(prompt).toContain('10 words on average')
  })

  it('carries craft rules, as a list or a string', async () => {
    const fromArray = await run({ activeCraftRules: ['No head-hopping.', 'Dramatise emotion.'] })
    expect(fromArray).toContain('CRAFT RULES')
    expect(fromArray).toContain('No head-hopping.')
    expect(fromArray).toContain('Dramatise emotion.')

    const fromString = await run({ activeCraftRules: 'No head-hopping.' })
    expect(fromString).toContain('No head-hopping.')
  })

  it('accepts a voice profile object as well as a rendered string', async () => {
    const prompt = await run({ voiceProfile: { voiceInstruction: 'Terse and cold.' } })
    expect(prompt).toContain('Terse and cold.')
  })

  it('omits the optional blocks entirely rather than emitting empty headings', async () => {
    const prompt = await run({})
    expect(prompt).not.toContain('AUTHOR VOICE')
    expect(prompt).not.toContain('CRAFT RULES')
  })

  it('still carries the scene and the chapter log', async () => {
    const prompt = await run({ premise: 'x' })
    expect(prompt).toContain('Kael stood at the drowned gate')
    expect(prompt).toContain('Ch2: Kael learns of the betrayal')
    expect(prompt).toContain('goal: Kael hesitates')
  })
})
