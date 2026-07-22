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
vi.mock('./useStoryDocuments', () => ({ useStoryDocuments: vi.fn() }))
vi.mock('./useActivityLog', () => ({ useActivityLog: vi.fn() }))
vi.mock('../services/aiService', () => ({ aiGenerate: vi.fn() }))
vi.mock('../config/ai', () => ({ FEATURES: {}, PROVIDERS: { OLLAMA: 'ollama', OPENAI: 'openai' } }))

let buildEmbeddingContext,
  formatFullSpineEntry,
  compressSpine,
  buildExistingEntitiesBlob,
  buildSceneEntitiesBlob,
  parallelWithLimit
let selectRelevantPriorScenes, planConsistencyFixes, buildFactLedger
let useVolumeStoryGenerator
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useVolumeStoryGenerator')
  const modCtx = await import('@/composables/generation/context/sceneContext')
  buildEmbeddingContext = mod.buildEmbeddingContext
  selectRelevantPriorScenes = mod.selectRelevantPriorScenes
  planConsistencyFixes = modCtx.planConsistencyFixes
  formatFullSpineEntry = mod.formatFullSpineEntry
  compressSpine = mod.compressSpine
  buildExistingEntitiesBlob = mod.buildExistingEntitiesBlob
  buildSceneEntitiesBlob = mod.buildSceneEntitiesBlob
  parallelWithLimit = mod.parallelWithLimit
  buildFactLedger = modCtx.buildFactLedger
  useVolumeStoryGenerator = mod.useVolumeStoryGenerator
})

function makeScene(sceneNumber, title, prose, summary) {
  return { sceneNumber, title, prose: prose || '', summary: summary || '' }
}

function makeSpineEntry(
  chapterNumber,
  chapterTitle,
  emotionalStateAtEnd,
  readerKnowledgeAtEnd,
  transitionToNext
) {
  return {
    chapterNumber,
    chapterTitle,
    emotionalStateAtEnd,
    readerKnowledgeAtEnd,
    transitionToNext
  }
}

describe('selectRelevantPriorScenes', () => {
  const candidates = [
    {
      sceneNumber: 1,
      title: 'Meet Alice',
      characters: ['Alice'],
      location: 'Village',
      summary: 's1'
    },
    { sceneNumber: 2, title: 'Bob alone', characters: ['Bob'], location: 'Forest', summary: 's2' },
    {
      sceneNumber: 3,
      title: 'Alice + Bob',
      characters: ['Alice', 'Bob'],
      location: 'Village',
      summary: 's3'
    }
  ]

  it('picks scenes sharing a character with the current scene', () => {
    const cur = { charactersPresent: ['Alice'], location: 'Castle' }
    const out = selectRelevantPriorScenes(cur, candidates, 3)
    const nums = out.map((s) => s.sceneNumber)
    expect(nums).toContain(1)
    expect(nums).toContain(3)
    expect(nums).not.toContain(2)
  })

  it('ranks higher overlap first (shared char + location beats char only)', () => {
    const cur = { charactersPresent: ['Alice'], location: 'Village' }
    const out = selectRelevantPriorScenes(cur, candidates, 3)
    // Scene 3 shares Alice + Village (score 2) — should rank above scene 1 (score 2 too: Alice + Village)
    expect(out[0].sceneNumber).toBe(3)
  })

  it('respects the limit and returns [] when nothing matches', () => {
    const cur = { charactersPresent: ['Zed'], location: 'Nowhere' }
    expect(selectRelevantPriorScenes(cur, candidates, 3)).toEqual([])
    const limited = selectRelevantPriorScenes(
      { charactersPresent: ['Alice', 'Bob'] },
      candidates,
      1
    )
    expect(limited.length).toBe(1)
  })

  it('handles empty candidates safely', () => {
    expect(selectRelevantPriorScenes({ charactersPresent: ['Alice'] }, [], 3)).toEqual([])
  })
})

