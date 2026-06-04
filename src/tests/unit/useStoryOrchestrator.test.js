import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./useStoryDirector', () => ({ useStoryDirector: vi.fn() }))
vi.mock('./useStoryWriter', () => ({ useStoryWriter: vi.fn() }))
vi.mock('./useStoryCritic', () => ({ useStoryCritic: vi.fn() }))
vi.mock('./useStoryRevisor', () => ({ useStoryRevisor: vi.fn() }))
vi.mock('./useStoryResearcher', () => ({ useStoryResearcher: vi.fn() }))
vi.mock('../../stores/storyBibleStore', () => ({ useStoryBibleStore: vi.fn() }))
vi.mock('../../stores/manuscriptStore', () => ({ useManuscriptStore: vi.fn() }))
vi.mock('../../services/db-core', () => ({ db: {}, deepPlain: vi.fn() }))

let countWords, classifyGoal
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useStoryOrchestrator')
  countWords = mod.countWords
  classifyGoal = mod.classifyGoal
})

describe('countWords', () => {
  it('returns 0 for empty input', () => {
    expect(countWords('')).toBe(0)
    expect(countWords(null)).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })

  it('counts words', () => {
    expect(countWords('hello world')).toBe(2)
    expect(countWords('one two three four')).toBe(4)
  })

  it('handles extra whitespace', () => {
    expect(countWords('  hello   world  ')).toBe(2)
  })
})

describe('classifyGoal', () => {
  it('classifies write-related premises as short_term_intent', () => {
    const result = classifyGoal('Write a scene about a dragon')
    expect(result.type).toBe('short_term_intent')
    expect(result.horizon).toBe('short_term')
  })

  it('classifies scene-related premises as short_term_intent', () => {
    const result = classifyGoal('Create a scene')
    expect(result.type).toBe('short_term_intent')
  })

  it('classifies brainstorm premises as short_term_intent', () => {
    const result = classifyGoal('Brainstorm ideas')
    expect(result.type).toBe('short_term_intent')
  })

  it('classifies character premises as short_term_intent', () => {
    const result = classifyGoal('Develop the main character')
    expect(result.type).toBe('short_term_intent')
  })

  it('defaults to generate_story for generic premises', () => {
    const result = classifyGoal('Tell me a story about the ocean')
    expect(result.type).toBe('generate_story')
    expect(result.horizon).toBe('long_term')
  })

  it('handles empty premise', () => {
    const result = classifyGoal('')
    expect(result.type).toBe('generate_story')
  })
})
