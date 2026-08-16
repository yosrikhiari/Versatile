import { describe, it, expect } from 'vitest'
import { resolveAndCommitEdges } from '@/services/generation/edgeSync'

/**
 * W6: an edge whose endpoint entity does not exist yet must be buffered (not
 * silently dropped) and retried on a later commitSync once the entity appears.
 */

function makeFakeDeps(overrides = {}) {
  const inserted = []
  const pending = []
  return {
    inserted,
    pending,
    deps: {
      projectId: 'p1',
      volumeId: null,
      chapterNumber: 5,
      nameToId: {},
      graphStore: {
        addEdgeData: async (_pid, e) => {
          inserted.push({ ...e, id: inserted.length + 1 })
        }
      },
      getGraphEdges: async () => inserted,
      updateGraphEdge: async (id, patch) => {
        const e = inserted.find((x) => x.id === id)
        if (e) Object.assign(e, patch)
      },
      pendingTable: {
        where: (idx) => ({
          equals: (value) => ({ toArray: async () => pending.filter((p) => p[idx] === value) })
        }),
        add: async (row) => {
          const id = pending.length + 1
          pending.push({ ...row, id })
          return id
        },
        delete: async (id) => {
          const i = pending.findIndex((p) => p.id === id)
          if (i >= 0) pending.splice(i, 1)
        }
      },
      networkEvents: [],
      ...overrides
    }
  }
}

describe('resolveAndCommitEdges (W6)', () => {
  it('writes an edge whose both endpoints are known', async () => {
    const { inserted, deps } = makeFakeDeps({
      nameToId: {
        Alice: { id: 'c1', type: 'character' },
        Bob: { id: 'c2', type: 'character' }
      },
      networkEvents: [{ from: 'Alice', to: 'Bob', label: 'ally' }]
    })

    const buffered = await resolveAndCommitEdges(deps)
    expect(buffered).toBe(0)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].relationshipType).toBe('ally')
    expect(inserted[0].validFromChapter).toBe(5)
  })

  it('buffers (does not drop) an edge whose endpoint is not yet known', async () => {
    const { inserted, pending, deps } = makeFakeDeps({
      nameToId: { Alice: { id: 'c1', type: 'character' } },
      networkEvents: [{ from: 'Alice', to: 'Bob', label: 'ally' }]
    })

    const buffered = await resolveAndCommitEdges(deps)
    expect(buffered).toBe(1)
    expect(inserted).toHaveLength(0)
    expect(pending).toHaveLength(1)
    expect(pending[0].fromName).toBe('Alice')
    expect(pending[0].toName).toBe('Bob')
  })

  it('retries a buffered edge once the entity is introduced', async () => {
    const { inserted, pending, deps } = makeFakeDeps({
      nameToId: { Alice: { id: 'c1', type: 'character' } },
      networkEvents: [{ from: 'Alice', to: 'Bob', label: 'ally' }]
    })

    await resolveAndCommitEdges(deps)
    expect(inserted).toHaveLength(0)
    expect(pending).toHaveLength(1)

    // Bob is introduced in a later chapter.
    deps.nameToId.Bob = { id: 'c2', type: 'character' }
    // A later commitSync fires with no new network events — only the retry runs.
    deps.networkEvents = []
    const buffered = await resolveAndCommitEdges(deps)

    expect(buffered).toBe(0)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].relationshipType).toBe('ally')
    expect(pending).toHaveLength(0)
  })
})
