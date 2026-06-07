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

let buildEmbeddingContext, formatFullSpineEntry, compressSpine, buildExistingEntitiesBlob, parallelWithLimit
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useVolumeStoryGenerator')
  buildEmbeddingContext = mod.buildEmbeddingContext
  formatFullSpineEntry = mod.formatFullSpineEntry
  compressSpine = mod.compressSpine
  buildExistingEntitiesBlob = mod.buildExistingEntitiesBlob
  parallelWithLimit = mod.parallelWithLimit
})

function makeScene(sceneNumber, title, prose, summary) {
  return { sceneNumber, title, prose: prose || '', summary: summary || '' }
}

function makeSpineEntry(chapterNumber, chapterTitle, emotionalStateAtEnd, readerKnowledgeAtEnd, transitionToNext) {
  return { chapterNumber, chapterTitle, emotionalStateAtEnd, readerKnowledgeAtEnd, transitionToNext }
}

describe('formatFullSpineEntry', () => {
  it('formats a spine entry with all fields', () => {
    const entry = makeSpineEntry(1, 'Chapter 1', 'Hopeful', 'Hero begins journey', 'Time passes')
    const result = formatFullSpineEntry(entry)
    expect(result).toContain('Chapter 1 (Chapter 1)')
    expect(result).toContain('Hopeful')
    expect(result).toContain('Hero begins journey')
    expect(result).toContain('Time passes')
  })
})

describe('compressSpine', () => {
  it('returns full entries when spine has 3 or fewer entries', () => {
    const spine = [
      makeSpineEntry(1, 'Ch1', 'Happy', 'A', 'B'),
      makeSpineEntry(2, 'Ch2', 'Sad', 'C', 'D')
    ]
    const result = compressSpine(spine)
    expect(result).toContain('Chapter 1 (Ch1)')
    expect(result).toContain('Chapter 2 (Ch2)')
  })

  it('compresses older entries when spine has more than 3 entries', () => {
    const spine = [
      makeSpineEntry(1, 'Ch1', 'Happy', 'A', 'B'),
      makeSpineEntry(2, 'Ch2', 'Sad', 'C', 'D'),
      makeSpineEntry(3, 'Ch3', 'Angry', 'E', 'F'),
      makeSpineEntry(4, 'Ch4', 'Calm', 'G', 'H')
    ]
    const result = compressSpine(spine)
    const lines = result.split('\n')
    expect(lines[0]).toBe('Chapter 1 (Ch1): Happy')
    expect(lines[1]).toBe('Chapter 2 (Ch2):')
    expect(result).toContain('Chapter 4 (Ch4)')
    expect(result).toContain('Reader knows: G')
  })

  it('truncates when text exceeds token cap', () => {
    const longEmotion = 'x'.repeat(500)
    const spine = [
      makeSpineEntry(1, 'Ch1', longEmotion, 'A', 'B'),
      makeSpineEntry(2, 'Ch2', 'Sad', 'C', 'D'),
      makeSpineEntry(3, 'Ch3', 'Angry', 'E', 'F'),
      makeSpineEntry(4, 'Ch4', 'Calm', 'G', 'H')
    ]
    const result = compressSpine(spine, 50)
    expect(result).toContain('[spine truncated]')
  })
})

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

describe('buildExistingEntitiesBlob', () => {
  it('serializes characters, locations, and plotThreads', () => {
    const chars = [{ name: 'Alice', role: 'hero', description: 'Brave', traits: ['brave'] }]
    const locs = [{ name: 'Forest', description: 'Dark woods', notes: 'Eerie', traits: ['mysterious'] }]
    const threads = [{ title: 'Main Plot', status: 'active', notes: 'Central conflict', traits: [] }]
    const result = JSON.parse(buildExistingEntitiesBlob(chars, locs, threads))
    expect(result.characters).toHaveLength(1)
    expect(result.characters[0].name).toBe('Alice')
    expect(result.locations).toHaveLength(1)
    expect(result.locations[0].name).toBe('Forest')
    expect(result.plotThreads).toHaveLength(1)
    expect(result.plotThreads[0].title).toBe('Main Plot')
  })

  it('handles empty arrays', () => {
    const result = JSON.parse(buildExistingEntitiesBlob([], [], []))
    expect(result.characters).toEqual([])
    expect(result.locations).toEqual([])
    expect(result.plotThreads).toEqual([])
  })

  it('defaults traits to empty array', () => {
    const chars = [{ name: 'Bob', role: '', description: '', traits: undefined }]
    const result = JSON.parse(buildExistingEntitiesBlob(chars, [], []))
    expect(result.characters[0].traits).toEqual([])
  })
})

describe('parallelWithLimit', () => {
  it('executes all tasks and returns results in order', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3)
    ]
    const results = await parallelWithLimit(tasks, 2)
    expect(results).toEqual([1, 2, 3])
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise(r => setTimeout(r, 10))
      concurrent--
      return i
    })
    const results = await parallelWithLimit(tasks, 2)
    expect(results).toHaveLength(5)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('handles empty task list', async () => {
    const results = await parallelWithLimit([], 3)
    expect(results).toEqual([])
  })

  it('rejects when any task rejects', async () => {
    const tasks = [
      () => Promise.resolve('ok'),
      () => Promise.reject(new Error('fail'))
    ]
    await expect(parallelWithLimit(tasks, 2)).rejects.toThrow('fail')
  })
})
