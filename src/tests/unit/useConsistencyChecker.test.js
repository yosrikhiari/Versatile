import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockCharacters = [
  { id: 1, name: 'Alice', role: 'hero' },
  { id: 2, name: 'Bob', role: 'sidekick' },
  { id: 3, name: 'Eve', role: 'background' }
]
const mockLocations = [
  { id: 1, name: 'Castle' },
  { id: 2, name: 'Forest' }
]
const mockPlotThreads = [
  { id: 1, name: 'Main Plot' },
  { id: 2, name: 'Unused Thread' }
]
const mockRelationships = [{ id: 1, fromCharacterId: 1, toCharacterId: 2, type: 'friend' }]

vi.mock('@/stores/storyBibleStore', () => ({
  useStoryBibleStore: () => ({
    characters: mockCharacters,
    locations: mockLocations,
    plotThreads: mockPlotThreads
  })
}))

vi.mock('@/stores/manuscriptStore', () => ({
  useManuscriptStore: () => ({
    subsections: mockSubsections,
    storyElements: mockStoryElements,
    relationships: mockRelationships
  })
}))

vi.mock('@/stores/storyGraphStore', () => ({
  useStoryGraphStore: () => ({
    edges: mockEdges,
    nodeInstances: mockNodeInstances
  })
}))

let mockSubsections = []
let mockStoryElements = []
let mockEdges = []
let mockNodeInstances = {}

async function useChecked() {
  const { useConsistencyChecker } = await import('@/composables/useConsistencyChecker')
  setActivePinia(createPinia())
  return useConsistencyChecker()
}

