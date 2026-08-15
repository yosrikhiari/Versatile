import { describe, it, expect } from 'vitest'
import { buildDivergedScenePrompt } from '@/composables/useWhatIfGenerator'

// A branch is supposed to differ from the original in exactly one way: the
// divergence. This prompt used to be a single line — "Write a scene for: <title>"
// — with no canon, no voice and no mention of the divergence, so a forked branch
// read like a different book by a different author.

const args = (over = {}) => ({
  sub: { title: 'The Undercroft', summary: 'Kael descends alone.' },
  premise: 'Kael goes down without telling Mira.',
  storyBibleDocs: '# Characters\nKael — grey eyes, cautious.',
  voiceGuide: '- Sentence length: 10 words on average',
  precedingSummaries: ['- The Drowned Gate: They arrive at dusk.'],
  ...over
})

describe('buildDivergedScenePrompt', () => {
  it('states the divergence as binding on every scene', () => {
    const p = buildDivergedScenePrompt(args())
    expect(p).toContain('THE DIVERGENCE')
    expect(p).toContain('Kael goes down without telling Mira.')
    expect(p).toContain('hedge back toward the original story')
  })

  it('keeps the rest of the canon in force alongside the divergence', () => {
    const p = buildDivergedScenePrompt(args())
    expect(p).toContain('STORY CANON')
    expect(p).toContain('Kael — grey eyes, cautious.')
    expect(p).toContain('still holds except where this divergence changes it')
  })

  it('carries the measured author voice', () => {
    const p = buildDivergedScenePrompt(args())
    expect(p).toContain('AUTHOR VOICE')
    expect(p).toContain('10 words on average')
  })

  it('gives the scene what precedes it, so a branch reads continuously', () => {
    const p = buildDivergedScenePrompt(args())
    expect(p).toContain('WHAT HAPPENS IMMEDIATELY BEFORE')
    expect(p).toContain('They arrive at dusk.')
  })

  it('omits blocks it has no data for instead of emitting empty headings', () => {
    const p = buildDivergedScenePrompt(
      args({ storyBibleDocs: '', voiceGuide: '', premise: '', precedingSummaries: [] })
    )
    expect(p).not.toContain('STORY CANON')
    expect(p).not.toContain('AUTHOR VOICE')
    expect(p).not.toContain('THE DIVERGENCE')
    expect(p).not.toContain('WHAT HAPPENS IMMEDIATELY BEFORE')
    expect(p).toContain('The Undercroft')
  })

  it('always names the scene it is writing', () => {
    expect(buildDivergedScenePrompt(args({ sub: {} }))).toContain('Untitled')
  })
})
