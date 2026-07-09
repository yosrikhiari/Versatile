import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./db-core', () => ({
  db: {
    storyElements: {},
    graphEdges: {},
    nodePositions: {},
    nodeInstances: {},
    nodeParents: {},
    graphGroups: {},
    groupEdges: {}
  },
  deepPlain: vi.fn()
}))

let getNodePrefix
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/services/db-graph')
  getNodePrefix = mod.getNodePrefix
})

describe('getNodePrefix', () => {
  it('returns "char" for character entity type', () => {
    expect(getNodePrefix('character')).toBe('char')
  })

  it('returns "loc" for location entity type', () => {
    expect(getNodePrefix('location')).toBe('loc')
  })

  it('returns "thread" for other entity types', () => {
    expect(getNodePrefix('plotThread')).toBe('thread')
    expect(getNodePrefix('scene')).toBe('thread')
    expect(getNodePrefix(null)).toBe('thread')
    expect(getNodePrefix(undefined)).toBe('thread')
  })
})
