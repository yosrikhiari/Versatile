import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../stores/projectStore', () => ({ useProjectStore: vi.fn() }))
vi.mock('../../stores/storyBibleStore', () => ({ useStoryBibleStore: vi.fn() }))
vi.mock('../../stores/storyGraphStore', () => ({ useStoryGraphStore: vi.fn() }))
vi.mock('../../stores/manuscriptStore', () => ({ useManuscriptStore: vi.fn() }))
vi.mock('../../utils/textUtils', () => ({ countWords: vi.fn() }))
vi.mock('../../services/db-story-documents', () => ({
  DOC_TYPES: {},
  getAllStoryDocuments: vi.fn(),
  upsertStoryDocument: vi.fn(),
  appendRejectedPattern: vi.fn()
}))

let tokenCount, truncateToBudget, getRelationshipLabel
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useStoryDocuments')
  tokenCount = mod.tokenCount
  truncateToBudget = mod.truncateToBudget
  getRelationshipLabel = mod.getRelationshipLabel
})

describe('tokenCount', () => {
  it('returns 0 for empty string', () => {
    expect(tokenCount('')).toBe(0)
  })

  it('returns ceil of length / 4', () => {
    expect(tokenCount('abcd')).toBe(1)
    expect(tokenCount('abcde')).toBe(2)
    expect(tokenCount('abcdefgh')).toBe(2)
  })

  it('handles null/undefined', () => {
    expect(tokenCount(null)).toBe(0)
    expect(tokenCount(undefined)).toBe(0)
  })
})

describe('truncateToBudget', () => {
  it('returns empty for empty content', () => {
    expect(truncateToBudget('', 100)).toBe('')
  })

  it('keeps header when content fits budget', () => {
    const content = '# Header\n\npart1\n---\npart2'
    const result = truncateToBudget(content, 2000)
    expect(result).toContain('# Header')
    expect(result).toContain('part1')
    expect(result).toContain('part2')
  })

  it('drops sections that exceed budget', () => {
    const long = 'x'.repeat(1000)
    const content = `# Header\n\npart1\n---\n${long}\n---\npart2`
    const result = truncateToBudget(content, 150)
    expect(result).toContain('part1')
    expect(result).not.toContain('part2')
  })

  it('always includes the header', () => {
    const content = '# Only Header'
    const result = truncateToBudget(content, 0)
    expect(result).toBe('# Only Header')
  })
})

describe('getRelationshipLabel', () => {
  it('returns label for known type', () => {
    expect(getRelationshipLabel('ally')).toBe('allied with')
    expect(getRelationshipLabel('rival')).toBe('rivals with')
    expect(getRelationshipLabel('mentor')).toBe('mentors')
  })

  it('returns type itself for unknown type', () => {
    expect(getRelationshipLabel('unknown_type')).toBe('unknown_type')
  })
})
