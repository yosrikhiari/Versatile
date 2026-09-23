import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// Top-level mock data for aggregateChapterContent tests
const aggMockSections = ref([
  { id: 'sec-1', title: 'Chapter 1', wordCount: 0, status: 'planning', content: '' },
  { id: 'sec-2', title: 'Chapter 2', wordCount: 0, status: 'planning', content: '' },
  {
    id: 'sec-3',
    title: 'Chapter 3 (hand-written)',
    wordCount: 500,
    status: 'generated',
    content: '<p>Hand written content</p>'
  }
])
const aggMockSubsections = ref([
  {
    id: 'sub-1',
    sectionId: 'sec-1',
    title: 'Scene 1',
    content: '<p>Scene 1 prose</p>',
    wordCount: 100,
    order: 0,
    contentStatus: 'generated'
  },
  {
    id: 'sub-2',
    sectionId: 'sec-1',
    title: 'Scene 2',
    content: '<p>Scene 2 prose</p>',
    wordCount: 150,
    order: 1,
    contentStatus: 'generated'
  },
  {
    id: 'sub-3',
    sectionId: 'sec-1',
    title: 'Scene 3 (empty)',
    content: '',
    wordCount: 0,
    order: 2,
    contentStatus: 'pending'
  },
  {
    id: 'sub-4',
    sectionId: 'sec-2',
    title: 'Scene 1',
    content: '<p>Only scene in Ch2</p>',
    wordCount: 200,
    order: 0,
    contentStatus: 'generated'
  }
])

vi.mock('@/stores/manuscriptStore', () => ({
  useManuscriptStore: () => ({
    get sections() {
      return aggMockSections.value
    },
    get subsections() {
      return aggMockSubsections.value
    },
    get subsectionsBySection() {
      const grouped = {}
      for (const sub of aggMockSubsections.value) {
        if (!grouped[sub.sectionId]) grouped[sub.sectionId] = []
        grouped[sub.sectionId].push(sub)
      }
      for (const key in grouped) {
        grouped[key].sort((a, b) => (a.order || 0) - (b.order || 0))
      }
      // Add .get() method for compatibility with aggregateChapterContent
      return {
        ...grouped,
        get: (key) => grouped[key]
      }
    },
    updateSectionData: vi.fn((id, data) => {
      const idx = aggMockSections.value.findIndex((s) => s.id === id)
      if (idx !== -1) {
        aggMockSections.value[idx] = { ...aggMockSections.value[idx], ...data }
      }
    }),
    triggerStyleGuideRegen: vi.fn(),
    get sortedSections() {
      return [...aggMockSections.value].sort((a, b) => (a.order || 0) - (b.order || 0))
    },
    get activeSection() {
      return aggMockSections.value.find((c) => c.id === aggMockActiveSectionId?.value)
    },
    get activeSubsection() {
      return aggMockSubsections.value.find((s) => s.id === aggMockActiveSubsectionId?.value)
    },
    storyElements: ref([]),
    relationships: ref([]),
    activeSectionId: ref(null),
    activeSubsectionId: ref(null),
    isLoading: ref(false),
    loadError: ref(null),
    loadManuscript: vi.fn(),
    addSectionData: vi.fn(),
    deleteSectionData: vi.fn(),
    reorderSectionsData: vi.fn(),
    addSubsectionData: vi.fn(),
    updateSubsectionData: vi.fn(),
    deleteSubsectionData: vi.fn(),
    reorderSubsectionsData: vi.fn(),
    addStoryElementData: vi.fn(),
    addStoryElementsBatchData: vi.fn(),
    updateStoryElementData: vi.fn(),
    deleteStoryElementData: vi.fn(),
    addRelationshipData: vi.fn(),
    updateRelationshipData: vi.fn(),
    deleteRelationshipData: vi.fn(),
    setActiveSection: vi.fn(),
    setActiveSubsection: vi.fn(),
    setManuscriptContent: vi.fn(),
    getFullText: vi.fn(),
    clearManuscript: vi.fn()
  })
}))

vi.mock('../stores/storyBibleStore', () => ({ useStoryBibleStore: vi.fn() }))
vi.mock('../stores/volumeStore', () => ({ useVolumeStore: vi.fn() }))
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

