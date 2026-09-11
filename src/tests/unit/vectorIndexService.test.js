import { describe, it, expect } from 'vitest'
import {
  buildVectorIndex,
  searchVectorIndex,
  getVectorIndexStats
} from '@/services/vectorIndexService'

// The worker service must be keyed: researchDb caches one index per
// project, and a single global index would cross-contaminate projects.
// In jsdom there is no Worker, so these exercise the direct-call fallback
// — which is exactly where build-once-discarded and search-empty lived.

const vec = (vals) => new Float32Array(vals)
const items = (prefix) => [
  { id: `${prefix}-a`, vector: vec([1, 0, 0]), metadata: { text: `${prefix} cats` } },
  { id: `${prefix}-b`, vector: vec([0, 1, 0]), metadata: { text: `${prefix} dogs` } }
]

describe('keyed vector index (fallback path)', () => {
  it('search before build is empty, not an error', async () => {
    const out = await searchVectorIndex('ghost-project', vec([1, 0, 0]), 5)
    expect(out).toEqual([])
  })

  it('a build populates the index that search reads', async () => {
    await buildVectorIndex('proj-build', items('x'), { dim: 3, nClusters: 1, minClusterSize: 1 })
    const out = await searchVectorIndex('proj-build', vec([1, 0, 0]), 5)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].id).toBe('x-a')
  })

  it('projects do not see each other’s vectors', async () => {
    await buildVectorIndex('proj-one', items('one'), { dim: 3, nClusters: 1, minClusterSize: 1 })
    await buildVectorIndex('proj-two', items('two'), { dim: 3, nClusters: 1, minClusterSize: 1 })
    const fromOne = await searchVectorIndex('proj-one', vec([0, 1, 0]), 5)
    // Best match first, and nothing from proj-two leaks in.
    expect(fromOne[0].id).toBe('one-b')
    expect(fromOne.every((r) => r.id.startsWith('one-'))).toBe(true)
    const stats = await getVectorIndexStats('proj-two')
    expect(stats.totalVectors).toBe(2)
  })
})