describe('useConsistencyChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubsections = []
    mockStoryElements = []
    mockEdges = []
    mockNodeInstances = {}
  })

  describe('initial state', () => {
    it('starts empty', async () => {
      const c = await useChecked()
      expect(c.results.value).toEqual([])
      expect(c.isScanning.value).toBe(false)
      expect(c.lastScan.value).toBeNull()
    })
  })

  describe('scan', () => {
    it('detects orphaned characters', async () => {
      mockSubsections = [
        { id: 's1', sectionId: 'sec1', title: 'Chapter 1', content: 'Some story text.' }
      ]
      mockEdges = [
        {
          sourceType: 'character',
          sourceId: 1,
          targetType: 'location',
          targetId: 1,
          relationshipType: 'located_at'
        }
      ]
      mockNodeInstances = { 'char-2': {} }
      const c = await useChecked()
      await c.scan()
      const orphans = c.results.value.filter((r) => r.category === 'orphaned_character')
      expect(orphans.length).toBe(0)
    })

    it('flags orphaned character with no mentions and no graph', async () => {
      const c = await useChecked()
      await c.scan()
      const orphans = c.results.value.filter((r) => r.category === 'orphaned_character')
      expect(orphans.length).toBe(2)
      expect(orphans[0].title).toContain('Alice')
      expect(orphans[0].severity).toBe('error')
    })

    it('skips background characters for orphan check', async () => {
      mockCharacters.push({ id: 99, name: 'Extra', role: 'background' })
      const c = await useChecked()
      await c.scan()
      const orphans = c.results.value.filter((r) => r.category === 'orphaned_character')
      const extraOrphan = orphans.find((r) => r.title.includes('Extra'))
      expect(extraOrphan).toBeUndefined()
    })
  })

  describe('orphaned locations', () => {
    it('flags orphaned locations', async () => {
      const c = await useChecked()
      await c.scan()
      const orphans = c.results.value.filter((r) => r.category === 'orphaned_location')
      expect(orphans.length).toBe(2)
      expect(orphans[0].severity).toBe('warning')
    })

    it('does not flag locations mentioned in manuscript', async () => {
      mockSubsections = [
        {
          id: 's1',
          sectionId: 'sec1',
          title: 'Chapter 1',
          content: 'They entered the Forest at dusk.'
        }
      ]
      mockNodeInstances = { 'loc-1': {} }
      const c = await useChecked()
      await c.scan()
      const orphans = c.results.value.filter((r) => r.category === 'orphaned_location')
      expect(orphans.length).toBe(0)
    })
  })

  describe('undefined mentions', () => {
    it('detects undefined names in subsections', async () => {
      mockSubsections = [
        {
          id: 's1',
          sectionId: 'sec1',
          title: 'Chapter 1',
          content: 'Zorath appeared in the doorway.'
        }
      ]
      const c = await useChecked()
      await c.scan()
      const undefinedMentions = c.results.value.filter((r) => r.category === 'undefined_mention')
      expect(undefinedMentions.length).toBeGreaterThanOrEqual(1)
      const zorath = undefinedMentions.find((r) => r.title.includes('Zorath'))
      expect(zorath).toBeTruthy()
      expect(zorath.severity).toBe('error')
    })

    it('ignores common English words', async () => {
      mockSubsections = [
        {
          id: 's1',
          sectionId: 'sec1',
          title: 'Chapter 1',
          content: 'The Queen walked Through the Door.'
        }
      ]
      const c = await useChecked()
      await c.scan()
      const undefinedMentions = c.results.value.filter((r) => r.category === 'undefined_mention')
      const queen = undefinedMentions.find((r) => r.title.includes('Queen'))
      expect(queen).toBeTruthy()
    })

    it('detects undefined names in story elements', async () => {
      mockStoryElements = [{ id: 'se1', title: 'Maldor invades the kingdom' }]
      const c = await useChecked()
      await c.scan()
      const undefinedMentions = c.results.value.filter((r) => r.category === 'undefined_mention')
      const maldor = undefinedMentions.find((r) => r.title.includes('Maldor'))
      expect(maldor).toBeTruthy()
    })
  })

  describe('graph–bible mismatches', () => {
    it('detects edges referencing deleted characters', async () => {
      mockEdges = [
        {
          id: 'e1',
          sourceType: 'character',
          sourceId: 999,
          targetType: 'character',
          targetId: 1,
          relationshipType: 'friend'
        }
      ]
      mockNodeInstances = {}
      const c = await useChecked()
      await c.scan()
      const mismatches = c.results.value.filter(
        (r) => r.category === 'graph_mismatch' && r.severity === 'error'
      )
      expect(mismatches.length).toBe(1)
      expect(mismatches[0].title).toContain('missing character')
    })

    it('detects edges referencing deleted locations', async () => {
      mockEdges = [
        {
          id: 'e1',
          sourceType: 'character',
          sourceId: 1,
          targetType: 'location',
          targetId: 999,
          relationshipType: 'located_at'
        }
      ]
      mockNodeInstances = {}
      const c = await useChecked()
      await c.scan()
      const mismatches = c.results.value.filter(
        (r) => r.category === 'graph_mismatch' && r.severity === 'error'
      )
      expect(mismatches.length).toBe(1)
      expect(mismatches[0].title).toContain('missing location')
    })

    it('reports characters without graph entry as info', async () => {
      mockNodeInstances = {}
      mockEdges = []
      const c = await useChecked()
      await c.scan()
      const infos = c.results.value.filter(
        (r) => r.category === 'graph_mismatch' && r.severity === 'info'
      )
      const aliceInfo = infos.find((r) => r.title.includes('Alice'))
      expect(aliceInfo).toBeTruthy()
    })

    it('skips legacy edges', async () => {
      mockEdges = [
        {
          id: 'e1',
          isLegacy: true,
          sourceType: 'character',
          sourceId: 999,
          targetType: 'location',
          targetId: 999,
          relationshipType: 'located_at'
        }
      ]
      mockNodeInstances = {}
      const c = await useChecked()
      await c.scan()
      const mismatches = c.results.value.filter(
        (r) => r.category === 'graph_mismatch' && r.severity === 'error'
      )
      expect(mismatches.length).toBe(0)
    })
  })

  describe('plot thread gaps', () => {
    it('flags unused plot threads', async () => {
      const c = await useChecked()
      await c.scan()
      const gaps = c.results.value.filter((r) => r.category === 'plot_thread_gap')
      expect(gaps.length).toBeGreaterThanOrEqual(1)
      const unused = gaps.find((r) => r.title.includes('Unused Thread'))
      expect(unused).toBeTruthy()
      expect(unused.severity).toBe('warning')
    })

    it('does not flag plot threads with graph connections', async () => {
      mockEdges = [
        {
          sourceType: 'character',
          sourceId: 1,
          targetId: 1,
          targetType: 'plotThread',
          relationshipType: 'part_of',
          id: 'e1'
        }
      ]
      mockNodeInstances = {}
      const c = await useChecked()
      await c.scan()
      const gaps = c.results.value.filter((r) => r.category === 'plot_thread_gap')
      const main = gaps.find((r) => r.title.includes('Main Plot'))
      expect(main).toBeUndefined()
    })
  })

  describe('relationship orphans', () => {
    it('detects relationships referencing missing characters', async () => {
      mockRelationships.push({ id: 2, fromCharacterId: 999, toCharacterId: 1, type: 'enemy' })
      const c = await useChecked()
      await c.scan()
      const orphans = c.results.value.filter((r) => r.category === 'relationship_orphan')
      expect(orphans.length).toBe(1)
      expect(orphans[0].severity).toBe('warning')
    })
  })

  describe('results grouping', () => {
    it('groups results by severity', async () => {
      const c = await useChecked()
      await c.scan()
      expect(c.resultsBySeverity.value.errors).toBeDefined()
      expect(c.resultsBySeverity.value.warnings).toBeDefined()
      expect(c.resultsBySeverity.value.info).toBeDefined()
      expect(c.resultsBySeverity.value.errors.length).toBe(c.counts.value.errors)
    })

    it('computes correct summary counts', async () => {
      const c = await useChecked()
      await c.scan()
      const total = c.counts.value.errors + c.counts.value.warnings + c.counts.value.info
      expect(total).toBe(c.results.value.length)
    })
  })

  describe('clearResults', () => {
    it('resets all state', async () => {
      const c = await useChecked()
      await c.scan()
      c.clearResults()
      expect(c.results.value).toEqual([])
      expect(c.lastScan.value).toBeNull()
    })
  })
})
