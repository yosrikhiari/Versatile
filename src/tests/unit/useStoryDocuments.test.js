import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('useStoryDocuments', () => {
  let tokenCount, truncateToBudget, getRelationshipLabel

  beforeEach(async () => {
    setActivePinia(createPinia())
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
      expect(tokenCount('hello world')).toBe(3)
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
      const content = '# Header\n---\nEntry\n---\nEntry2'
      expect(truncateToBudget(content, 1000)).toBe(content)
    })

    it('drops sections that exceed budget', () => {
      const content = '# Header\n---\n' + 'x'.repeat(500)
      const result = truncateToBudget(content, 63)
      expect(result).toBe('# Header')
    })

    it('always includes the header', () => {
      const content = '# Header\n---\nEntry'
      const result = truncateToBudget(content, 2)
      expect(result).toBe('# Header')
    })
  })

  describe('getRelationshipLabel', () => {
    it('returns label for known type', () => {
      expect(getRelationshipLabel('ally')).toBe('allied with')
    })

    it('returns type itself for unknown type', () => {
      expect(getRelationshipLabel('unknown_type')).toBe('unknown_type')
    })
  })
})

describe('document generators', () => {
  let generateSynopsisDoc,
    generateCharactersDoc,
    generateWorldDoc,
    generateTimelineDoc,
    generateRelationshipsDoc,
    generateStyleGuideDoc,
    generateStorySoFarDoc,
    splitAuthorZone,
    buildStoryContextDoc,
    CONTEXT_SENTINEL
  let mockProjectStore, mockBibleStore, mockGraphStore, mockManuscriptStore

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.resetModules()

    mockProjectStore = {
      terminology: {
        synopsisLabel: 'Summary',
        characters: 'Characters',
        locations: 'World',
        plotThreads: 'Timeline',
        characterRole: 'Role'
      },
      currentCategory: 'Fantasy',
      currentDescription: 'A tale of adventure'
    }

    mockBibleStore = {
      characters: [],
      locations: [],
      plotThreads: []
    }

    mockGraphStore = {
      edges: [],
      loadEdges: vi.fn()
    }

    mockManuscriptStore = {
      sortedSections: [],
      subsections: []
    }

    vi.doMock('@/stores/projectStore', () => ({
      useProjectStore: () => mockProjectStore
    }))

    vi.doMock('@/stores/storyBibleStore', () => ({
      useStoryBibleStore: () => mockBibleStore
    }))

    vi.doMock('@/stores/storyGraphStore', () => ({
      useStoryGraphStore: () => mockGraphStore
    }))

    vi.doMock('@/utils/textUtils', () => ({
      countWords: vi.fn((t) => {
        if (t && t.length > 100) return 300
        return (t || '').split(/\s+/).filter(Boolean).length
      })
    }))

    vi.doMock('@/stores/manuscriptStore', () => ({
      useManuscriptStore: () => mockManuscriptStore
    }))

    const mod = await import('@/composables/useStoryDocuments')
    generateSynopsisDoc = mod.generateSynopsisDoc
    generateCharactersDoc = mod.generateCharactersDoc
    generateWorldDoc = mod.generateWorldDoc
    generateTimelineDoc = mod.generateTimelineDoc
    generateRelationshipsDoc = mod.generateRelationshipsDoc
    generateStyleGuideDoc = mod.generateStyleGuideDoc
    generateStorySoFarDoc = mod.generateStorySoFarDoc
    splitAuthorZone = mod.splitAuthorZone
    buildStoryContextDoc = mod.buildStoryContextDoc
    CONTEXT_SENTINEL = mod.CONTEXT_SENTINEL
  })

  describe('generateStorySoFarDoc', () => {
    it('returns empty when nothing is written', () => {
      expect(generateStorySoFarDoc()).toBe('')
    })

    it('summarizes written scenes and strips HTML', () => {
      mockManuscriptStore.sortedSections = [{ id: 's1', title: 'Chapter 1' }]
      mockManuscriptStore.subsections = [
        { sectionId: 's1', title: 'Opening', order: 1, content: '<p>The door <b>slammed</b> shut.</p>' },
        { sectionId: 's1', title: 'Empty', order: 2, content: '' }
      ]
      const result = generateStorySoFarDoc()
      expect(result).toContain('# Story So Far')
      expect(result).toContain('Chapter 1')
      expect(result).toContain('Opening')
      expect(result).toContain('The door slammed shut.')
      expect(result).not.toContain('<p>')
      // Empty scenes are omitted
      expect(result).not.toContain('Empty')
    })
  })

  describe('splitAuthorZone', () => {
    it('treats content without a sentinel as all author zone', () => {
      const { authorZone, autoZone } = splitAuthorZone('# My notes\nkeep this')
      expect(authorZone).toBe('# My notes\nkeep this')
      expect(autoZone).toBe('')
    })

    it('splits at the sentinel', () => {
      const content = `# Notes\nkeep me\n\n${CONTEXT_SENTINEL}\n\n# Auto\ndrop me`
      const { authorZone, autoZone } = splitAuthorZone(content)
      expect(authorZone).toBe('# Notes\nkeep me')
      expect(autoZone).toBe('# Auto\ndrop me')
    })
  })

  describe('buildStoryContextDoc', () => {
    it('preserves a provided author zone and inserts the sentinel', async () => {
      const doc = await buildStoryContextDoc('proj-1', '# My Canon\nThe king is dead.')
      expect(doc.startsWith('# My Canon')).toBe(true)
      expect(doc).toContain('The king is dead.')
      expect(doc).toContain(CONTEXT_SENTINEL)
      // Auto zone still aggregates existing docs (synopsis from mock project store)
      expect(doc).toContain('# Summary')
    })

    it('falls back to the author template when none is provided', async () => {
      const doc = await buildStoryContextDoc('proj-1', '')
      expect(doc).toContain('Author Canon & Notes')
      expect(doc).toContain(CONTEXT_SENTINEL)
    })
  })

  describe('generateSynopsisDoc', () => {
    it('renders synopsis from project store', () => {
      const result = generateSynopsisDoc()
      expect(result).toContain('# Summary')
      expect(result).toContain('Fantasy')
      expect(result).toContain('A tale of adventure')
    })

    it('handles missing category', () => {
      mockProjectStore.currentCategory = null
      mockProjectStore.currentDescription = null
      const result = generateSynopsisDoc()
      expect(result).not.toContain('Category')
    })
  })

  describe('generateCharactersDoc', () => {
    it('returns empty when no characters', async () => {
      await expect(generateCharactersDoc('proj-1')).resolves.toBe('')
    })

    it('renders characters with relationships', async () => {
      mockBibleStore.characters = [
        {
          id: 'c1',
          name: 'John',
          role: 'Hero',
          goal: 'Save world',
          voice: 'Bold',
          notes: 'Brave',
          lastEditedAt: 100
        },
        { id: 'c2', name: 'Jane', role: 'Mentor', goal: 'Guide', voice: 'Wise', lastEditedAt: 50 }
      ]
      mockGraphStore.edges = [
        {
          sourceId: 'c1',
          sourceType: 'character',
          targetId: 'c2',
          targetType: 'character',
          relationshipType: 'mentor',
          description: 'Teaches'
        }
      ]
      const result = await generateCharactersDoc('proj-1')
      expect(result).toContain('# Characters')
      expect(result).toContain('John')
      expect(result).toContain('Jane')
      expect(result).toContain('mentors')
    })

    it('sorts by lastEditedAt descending', async () => {
      mockBibleStore.characters = [
        { id: 'c1', name: 'Old', lastEditedAt: 10 },
        { id: 'c2', name: 'New', lastEditedAt: 100 }
      ]
      const result = await generateCharactersDoc('proj-1')
      const newIdx = result.indexOf('New')
      const oldIdx = result.indexOf('Old')
      expect(newIdx).toBeLessThan(oldIdx)
    })

    it('flips a directional relationship so it is not circular', async () => {
      mockBibleStore.characters = [
        { id: 'c1', name: 'Sage', lastEditedAt: 2 },
        { id: 'c2', name: 'Pupil', lastEditedAt: 1 }
      ]
      mockGraphStore.edges = [
        {
          sourceId: 'c1',
          sourceType: 'character',
          targetId: 'c2',
          targetType: 'character',
          relationshipType: 'mentor'
        }
      ]
      const result = await generateCharactersDoc('proj-1')
      // Source side reads "mentors", target side reads "mentored by" — not circular.
      expect(result).toContain('mentors Pupil')
      expect(result).toContain('mentored by Sage')
      // The pupil must never be shown mentoring the sage.
      const pupilSection = result.slice(result.indexOf('## Pupil'))
      expect(pupilSection).not.toContain('mentors Sage')
    })

    it('drops relationships pointing at entities that no longer exist', async () => {
      mockBibleStore.characters = [{ id: 'c1', name: 'Solo', lastEditedAt: 1 }]
      mockGraphStore.edges = [
        {
          sourceId: 'c1',
          sourceType: 'character',
          targetId: 'ghost',
          targetType: 'character',
          relationshipType: 'ally'
        }
      ]
      const result = await generateCharactersDoc('proj-1')
      expect(result).toContain('Solo')
      expect(result).not.toContain('Character ghost')
      // Orphaned edge dropped → no relationships section at all.
      expect(result).not.toContain('### Relationships')
    })
  })

  describe('generateWorldDoc', () => {
    it('returns empty when no locations', () => {
      expect(generateWorldDoc()).toBe('')
    })

    it('renders locations', () => {
      mockBibleStore.locations = [
        { name: 'Forest', description: 'Dark woods', notes: 'Dangerous' },
        { name: 'Castle' }
      ]
      const result = generateWorldDoc()
      expect(result).toContain('# World')
      expect(result).toContain('Forest')
      expect(result).toContain('Dark woods')
      expect(result).toContain('Castle')
    })
  })

  describe('generateTimelineDoc', () => {
    it('returns empty when no threads', () => {
      expect(generateTimelineDoc()).toBe('')
    })

    it('renders sorted plot threads', () => {
      mockBibleStore.plotThreads = [
        { title: 'End', status: 'completed', timelineOrder: 2, notes: 'Finale' },
        { title: 'Start', status: 'open', timelineOrder: 1 }
      ]
      const result = generateTimelineDoc()
      expect(result).toContain('# Timeline')
      expect(result).toContain('Start (open)')
      expect(result).toContain('End (completed)')
      const startIdx = result.indexOf('Start')
      const endIdx = result.indexOf('End')
      expect(startIdx).toBeLessThan(endIdx)
    })
  })

  describe('generateRelationshipsDoc', () => {
    it('returns empty when no edges', () => {
      expect(generateRelationshipsDoc()).toBe('')
    })

    it('renders character relationships grouped by name', () => {
      mockBibleStore.characters = [
        { id: 'c1', name: 'Hero' },
        { id: 'c2', name: 'Sidekick' }
      ]
      mockBibleStore.locations = [{ id: 'l1', name: 'Village' }]
      mockGraphStore.edges = [
        {
          sourceType: 'character',
          sourceId: 'c1',
          targetType: 'character',
          targetId: 'c2',
          relationshipType: 'ally',
          description: 'Fighting together'
        },
        {
          sourceType: 'character',
          sourceId: 'c2',
          targetType: 'location',
          targetId: 'l1',
          relationshipType: 'located_at',
          description: 'Home'
        }
      ]
      const result = generateRelationshipsDoc()
      expect(result).toContain('# Relationships')
      expect(result).toContain('Hero')
      expect(result).toContain('allied with')
    })

    it('returns empty when every edge points at a missing entity', () => {
      mockBibleStore.characters = [{ id: 'c1', name: 'Real' }]
      mockBibleStore.locations = []
      mockGraphStore.edges = [
        {
          sourceType: 'character',
          sourceId: 'c1',
          targetType: 'location',
          targetId: '99',
          relationshipType: 'located_at'
        }
      ]
      // The location is gone, so the only edge is orphaned → no bare header.
      expect(generateRelationshipsDoc()).toBe('')
    })
  })

  describe('generateStyleGuideDoc', () => {
    it('returns empty when no sections', () => {
      expect(generateStyleGuideDoc()).toBe('')
    })

    it('returns empty when less than 200 words', () => {
      mockManuscriptStore.sortedSections = [{ id: 's1' }]
      mockManuscriptStore.subsections = [{ sectionId: 's1', content: 'Hello world', order: 1 }]
      expect(generateStyleGuideDoc()).toBe('')
    })

    it('detects POV and tense from prose', () => {
      mockManuscriptStore.sortedSections = [{ id: 's5' }]
      const longText =
        'He was walking. She was running. They were fighting. He was fighting. She was walking. They were running. He was running. She was fighting. They were walking. He was walking quickly. She was running fast. They were fighting hard. He was winning. She was losing. They were struggling. He was strong. She was brave. They were tired. He was determined. She was hopeful. They were victorious. He was happy. She was relieved. They were celebrating. He was laughing. She was crying. They were embracing.'
      mockManuscriptStore.subsections = [{ sectionId: 's5', content: longText, order: 1 }]
      const result = generateStyleGuideDoc()
      expect(result).toContain('POV: third')
      expect(result).toContain('Tense: past')
    })
  })
})