describe('planConsistencyFixes', () => {
  const scenes = [
    {
      sceneNumber: 1,
      title: 'A',
      prose: 'Alice had bright green eyes and lived in the Village.',
      characters: ['Alice'],
      location: 'Village'
    },
    {
      sceneNumber: 2,
      title: 'B',
      prose: 'Bob wandered the forest alone.',
      characters: ['Bob'],
      location: 'Forest'
    },
    {
      sceneNumber: 3,
      title: 'C',
      prose: 'Alice had brown eyes now, back in the Village again.',
      characters: ['Alice'],
      location: 'Village'
    }
  ]

  it('targets the later scene matched by excerpt', () => {
    const report = {
      characterIssues: [
        {
          character: 'Alice',
          contradictions: [
            {
              type: 'appearance',
              description: 'eye colour changes',
              between: ['Alice had bright green eyes', 'Alice had brown eyes now']
            }
          ]
        }
      ],
      locationIssues: []
    }
    const fixes = planConsistencyFixes(report, scenes)
    // Excerpt "Alice had brown eyes now" is in scene index 2 (later) → fix there
    expect(fixes.has(2)).toBe(true)
    expect([...fixes.get(2)][0]).toContain('Alice')
  })

  it('falls back to the latest scene the entity appears in when excerpts do not match', () => {
    const report = {
      characterIssues: [
        {
          character: 'Alice',
          contradictions: [
            { type: 'trait', description: 'x', between: ['nonexistent excerpt text zzz'] }
          ]
        }
      ],
      locationIssues: []
    }
    const fixes = planConsistencyFixes(report, scenes)
    expect(fixes.has(2)).toBe(true) // latest Alice scene
  })

  it('returns an empty map for a clean report', () => {
    const fixes = planConsistencyFixes({ characterIssues: [], locationIssues: [] }, scenes)
    expect(fixes.size).toBe(0)
  })

  it('handles missing report / empty scenes safely', () => {
    expect(planConsistencyFixes(null, scenes).size).toBe(0)
    expect(planConsistencyFixes({ characterIssues: [] }, []).size).toBe(0)
  })
})

describe('buildEmbeddingContext relevance recall', () => {
  it('includes an earlier related scene beyond the last two', () => {
    const prior = [
      {
        sceneNumber: 1,
        title: 'Alice in Village',
        prose: 'x'.repeat(50),
        summary: 'Alice does a thing',
        characters: ['Alice'],
        location: 'Village'
      },
      {
        sceneNumber: 2,
        title: 'Filler',
        prose: 'y'.repeat(50),
        summary: 'filler',
        characters: ['Carol'],
        location: 'Sea'
      },
      {
        sceneNumber: 3,
        title: 'More filler',
        prose: 'z'.repeat(50),
        summary: 'more',
        characters: ['Dan'],
        location: 'Sky'
      }
    ]
    const current = { sceneNumber: 4, charactersPresent: ['Alice'], location: 'Village' }
    const ctx = buildEmbeddingContext(current, prior)
    expect(ctx).toContain('Earlier related scenes')
    expect(ctx).toContain('Scene 1')
  })
})

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

