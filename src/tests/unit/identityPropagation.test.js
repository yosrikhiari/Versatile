import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSkeletonPrompt, buildTitleVarietyBlock } from '@/composables/useStoryDirector'

// Every setting audited here exists in the data model. The question this file
// answers is whether it actually reaches a prompt, rather than being assumed to
// be "in context somewhere" — the failure mode where a value sits in a larger
// evidence blob that is truncation-bounded, so its presence is a coincidence.

const GOAL = {
  premise: 'A betrayed king claws his way back through a court of mind-weavers.',
  genre: 'Dark Fantasy',
  tone: 'Grim, brutal, psychological'
}

describe('identity in director prompts', () => {
  const args = { N: 24, batchStart: 0, batchCount: 12, prevHook: '', needArc: true }

  it('states genre and tone in the chapter-skeleton prompt', () => {
    const prompt = buildSkeletonPrompt({ ...args, goal: GOAL, titleBlock: '' })
    expect(prompt).toContain('GENRE: Dark Fantasy')
    expect(prompt).toContain('TONE: Grim, brutal, psychological')
  })

  it('tells the model the settings outrank the bible and the style guide', () => {
    // Genre, the Style Guide document and retrieved research are separate
    // inputs that nothing previously reconciled, so a bible written in one
    // register could quietly outvote the author's setting.
    const prompt = buildSkeletonPrompt({ ...args, goal: GOAL, titleBlock: '' })
    expect(prompt).toMatch(/take precedence/i)
  })

  it('carries identity into the title block too', () => {
    const block = buildTitleVarietyBlock([], GOAL.genre, GOAL.tone, 12)
    expect(block).toContain('Dark Fantasy')
    expect(block).toContain('Grim, brutal, psychological')
  })

  it('degrades to a stated default rather than an empty label', () => {
    // "GENRE: " with nothing after it is worse than no line: it reads as an
    // explicit instruction to have no genre.
    const prompt = buildSkeletonPrompt({ ...args, goal: { premise: 'p' }, titleBlock: '' })
    expect(prompt).toContain('GENRE: Standard')
    expect(prompt).not.toMatch(/GENRE:\s*\n/)
  })
})

// The precedence regression (author's genre must outrank the model's echo) is
// tested in useStoryDirector.test.js, which already has the aiGenerate mock
// harness needed to drive a full plan.

describe('evidence carries story identity', () => {
  it('leads the bible dump with genre and tone', async () => {
    vi.resetModules()
    vi.doMock('@/services/dbService', () => ({
      getCharacters: async () => [],
      getLocations: async () => [],
      getPlotThreads: async () => [],
      getAuthorProfile: async () => null
    }))
    const { useStoryResearcher } = await import('@/composables/useStoryResearcher')
    const evidence = await useStoryResearcher().gatherEvidence('p1', GOAL)

    // The researcher received `goal` all along and read only `premise` from it,
    // so the evidence that becomes every director system prompt never said what
    // kind of book this was.
    expect(evidence).toContain('Story Identity')
    expect(evidence).toContain('Dark Fantasy')
    expect(evidence).toContain('Grim, brutal, psychological')
    expect(evidence).toMatch(/take precedence/i)
  })

  it('omits the identity section entirely when nothing is set', async () => {
    vi.resetModules()
    vi.doMock('@/services/dbService', () => ({
      getCharacters: async () => [],
      getLocations: async () => [],
      getPlotThreads: async () => [],
      getAuthorProfile: async () => null
    }))
    const { useStoryResearcher } = await import('@/composables/useStoryResearcher')
    const evidence = await useStoryResearcher().gatherEvidence('p1', { premise: 'p' })
    expect(evidence).not.toContain('Story Identity')
    expect(evidence).toContain('Author Style')
  })
})