const aggMockActiveSectionId = ref(null)
const aggMockActiveSubsectionId = ref(null)

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
    expect(
      detectSceneConflicts([{ sceneIndex: 1, success: true, keyFacts: ['X is alive'] }])
    ).toEqual([])
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
      {
        sceneIndex: 1,
        success: true,
        keyFacts: ['The sword was forged in dragonfire'],
        eval: { score: 8 }
      },
      {
        sceneIndex: 2,
        success: true,
        keyFacts: ['The sword was hidden in the crypt'],
        eval: { score: 5 }
      }
    ]
    const conflicts = [
      {
        sceneA: 1,
        sceneB: 2,
        factA: 'The sword was forged in dragonfire',
        factB: 'The sword was hidden in the crypt'
      }
    ]
    await resolveSceneConflicts(conflicts, results)
    expect(results[1].keyFacts).toEqual([])
    expect(results[0].keyFacts).toHaveLength(1)
  })

  it('removes fact from lower-scored scene when scene A has lower score', async () => {
    const results = [
      {
        sceneIndex: 1,
        success: true,
        keyFacts: ['The sword was forged in dragonfire'],
        eval: { score: 3 }
      },
      {
        sceneIndex: 2,
        success: true,
        keyFacts: ['The sword was hidden in the crypt'],
        eval: { score: 9 }
      }
    ]
    const conflicts = [
      {
        sceneA: 1,
        sceneB: 2,
        factA: 'The sword was forged in dragonfire',
        factB: 'The sword was hidden in the crypt'
      }
    ]
    await resolveSceneConflicts(conflicts, results)
    expect(results[0].keyFacts).toEqual([])
    expect(results[1].keyFacts).toHaveLength(1)
  })

  it('skips conflict when either scene failed', async () => {
    const results = [
      {
        sceneIndex: 1,
        success: true,
        keyFacts: ['The sword was forged in dragonfire'],
        eval: { score: 8 }
      },
      {
        sceneIndex: 2,
        success: false,
        keyFacts: ['The sword was hidden in the crypt'],
        eval: { score: 5 }
      }
    ]
    const conflicts = [
      {
        sceneA: 1,
        sceneB: 2,
        factA: 'The sword was forged in dragonfire',
        factB: 'The sword was hidden in the crypt'
      }
    ]
    await resolveSceneConflicts(conflicts, results)
    expect(results[1].keyFacts).toHaveLength(1)
  })

  it('handles empty conflicts array', async () => {
    const results = [{ sceneIndex: 1, success: true, keyFacts: ['A fact'], eval: { score: 8 } }]
    await resolveSceneConflicts([], results)
    expect(results[0].keyFacts).toHaveLength(1)
  })

  it('falls back to score 0 when eval is missing', async () => {
    const results = [
      { sceneIndex: 1, success: true, keyFacts: ['The sword was forged in dragonfire'] },
      { sceneIndex: 2, success: true, keyFacts: ['The sword was hidden in the crypt'] }
    ]
    const conflicts = [
      {
        sceneA: 1,
        sceneB: 2,
        factA: 'The sword was forged in dragonfire',
        factB: 'The sword was hidden in the crypt'
      }
    ]
    await resolveSceneConflicts(conflicts, results)
    expect(results[1].keyFacts).toEqual([])
  })

  it('preserves non-conflicting facts', async () => {
    const results = [
      {
        sceneIndex: 1,
        success: true,
        keyFacts: ['The sword was forged in dragonfire', 'Dragon is ancient'],
        eval: { score: 8 }
      },
      {
        sceneIndex: 2,
        success: true,
        keyFacts: ['The sword was hidden in the crypt'],
        eval: { score: 5 }
      }
    ]
    const conflicts = [
      {
        sceneA: 1,
        sceneB: 2,
        factA: 'The sword was forged in dragonfire',
        factB: 'The sword was hidden in the crypt'
      }
    ]
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
      {
        sceneIndex: 0,
        success: true,
        keyFacts: ['Hero discovers the ancient map'],
        eval: { score: 8 }
      },
      {
        sceneIndex: 1,
        success: true,
        keyFacts: ['Village prepares for the winter feast'],
        eval: { score: 7 }
      },
      {
        sceneIndex: 2,
        success: true,
        keyFacts: ['Guard patrols the northern wall'],
        eval: { score: 9 }
      }
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
      {
        sceneIndex: 0,
        success: true,
        keyFacts: ['The Necromancer raises an undead army'],
        eval: { score: 9 }
      },
      {
        sceneIndex: 1,
        success: true,
        keyFacts: ['The Necromancer summons the undead legion'],
        eval: { score: 4 }
      },
      {
        sceneIndex: 2,
        success: true,
        keyFacts: ['Hero rallies the kingdom for battle'],
        eval: { score: 8 }
      }
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
    // `phase` is not set here: it is the delegator's ref and is now readonly
    // outside the machine, so only a dispatch can move it. Reset's own
    // RESET dispatch is what the assertion below checks.
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

describe('dropEmptyRunVolume', () => {
  it('deletes the run volume when no chapter owns it, and keeps it once one does', async () => {
    const { useVolumeStore } = await import('@/stores/volumeStore')
    const spy = vi.spyOn(useVolumeStore(), 'deleteVolumeData').mockResolvedValue(undefined)
    const gen = useVolumeStoryGenerator()
    const fixture = aggMockSections.value
    // A plan that failed before any chapter was created: the phase-0 volume
    // used to stay behind, empty, after every failed run.
    gen.volumeId.value = 'v9'
    aggMockSections.value = []
    await gen.dropEmptyRunVolume('p1')
    expect(spy).toHaveBeenCalledWith('v9', 'p1')
    expect(gen.volumeId.value).toBeNull()

    spy.mockClear()
    gen.volumeId.value = 'v9'
    aggMockSections.value = [{ id: 's1', volumeId: 'v9', title: 'Ch' }]
    await gen.dropEmptyRunVolume('p1')
    expect(spy).not.toHaveBeenCalled()
    expect(gen.volumeId.value).toBe('v9')
    aggMockSections.value = fixture
    spy.mockRestore()
  })
})

describe('aggregateChapterContent', () => {
  it('marks run-created sections generated and leaves their body empty', async () => {
    const gen = useVolumeStoryGenerator()
    gen.runCreatedSectionIds.value = new Set(['sec-1', 'sec-2'])

    await gen.aggregateChapterContent()

    // Prose lives in the scene rows only. The body used to receive a copy of
    // the scenes joined with <hr> and the scene word sum, and every counter
    // then reported the chapter at twice its length.
    expect(aggMockSections.value.find((s) => s.id === 'sec-1')).toMatchObject({
      content: '',
      wordCount: 0,
      status: 'generated'
    })
    expect(aggMockSections.value.find((s) => s.id === 'sec-2')).toMatchObject({
      content: '',
      wordCount: 0,
      status: 'generated'
    })
  })

  it('skips hand-written chapters not in runCreatedSectionIds', async () => {
    const gen = useVolumeStoryGenerator()
    gen.runCreatedSectionIds.value = new Set(['sec-1', 'sec-2']) // sec-3 NOT included

    // Reset sec-3 to original state
    const sec3 = aggMockSections.value.find((s) => s.id === 'sec-3')
    sec3.content = '<p>Hand written content</p>'
    sec3.wordCount = 500
    sec3.status = 'generated'

    await gen.aggregateChapterContent()

    // sec-3 should not be updated (hand-written, not in this run)
    expect(aggMockSections.value.find((s) => s.id === 'sec-3')).toMatchObject({
      content: '<p>Hand written content</p>',
      wordCount: 500,
      status: 'generated'
    })
  })

  it('skips sections with no subsections', async () => {
    const gen = useVolumeStoryGenerator()
    gen.runCreatedSectionIds.value = new Set(['sec-3']) // sec-3 has no subsections

    // Reset sec-3 to original state
    const sec3 = aggMockSections.value.find((s) => s.id === 'sec-3')
    sec3.content = '<p>Hand written content</p>'
    sec3.wordCount = 500
    sec3.status = 'generated'

    await gen.aggregateChapterContent()

    // sec-3 should not be updated (no subsections)
    expect(aggMockSections.value.find((s) => s.id === 'sec-3')).toMatchObject({
      content: '<p>Hand written content</p>',
      wordCount: 500,
      status: 'generated'
    })
  })

  it('does not touch a section whose scenes are all empty', async () => {
    const gen = useVolumeStoryGenerator()
    gen.runCreatedSectionIds.value = new Set(['sec-1'])
    // Shared fixture: an earlier case marked sec-1 generated. Start it fresh.
    const sec1 = aggMockSections.value.find((s) => s.id === 'sec-1')
    sec1.status = 'planning'
    for (const sub of aggMockSubsections.value.filter((s) => s.sectionId === 'sec-1')) {
      sub.content = ''
    }

    await gen.aggregateChapterContent()

    expect(aggMockSections.value.find((s) => s.id === 'sec-1')).toMatchObject({
      status: 'planning'
    })
  })
})

/**
 * The continuity budget.
 *
 * `sceneContext` — the only block carrying what actually happened in the story —
 * used to be capped at a flat 350 tokens, inherited from a 1,400-character limit
 * under an old 4:1 guess. Measured on a real run: the writer's window is 16,384
 * tokens, the largest prompt the pipeline produced was 3,104, and continuity got
 * 2.8% of the budget while ~9,500 tokens went unused.
 */
describe('retrievalBudgetTokens', () => {
  it('scales with the context window', async () => {
    const { retrievalBudgetTokens } = await import('@/composables/generation/context/sceneContext')
    // 16384 - 2240 output - 1500 scaffold = 12644 usable; 30% of that.
    expect(retrievalBudgetTokens(16384)).toBe(3793)
    expect(retrievalBudgetTokens(32768)).toBeGreaterThan(retrievalBudgetTokens(16384))
  })

  it('never drops below the old 350-token floor', async () => {
    const { retrievalBudgetTokens } = await import('@/composables/generation/context/sceneContext')
    // A tiny window behaves exactly as it did before the change.
    expect(retrievalBudgetTokens(2048)).toBe(350)
    expect(retrievalBudgetTokens(4096)).toBe(350)
  })
})

describe('buildEmbeddingContext budget', () => {
  it('carries more than three earlier scenes when there is room', () => {
    // Ten prior scenes that all share the current scene's character, so the
    // relevance filter keeps every one of them and only the budget decides.
    const prior = []
    for (let n = 1; n <= 10; n++) {
      prior.push({
        sceneNumber: n,
        title: `Scene ${n}`,
        prose: `Nesrin walked the salt road for the ${n}th day.`,
        // Roughly the length of a real scene summary (~60 tokens). Toy
        // one-liners all fit inside 350 tokens, which hides the difference the
        // budget makes — the thing this test exists to show.
        summary:
          `On day ${n} Nesrin hauls the salt west past the marker stones, ` +
          `weighs the load against Halim's tally, argues with the tax-farmer ` +
          `at the checkpoint, and learns something she would rather not know ` +
          `about what the sacks actually contain this season.`,
        characters: ['Nesrin']
      })
    }
    const current = { sceneNumber: 11, title: 'Scene 11', charactersPresent: ['Nesrin'] }

    const generous = buildEmbeddingContext(current, prior, 4000)
    const old = buildEmbeddingContext(current, prior, 350)

    const count = (text) => (text.match(/^- Scene /gm) || []).length
    // The old cap could not fit more than a handful; the budget fits the rest.
    expect(count(generous)).toBeGreaterThan(count(old))
    expect(count(generous)).toBeGreaterThan(3)
  })

  it('still respects the budget it is given', () => {
    const prior = []
    for (let n = 1; n <= 40; n++) {
      prior.push({
        sceneNumber: n,
        title: `Scene ${n}`,
        prose: 'x'.repeat(200),
        summary: 'Nesrin does something notable. '.repeat(10),
        characters: ['Nesrin']
      })
    }
    const current = { sceneNumber: 41, title: 'Scene 41', charactersPresent: ['Nesrin'] }
    const ctx = buildEmbeddingContext(current, prior, 600)
    // 4 chars per token is the prose ratio the budget is expressed in.
    expect(ctx.length / 4).toBeLessThan(900)
  })
})

/**
 * The established-facts ledger reaching the WRITER.
 *
 * `buildFactLedger` has existed for a while with all three of its callers in
 * `ConsistencyService` — read after the prose to find contradictions, never
 * before to prevent them. The writer's only cross-chapter signal was the spine,
 * which is generated from the outline before any prose exists.
 */
describe('buildStoryStateContext', () => {
  const scenes = [
    { chapterId: 1, keyFacts: ['Halim is alive', 'The debt is 40 kurus'] },
    { chapterId: 2, keyFacts: ['The salt is cut with something that kills'] },
    { chapterId: 5, keyFacts: ['Nesrin reaches the coast'] }
  ]

  it('tags every fact with the chapter that established it', async () => {
    const { buildStoryStateContext } = await import('@/composables/generation/context/sceneContext')
    const out = buildStoryStateContext(scenes, 5)
    expect(out).toContain('Ch1: Halim is alive')
    expect(out).toContain('Ch2: The salt is cut with something that kills')
  })

  it('never shows a scene facts from its own future', async () => {
    const { buildStoryStateContext } = await import('@/composables/generation/context/sceneContext')
    // The anchor-first writer drafts every chapter's opener before any middles,
    // so chapter 5's facts are already in `writtenScenes` while a chapter-2
    // middle is being written. Without scoping it would be handed the ending.
    const out = buildStoryStateContext(scenes, 2)
    expect(out).toContain('Ch1: Halim is alive')
    expect(out).toContain('Ch2: The salt is cut')
    expect(out).not.toContain('Nesrin reaches the coast')
  })

  it('is empty when nothing has been established yet', async () => {
    const { buildStoryStateContext } = await import('@/composables/generation/context/sceneContext')
    expect(buildStoryStateContext([], 1)).toBe('')
    expect(buildStoryStateContext(null, 1)).toBe('')
    expect(buildStoryStateContext([{ chapterId: null, keyFacts: ['x'] }], 1)).toBe('')
  })
})