describe('buildFactLedger', () => {
  it('flattens spine keyFacts with chapter attribution, in order (no prose)', () => {
    const spine = [
      { chapterNumber: 1, keyFacts: ['A is introduced'] },
      { chapterNumber: 2, keyFacts: ['A is injured', 'B appears'] },
      { chapterNumber: 3, keyFacts: [] }
    ]
    expect(buildFactLedger(spine)).toEqual([
      'Ch1: A is introduced',
      'Ch2: A is injured',
      'Ch2: B appears'
    ])
  })

  it('ignores entries without keyFacts and non-string facts', () => {
    const spine = [{ chapterNumber: 1 }, { chapterNumber: 2, keyFacts: ['real', null, 42, '  '] }]
    expect(buildFactLedger(spine)).toEqual(['Ch2: real'])
  })

  it('returns [] for a non-array spine', () => {
    expect(buildFactLedger(null)).toEqual([])
    expect(buildFactLedger(undefined)).toEqual([])
  })

  it('prefers prose keyFacts over the spine plan for a chapter that produced them', () => {
    const spine = [
      { chapterNumber: 1, keyFacts: ['planned: A meets B'] },
      { chapterNumber: 2, keyFacts: ['planned: they travel'] }
    ]
    const writtenScenes = [
      { chapterId: 1, keyFacts: ['A actually betrays B'] },
      { chapterId: 1, keyFacts: ['B is wounded'] }
      // chapter 2 produced no prose facts → falls back to the plan
    ]
    expect(buildFactLedger(spine, writtenScenes)).toEqual([
      'Ch1: A actually betrays B',
      'Ch1: B is wounded',
      'Ch2: planned: they travel'
    ])
  })

  it('ignores written scenes without a chapterId or keyFacts', () => {
    const spine = [{ chapterNumber: 1, keyFacts: ['planned'] }]
    const writtenScenes = [
      { keyFacts: ['orphan fact, no chapter'] },
      { chapterId: 1 },
      { chapterId: 1, keyFacts: ['  ', null] }
    ]
    // No usable prose facts → falls back to the spine plan.
    expect(buildFactLedger(spine, writtenScenes)).toEqual(['Ch1: planned'])
  })

  it('emits prose facts in chapter order when there is no spine', () => {
    const writtenScenes = [
      { chapterId: 2, keyFacts: ['later'] },
      { chapterId: 1, keyFacts: ['earlier'] }
    ]
    expect(buildFactLedger(null, writtenScenes)).toEqual(['Ch1: earlier', 'Ch2: later'])
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
    const prior = [
      makeScene(1, 'Scene 1', 'text', veryLongSummary),
      makeScene(2, 'Scene 2', 'Latest')
    ]
    const result = buildEmbeddingContext(makeScene(3, 'Scene 3', 'text'), prior)
    expect(result).toBeTruthy()
  })
})

