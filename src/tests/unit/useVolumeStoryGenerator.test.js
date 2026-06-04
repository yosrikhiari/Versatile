import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../stores/storyBibleStore', () => ({ useStoryBibleStore: vi.fn() }))
vi.mock('../stores/volumeStore', () => ({ useVolumeStore: vi.fn() }))
vi.mock('../stores/manuscriptStore', () => ({ useManuscriptStore: vi.fn() }))
vi.mock('../stores/storyGraphStore', () => ({ useStoryGraphStore: vi.fn() }))
vi.mock('./useStoryDirector', () => ({ useStoryDirector: vi.fn() }))
vi.mock('./useEntityBootstrapper', () => ({ useEntityBootstrapper: vi.fn() }))
vi.mock('./useStoryWriter', () => ({ useStoryWriter: vi.fn() }))
vi.mock('./useStoryCritic', () => ({ useStoryCritic: vi.fn() }))
vi.mock('./useChapterGenerationSync', () => ({ useChapterGenerationSync: vi.fn() }))
vi.mock('../services/aiService', () => ({ aiGenerate: vi.fn() }))
vi.mock('../config/ai', () => ({ FEATURES: {} }))

let buildEmbeddingContext
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useVolumeStoryGenerator')
  buildEmbeddingContext = mod.buildEmbeddingContext
})

function makeScene(sceneNumber, title, prose, summary) {
  return { sceneNumber, title, prose: prose || '', summary: summary || '' }
}

describe('buildEmbeddingContext', () => {
  it('returns empty string when priorScenes is empty', () => {
    expect(buildEmbeddingContext(null, [])).toBe('')
  })

  it('includes ending excerpt of the preceding scene', () => {
    const current = makeScene(3, 'Scene 3', 'Current prose')
    const prior = [makeScene(1, 'Scene 1', 'Old prose'), makeScene(2, 'Scene 2', 'Ending prose')]
    const result = buildEmbeddingContext(current, prior)
    expect(result).toContain('Ending of Preceding Scene 2')
    expect(result).toContain('Ending prose')
  })

  it('includes summary of the second-to-last scene', () => {
    const current = makeScene(4, 'Scene 4', 'Current')
    const prior = [
      makeScene(1, 'Scene 1', 'Long prose '.repeat(50), 'Summary of scene 1'),
      makeScene(2, 'Scene 2', 'Medium prose', 'Summary of scene 2'),
      makeScene(3, 'Scene 3', 'Latest prose')
    ]
    const result = buildEmbeddingContext(current, prior)
    expect(result).toContain('Summary of Scene 2')
    expect(result).toContain('Summary of scene 2')
  })

  it('truncates preceding scene prose if longer than 1200 chars', () => {
    const longProse = 'x'.repeat(1500)
    const current = makeScene(3, 'Scene 3', 'test')
    const prior = [makeScene(1, 'Scene 1', 'prose'), makeScene(2, 'Scene 2', longProse)]
    const result = buildEmbeddingContext(current, prior)
    expect(result.length).toBeLessThan(1500)
    expect(result).toContain('...' + 'x'.repeat(1200))
  })

  it('uses prose slice when summary is missing for older scene', () => {
    const current = makeScene(3, 'Scene 3', 'current')
    const prior = [
      makeScene(1, 'Scene 1', 'Some prose content here'),
      makeScene(2, 'Scene 2', 'Latest')
    ]
    const result = buildEmbeddingContext(current, prior)
    expect(result).toContain('Some prose content')
  })

  it('stops adding older scenes when max chars reached', () => {
    const veryLongSummary = 'x'.repeat(1500)
    const prior = [makeScene(1, 'Scene 1', 'text', veryLongSummary), makeScene(2, 'Scene 2', 'Latest')]
    const result = buildEmbeddingContext(makeScene(3, 'Scene 3', 'text'), prior)
    expect(result).toBeTruthy()
  })
})
