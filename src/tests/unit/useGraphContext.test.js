import { describe, it, expect, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockCharacters = [
  { id: 1, name: 'Alice', role: 'hero' },
  { id: 2, name: 'Bob', role: 'sidekick' }
]
const mockLocations = [{ id: 1, name: 'Castle' }]
const mockPlotThreads = [{ id: 1, title: 'Main Plot' }]
const mockEdges = [
  { sourceType: 'character', sourceId: 1, targetType: 'location', targetId: 1, relationshipType: 'located_at' }
]

vi.mock('@/stores/storyGraphStore', () => ({
  useStoryGraphStore: () => ({
    edges: mockEdges
  })
}))

vi.mock('@/stores/storyBibleStore', () => ({
  useStoryBibleStore: () => ({
    characters: mockCharacters,
    locations: mockLocations,
    plotThreads: mockPlotThreads
  })
}))

async function getCtx() {
  const { useGraphContext } = await import('@/composables/useGraphContext')
  setActivePinia(createPinia())
  return useGraphContext()
}

describe('useGraphContext', () => {
  describe('parseNodeId', () => {
    it('parses char prefix', async () => {
      const ctx = await getCtx()
      expect(ctx.parseNodeId('char-42')).toEqual({ type: 'character', id: 42 })
    })

    it('parses loc prefix', async () => {
      const ctx = await getCtx()
      expect(ctx.parseNodeId('loc-1')).toEqual({ type: 'location', id: 1 })
    })

    it('parses thread prefix', async () => {
      const ctx = await getCtx()
      expect(ctx.parseNodeId('thread-5')).toEqual({ type: 'plotThread', id: 5 })
    })

    it('returns null for unknown prefix', async () => {
      const ctx = await getCtx()
      expect(ctx.parseNodeId('unknown-1')).toBeNull()
    })

    it('handles multi-part id', async () => {
      const ctx = await getCtx()
      expect(ctx.parseNodeId('char-42-extra')).toEqual({ type: 'character', id: 42 })
    })
  })

  describe('buildNodeId', () => {
    it('builds character node id', async () => {
      const ctx = await getCtx()
      expect(ctx.buildNodeId('character', 1)).toBe('char-1')
    })

    it('builds location node id', async () => {
      const ctx = await getCtx()
      expect(ctx.buildNodeId('location', 42)).toBe('loc-42')
    })

    it('builds plotThread node id', async () => {
      const ctx = await getCtx()
      expect(ctx.buildNodeId('plotThread', 7)).toBe('thread-7')
    })
  })

  describe('getEntityTypePrefix', () => {
    it('returns char for character', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityTypePrefix('character')).toBe('char')
    })

    it('returns loc for location', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityTypePrefix('location')).toBe('loc')
    })

    it('returns thread for plotThread', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityTypePrefix('plotThread')).toBe('thread')
    })

    it('returns unknown for other types', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityTypePrefix('other')).toBe('unknown')
    })
  })

  describe('getRelationshipLabel', () => {
    it('returns label for known type', async () => {
      const ctx = await getCtx()
      expect(ctx.getRelationshipLabel('ally')).toBe('allied with')
      expect(ctx.getRelationshipLabel('enemy')).toBe('opposed to')
      expect(ctx.getRelationshipLabel('located_at')).toBe('located at')
    })

    it('returns type itself for unknown type', async () => {
      const ctx = await getCtx()
      expect(ctx.getRelationshipLabel('unknown_type')).toBe('unknown_type')
    })
  })

  describe('getEntityName', () => {
    it('returns character name', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityName('character', 1)).toBe('Alice')
    })

    it('returns fallback for missing character', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityName('character', 999)).toBe('Character 999')
    })

    it('returns location name', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityName('location', 1)).toBe('Castle')
    })

    it('returns plot thread title', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityName('plotThread', 1)).toBe('Main Plot')
    })

    it('returns fallback for unknown type', async () => {
      const ctx = await getCtx()
      expect(ctx.getEntityName('unknown', 5)).toBe('Entity 5')
    })
  })

  describe('getRelationshipContext', () => {
    it('returns empty for no entities', async () => {
      const ctx = await getCtx()
      const result = await ctx.getRelationshipContext([])
      expect(result).toBe('')
    })

    it('builds relationship paths', async () => {
      const ctx = await getCtx()
      const result = await ctx.getRelationshipContext([{ type: 'character', id: 1 }])
      expect(result).toContain('Alice')
      expect(result).toContain('Castle')
    })
  })

  describe('getEntityRelationshipContext', () => {
    it('returns empty for unknown entity', async () => {
      const ctx = await getCtx()
      const result = await ctx.getEntityRelationshipContext('character', 999)
      expect(result).toBe('')
    })
  })
})