describe('buildExistingEntitiesBlob', () => {
  it('serializes characters, locations, and plotThreads', () => {
    const chars = [{ name: 'Alice', role: 'hero', description: 'Brave', traits: ['brave'] }]
    const locs = [
      { name: 'Forest', description: 'Dark woods', notes: 'Eerie', traits: ['mysterious'] }
    ]
    const threads = [
      { title: 'Main Plot', status: 'active', notes: 'Central conflict', traits: [] }
    ]
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

describe('buildSceneEntitiesBlob', () => {
  const chars = [
    { name: 'Alice', role: 'hero', description: 'Brave', traits: ['brave'] },
    { name: 'Bob', role: 'foil', description: 'Cautious', traits: ['wary'] },
    { name: 'Carol', role: 'villain', description: 'Ruthless', traits: ['cold'] }
  ]
  const locs = [
    { name: 'Forest', description: 'Dark woods', notes: 'Eerie', traits: [] },
    { name: 'Castle', description: 'Cold stone', notes: 'Fortified', traits: [] }
  ]
  const threads = [{ title: 'Main Plot', status: 'active', notes: 'Central', traits: [] }]
  const bible = { characters: chars, locations: locs, plotThreads: threads }

  it('gives full detail to the scene cast and a name index to everyone else', () => {
    const scene = { charactersPresent: ['Alice'], location: 'Forest' }
    const result = JSON.parse(buildSceneEntitiesBlob(scene, bible))

    expect(result.charactersInScene).toHaveLength(1)
    expect(result.charactersInScene[0]).toMatchObject({ name: 'Alice', description: 'Brave' })

    expect(result.otherCharacters).toEqual([
      { name: 'Bob', role: 'foil' },
      { name: 'Carol', role: 'villain' }
    ])
    // The index must not carry descriptions — that is the whole saving.
    expect(result.otherCharacters[0].description).toBeUndefined()
  })

  it('scopes locations to the scene and name-indexes the rest', () => {
    const scene = { charactersPresent: ['Alice'], location: 'Forest' }
    const result = JSON.parse(buildSceneEntitiesBlob(scene, bible))

    expect(result.locationsInScene).toHaveLength(1)
    expect(result.locationsInScene[0].name).toBe('Forest')
    expect(result.otherLocations).toEqual(['Castle'])
  })

  it('keeps plot threads whole — there is no per-scene thread link to scope on', () => {
    const scene = { charactersPresent: ['Alice'], location: 'Forest' }
    const result = JSON.parse(buildSceneEntitiesBlob(scene, bible))
    expect(result.plotThreads).toHaveLength(1)
    expect(result.plotThreads[0].notes).toBe('Central')
  })

  it('matches names case-insensitively and tolerates whitespace', () => {
    const scene = { charactersPresent: ['  alICE '], location: '  forest' }
    const result = JSON.parse(buildSceneEntitiesBlob(scene, bible))
    expect(result.charactersInScene).toHaveLength(1)
    expect(result.charactersInScene[0].name).toBe('Alice')
    expect(result.locationsInScene[0].name).toBe('Forest')
  })

  it('reads the legacy `characters` field as well as `charactersPresent`', () => {
    const scene = { characters: ['Bob'], location: 'Castle' }
    const result = JSON.parse(buildSceneEntitiesBlob(scene, bible))
    expect(result.charactersInScene).toHaveLength(1)
    expect(result.charactersInScene[0].name).toBe('Bob')
  })

  it('returns null when the scene names nobody, so callers fall back', () => {
    // The director's fallback path leaves charactersPresent empty; scoping on
    // that would send zero character detail, which is worse than the full dump.
    expect(buildSceneEntitiesBlob({ charactersPresent: [], location: 'Forest' }, bible)).toBeNull()
    expect(buildSceneEntitiesBlob({}, bible)).toBeNull()
    expect(buildSceneEntitiesBlob(null, bible)).toBeNull()
  })

  it('returns null when named characters match nothing in the bible', () => {
    const scene = { charactersPresent: ['Nobody'], location: 'Forest' }
    expect(buildSceneEntitiesBlob(scene, bible)).toBeNull()
  })

  it('omits the location blocks when the scene has no location', () => {
    const scene = { charactersPresent: ['Alice'] }
    const result = JSON.parse(buildSceneEntitiesBlob(scene, bible))
    expect(result.locationsInScene).toBeUndefined()
    expect(result.otherLocations).toEqual(['Forest', 'Castle'])
  })

  it('is materially smaller than the full dump', () => {
    const scene = { charactersPresent: ['Alice'], location: 'Forest' }
    const scoped = buildSceneEntitiesBlob(scene, bible)
    const full = buildExistingEntitiesBlob(chars, locs, threads)
    expect(scoped.length).toBeLessThan(full.length)
  })
})

describe('parallelWithLimit', () => {
  it('executes all tasks and returns results in order', async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)]
    const results = await parallelWithLimit(tasks, 2)
    expect(results).toEqual([1, 2, 3])
  })

  it('respects concurrency limit', async () => {
    let concurrent = 0
    let maxConcurrent = 0
    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((r) => setTimeout(r, 10))
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
    const tasks = [() => Promise.resolve('ok'), () => Promise.reject(new Error('fail'))]
    await expect(parallelWithLimit(tasks, 2)).rejects.toThrow('fail')
  })
})

describe('detectSceneConflicts', () => {
  let detectSceneConflicts

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/composables/useVolumeStoryGenerator')
    detectSceneConflicts = mod.detectSceneConflicts
  })

  it('returns empty array for fewer than 2 results', () => {
    expect(detectSceneConflicts([])).toEqual([])
    expect(detectSceneConflicts([{ sceneIndex: 1, success: true, keyFacts: ['X is alive'] }])).toEqual([])
  })

  it('returns empty array when facts are all unique', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['Dragon breathes fire'] },
      { sceneIndex: 2, success: true, keyFacts: ['King wears a crown'] }
    ]
    expect(detectSceneConflicts(results)).toEqual([])
  })

  it('detects conflict when two scenes share overlapping facts', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The ancient sword was forged in dragonfire'] },
      { sceneIndex: 2, success: true, keyFacts: ['The ancient sword was hidden in the crypt'] }
    ]
    const conflicts = detectSceneConflicts(results)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].sceneA).toBe(1)
    expect(conflicts[0].sceneB).toBe(2)
  })

  it('ignores identical facts across scenes (no conflict)', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'] },
      { sceneIndex: 2, success: true, keyFacts: ['The sword was forged in dragonfire'] }
    ]
    expect(detectSceneConflicts(results)).toEqual([])
  })

  it('ignores short words (<=3 chars) when computing overlap', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['in the big red box the cat sat'] },
      { sceneIndex: 2, success: true, keyFacts: ['the cat sat in the big red box'] }
    ]
    expect(detectSceneConflicts(results)).toEqual([])
  })

  it('skips failed scenes', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'] },
      { sceneIndex: 2, success: false, keyFacts: ['The sword was hidden in the crypt'] }
    ]
    expect(detectSceneConflicts(results)).toEqual([])
  })

  it('handles empty keyFacts', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: [] },
      { sceneIndex: 2, success: true, keyFacts: ['Dragon breathes fire'] }
    ]
    expect(detectSceneConflicts(results)).toEqual([])
  })

  it('detects multiple conflicts across 3 scenes', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The ring of power was forged in mount doom'] },
      { sceneIndex: 2, success: true, keyFacts: ['The ring of power was found in the river'] },
      { sceneIndex: 3, success: true, keyFacts: ['The crown was stolen from the vault'] }
    ]
    const conflicts = detectSceneConflicts(results)
    expect(conflicts.length).toBeGreaterThanOrEqual(1)
    const involved = conflicts.flatMap((c) => [c.sceneA, c.sceneB])
    expect(involved).toContain(1)
    expect(involved).toContain(2)
  })

  it('requires at least 2 significant words per fact to compare', () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['fire dragon'] },
      { sceneIndex: 2, success: true, keyFacts: ['fire dragon'] }
    ]
    expect(detectSceneConflicts(results)).toEqual([])
  })
})

