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
  let generateSynopsisDoc, generateCharactersDoc, generateWorldDoc, generateTimelineDoc, generateRelationshipsDoc, generateStyleGuideDoc
  let mockProjectStore, mockBibleStore, mockGraphStore, mockManuscriptStore

  beforeEach(async () => {
    setActivePinia(createPinia())
    vi.resetModules()

    mockProjectStore = {
      terminology: { synopsisLabel: 'Summary', characters: 'Characters', locations: 'World', plotThreads: 'Timeline', characterRole: 'Role' },
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
        { id: 'c1', name: 'John', role: 'Hero', goal: 'Save world', voice: 'Bold', notes: 'Brave', lastEditedAt: 100 },
        { id: 'c2', name: 'Jane', role: 'Mentor', goal: 'Guide', voice: 'Wise', lastEditedAt: 50 }
      ]
      mockGraphStore.edges = [
        { sourceId: 'c1', sourceType: 'character', targetId: 'c2', targetType: 'character', relationshipType: 'mentor', description: 'Teaches' }
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
        { sourceType: 'character', sourceId: 'c1', targetType: 'character', targetId: 'c2', relationshipType: 'ally', description: 'Fighting together' },
        { sourceType: 'character', sourceId: 'c2', targetType: 'location', targetId: 'l1', relationshipType: 'located_at', description: 'Home' }
      ]
      const result = generateRelationshipsDoc()
      expect(result).toContain('# Relationships')
      expect(result).toContain('Hero')
      expect(result).toContain('allied with')
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
      const longText = 'He was walking. She was running. They were fighting. He was fighting. She was walking. They were running. He was running. She was fighting. They were walking. He was walking quickly. She was running fast. They were fighting hard. He was winning. She was losing. They were struggling. He was strong. She was brave. They were tired. He was determined. She was hopeful. They were victorious. He was happy. She was relieved. They were celebrating. He was laughing. She was crying. They were embracing.'
      mockManuscriptStore.subsections = [{ sectionId: 's5', content: longText, order: 1 }]
      const result = generateStyleGuideDoc()
      expect(result).toContain('POV: third')
      expect(result).toContain('Tense: past')
    })
  })
})