describe('resolveSceneConflicts', () => {
  let resolveSceneConflicts

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/composables/useVolumeStoryGenerator')
    resolveSceneConflicts = mod.resolveSceneConflicts
  })

  it('removes conflicting fact from lower-scored scene', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'], eval: { score: 8 } },
      { sceneIndex: 2, success: true, keyFacts: ['The sword was hidden in the crypt'], eval: { score: 5 } }
    ]
    const conflicts = [{ sceneA: 1, sceneB: 2, factA: 'The sword was forged in dragonfire', factB: 'The sword was hidden in the crypt' }]
    await resolveSceneConflicts(conflicts, results)
    expect(results[1].keyFacts).toEqual([])
    expect(results[0].keyFacts).toHaveLength(1)
  })

  it('removes fact from lower-scored scene when scene A has lower score', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'], eval: { score: 3 } },
      { sceneIndex: 2, success: true, keyFacts: ['The sword was hidden in the crypt'], eval: { score: 9 } }
    ]
    const conflicts = [{ sceneA: 1, sceneB: 2, factA: 'The sword was forged in dragonfire', factB: 'The sword was hidden in the crypt' }]
    await resolveSceneConflicts(conflicts, results)
    expect(results[0].keyFacts).toEqual([])
    expect(results[1].keyFacts).toHaveLength(1)
  })

  it('skips conflict when either scene failed', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'], eval: { score: 8 } },
      { sceneIndex: 2, success: false, keyFacts: ['The sword was hidden in the crypt'], eval: { score: 5 } }
    ]
    const conflicts = [{ sceneA: 1, sceneB: 2, factA: 'The sword was forged in dragonfire', factB: 'The sword was hidden in the crypt' }]
    await resolveSceneConflicts(conflicts, results)
    expect(results[1].keyFacts).toHaveLength(1)
  })

  it('handles empty conflicts array', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['A fact'], eval: { score: 8 } }
    ]
    await resolveSceneConflicts([], results)
    expect(results[0].keyFacts).toHaveLength(1)
  })

  it('falls back to score 0 when eval is missing', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'] },
      { sceneIndex: 2, success: true, keyFacts: ['The sword was hidden in the crypt'] }
    ]
    const conflicts = [{ sceneA: 1, sceneB: 2, factA: 'The sword was forged in dragonfire', factB: 'The sword was hidden in the crypt' }]
    await resolveSceneConflicts(conflicts, results)
    expect(results[1].keyFacts).toEqual([])
  })

  it('preserves non-conflicting facts', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire', 'Dragon is ancient'], eval: { score: 8 } },
      { sceneIndex: 2, success: true, keyFacts: ['The sword was hidden in the crypt'], eval: { score: 5 } }
    ]
    const conflicts = [{ sceneA: 1, sceneB: 2, factA: 'The sword was forged in dragonfire', factB: 'The sword was hidden in the crypt' }]
    await resolveSceneConflicts(conflicts, results)
    expect(results[0].keyFacts).toEqual(['The sword was forged in dragonfire', 'Dragon is ancient'])
    expect(results[1].keyFacts).toEqual([])
  })
})

describe('parallel generation end-to-end: 3 scenes concurrent, verify no conflicts', () => {
  let detectSceneConflicts, resolveSceneConflicts, parallelWithLimit

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('@/composables/useVolumeStoryGenerator')
    detectSceneConflicts = mod.detectSceneConflicts
    resolveSceneConflicts = mod.resolveSceneConflicts
    parallelWithLimit = mod.parallelWithLimit
  })

  it('processes a wave of 3 scenes without cross-talk', async () => {
    const sceneResults = [
      { sceneIndex: 0, success: true, keyFacts: ['Hero discovers the ancient map'], eval: { score: 8 } },
      { sceneIndex: 1, success: true, keyFacts: ['Village prepares for the winter feast'], eval: { score: 7 } },
      { sceneIndex: 2, success: true, keyFacts: ['Guard patrols the northern wall'], eval: { score: 9 } }
    ]

    const conflicts = detectSceneConflicts(sceneResults)
    expect(conflicts).toHaveLength(0)

    await resolveSceneConflicts(conflicts, sceneResults)
    for (const r of sceneResults) {
      expect(r.success).toBe(true)
    }
  })

  it('detects and resolves conflicts in a 3-scene wave end-to-end', async () => {
    const sceneResults = [
      { sceneIndex: 0, success: true, keyFacts: ['The Necromancer raises an undead army'], eval: { score: 9 } },
      { sceneIndex: 1, success: true, keyFacts: ['The Necromancer summons the undead legion'], eval: { score: 4 } },
      { sceneIndex: 2, success: true, keyFacts: ['Hero rallies the kingdom for battle'], eval: { score: 8 } }
    ]

    const originalFacts = sceneResults.map((r) => [...r.keyFacts])
    const conflicts = detectSceneConflicts(sceneResults)
    expect(conflicts.length).toBeGreaterThanOrEqual(1)

    await resolveSceneConflicts(conflicts, sceneResults)

    const conflictSceneIndices = new Set(conflicts.flatMap((c) => [c.sceneA, c.sceneB]))
    for (const idx of conflictSceneIndices) {
      const result = sceneResults.find((r) => r.sceneIndex === idx)
      const original = originalFacts[idx]
      expect(result.keyFacts.length).toBeLessThanOrEqual(original.length)
    }
  })

  it('parallelWithLimit can run generate-middle-scene-like tasks concurrently', async () => {
    const log = []

    async function simulateGenerate(index, keyFact, score) {
      await new Promise((r) => setTimeout(r, Math.random() * 5))
      log.push(`scene-${index}-done`)
      return { sceneIndex: index, success: true, keyFacts: [keyFact], eval: { score } }
    }

    const tasks = [
      () => simulateGenerate(0, 'Hero enters the dark forest', 7),
      () => simulateGenerate(1, 'Witch brews a powerful potion', 6),
      () => simulateGenerate(2, 'The amulet glows with ancient power', 8)
    ]

    const results = await parallelWithLimit(tasks, 2)
    expect(results).toHaveLength(3)
    for (const r of results) {
      expect(r.success).toBe(true)
      expect(r.keyFacts).toHaveLength(1)
    }

    const conflicts = detectSceneConflicts(results)
    expect(conflicts).toHaveLength(0)
  })

  it('quality floor: passes when fail ratio is below threshold', async () => {
    const gateEvals = [
      { score: 8, evalUnavailable: false },
      { score: 3, evalUnavailable: false },
      { score: 7, evalUnavailable: false },
      { score: 6, evalUnavailable: false }
    ]
    const judged = gateEvals.filter((e) => !e.evalUnavailable && e.score != null)
    const failed = judged.filter((e) => e.score < 5)
    const QUALITY_FLOOR_FAIL_RATIO = 0.5
    const QUALITY_FLOOR_MIN_JUDGED = 4

    expect(judged.length).toBeGreaterThanOrEqual(QUALITY_FLOOR_MIN_JUDGED)
    const breach = failed.length / judged.length >= QUALITY_FLOOR_FAIL_RATIO
    expect(breach).toBe(false)
  })

  it('quality floor: breaches when fail ratio exceeds threshold', async () => {
    const gateEvals = [
      { score: 2, evalUnavailable: false },
      { score: 3, evalUnavailable: false },
      { score: 1, evalUnavailable: false },
      { score: 8, evalUnavailable: false },
      { score: 4, evalUnavailable: false }
    ]
    const judged = gateEvals.filter((e) => !e.evalUnavailable && e.score != null)
    const failed = judged.filter((e) => e.score < 5)
    const QUALITY_FLOOR_FAIL_RATIO = 0.5
    const QUALITY_FLOOR_MIN_JUDGED = 4

    expect(judged.length).toBeGreaterThanOrEqual(QUALITY_FLOOR_MIN_JUDGED)
    const breach = failed.length / judged.length >= QUALITY_FLOOR_FAIL_RATIO
    expect(breach).toBe(true)
  })
})

describe('useVolumeStoryGenerator', () => {
  it('returns reactive state and methods', () => {
    const gen = useVolumeStoryGenerator()
    expect(gen.phase.value).toBe('idle')
    expect(gen.progress.current).toBe(0)
    expect(gen.progress.total).toBe(0)
    expect(gen.error.value).toBeNull()
    expect(gen.volumeId.value).toBeNull()
    expect(gen.scenePlan.value).toEqual([])
    expect(gen.writtenScenes.value).toEqual([])
    expect(gen.consistencyReport.value).toBeNull()
    expect(gen.rejectedPatterns.value).toEqual([])
    expect(gen.hasPendingBatches.value).toBe(false)
    expect(gen.sceneReviewMode.value).toBe(false)
  })

  it('has all expected methods', () => {
    const gen = useVolumeStoryGenerator()
    expect(typeof gen.startGeneration).toBe('function')
    expect(typeof gen.confirmPlan).toBe('function')
    expect(typeof gen.confirmSync).toBe('function')
    expect(typeof gen.reset).toBe('function')
    expect(typeof gen.logRejectedPattern).toBe('function')
    expect(typeof gen.approveScene).toBe('function')
    expect(typeof gen.rejectScene).toBe('function')
    expect(typeof gen.rerequestScene).toBe('function')
    expect(typeof gen.regenerateScene).toBe('function')
  })

  it('reset restores initial state', async () => {
    const gen = useVolumeStoryGenerator()
    gen.phase.value = 'writing'
    gen.error.value = 'Something went wrong'
    gen.volumeId.value = 'vol-1'
    gen.scenePlan.value = [{ id: 1 }]
    gen.progress.current = 5
    gen.progress.total = 10
    await gen.reset()
    expect(gen.phase.value).toBe('idle')
    expect(gen.error.value).toBeNull()
    expect(gen.volumeId.value).toBeNull()
    expect(gen.scenePlan.value).toEqual([])
    expect(gen.progress.current).toBe(0)
    expect(gen.progress.total).toBe(0)
  })

  it('logRejectedPattern adds to rejectedPatterns and caps at 5', () => {
    const gen = useVolumeStoryGenerator()
    for (let i = 1; i <= 6; i++) {
      gen.logRejectedPattern(`context-${i}`, `prose-${i}`)
    }
    expect(gen.rejectedPatterns.value).toHaveLength(5)
    expect(gen.rejectedPatterns.value[0].context).toBe('context-2')
    expect(gen.rejectedPatterns.value[4].context).toBe('context-6')
  })
})
