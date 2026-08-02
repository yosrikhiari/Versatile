/**
 * Vector index for efficient semantic search.
 * 
 * Replaces the O(n) brute-force scan with an IVF (Inverted File Index) 
 * + flat refinement approach. Suitable for up to ~50k vectors in the browser.
 * 
 * Can run in a Web Worker for non-blocking search.
 */

export interface VectorIndexConfig {
  /** Number of clusters (centroids) for IVF. ~sqrt(n) is a good heuristic. */
  nClusters?: number
  /** Number of clusters to probe at search time. Higher = better recall, slower. */
  nProbe?: number
  /** Minimum vectors per cluster before creating a centroid. */
  minClusterSize?: number
  /** Dimension of vectors. Must match embedding model. */
  dim: number
}

export interface SearchResult {
  id: string
  score: number
  metadata?: Record<string, unknown>
}

interface Cluster {
  centroid: Float32Array
  vectors: Map<string, { vector: Float32Array; metadata?: Record<string, unknown> }>
}

/**
 * Simple IVF (Inverted File Index) vector index.
 * 
 * - Build: K-means clustering on vectors, assign to clusters
 * - Search: Find nearest centroids (nProbe), then brute-force within those clusters
 * - This is a simplified IVFFlat index, suitable for browser use
 */
export class VectorIndex {
  private config: VectorIndexConfig
  private clusters: Cluster[] = []
  private dim: number
  private built = false

  constructor(config: VectorIndexConfig) {
    this.config = {
      nClusters: config.nClusters ?? 0,
      nProbe: config.nProbe ?? 4,
      minClusterSize: config.minClusterSize ?? 50,
      dim: config.dim
    }
    this.dim = config.dim
  }

  /** Build the index from a list of vectors. */
  async build(items: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>): Promise<void> {
    if (items.length === 0) {
      this.clusters = []
      this.built = true
      return
    }

    const n = items.length
    const k = this.config.nClusters ?? Math.max(1, Math.floor(Math.sqrt(n)))
    const minSize = this.config.minClusterSize ?? 50

    // 1. Initialize centroids using k-means++
    const centroids = this.initCentroidsKMeansPlusPlus(items, k)
    
    // 2. Assign vectors to clusters
    const clusters = new Array<Cluster>(k)
    for (let i = 0; i < k; i++) {
      clusters[i] = {
        centroid: centroids[i],
        vectors: new Map()
      }
    }

    for (const item of items) {
      const clusterIdx = this.findNearestCluster(item.vector, centroids)
      clusters[clusterIdx].vectors.set(item.id, {
        vector: item.vector,
        metadata: item.metadata
      })
    }

    // 3. Remove empty/small clusters, recalculate centroids
    this.clusters = clusters
      .filter(c => c.vectors.size >= minSize)
      .map(c => ({
        centroid: this.computeCentroid(Array.from(c.vectors.values()).map(v => v.vector)),
        vectors: c.vectors
      }))

    // If we filtered too many, rebuild with fewer clusters
    if (this.clusters.length === 0 && items.length > 0) {
      // Fallback: single cluster
      this.clusters = [{
        centroid: this.computeCentroid(items.map(i => i.vector)),
        vectors: new Map(items.map(i => [i.id, { vector: i.vector, metadata: i.metadata }]))
      }]
    }

    this.built = true
  }

  /** Initialize centroids using k-means++ for better spread. */
  private initCentroidsKMeansPlusPlus(
    items: Array<{ vector: Float32Array }>, 
    k: number
  ): Float32Array[] {
    const centroids: Float32Array[] = []
    const n = items.length

    // First centroid: random
    centroids.push(items[Math.floor(Math.random() * n)].vector.slice())

    for (let i = 1; i < k; i++) {
      // Compute distances to nearest centroid
      const distances = new Float32Array(n)
      let maxDist = 0
      let maxIdx = 0

      for (let j = 0; j < n; j++) {
        let minDist = Infinity
        for (const centroid of centroids) {
          const dist = this.squaredDistance(items[j].vector, centroid)
          if (dist < minDist) minDist = dist
        }
        distances[j] = minDist
        if (minDist > maxDist) {
          maxDist = minDist
          maxIdx = j
        }
      }

      centroids.push(items[maxIdx].vector.slice())
    }

    // Refine with a few Lloyd iterations
    for (let iter = 0; iter < 3; iter++) {
      const assignments = new Array<number>(n)
      const newCentroids: Float32Array[] = new Array(k)
      const counts = new Array<number>(k).fill(0)

      // Initialize
      for (let c = 0; c < k; c++) {
        newCentroids[c] = new Float32Array(this.dim)
      }

      // Assign
      for (let j = 0; j < n; j++) {
        let bestC = 0
        let bestDist = Infinity
        for (let c = 0; c < k; c++) {
          const dist = this.squaredDistance(items[j].vector, centroids[c])
          if (dist < bestDist) {
            bestDist = dist
            bestC = c
          }
        }
        assignments[j] = bestC
        counts[bestC]++
        const v = items[j].vector
        for (let d = 0; d < this.dim; d++) {
          newCentroids[bestC][d] += v[d]
        }
      }

      // Normalize
      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          for (let d = 0; d < this.dim; d++) {
            newCentroids[c][d] /= counts[c]
          }
        }
      }
      centroids.splice(0, k, ...newCentroids)
    }

    return centroids
  }

  /** Search for nearest neighbors. */
  async search(query: Float32Array, limit: number = 20): Promise<SearchResult[]> {
    if (!this.built || this.clusters.length === 0) return []

    // 1. Find nProbe nearest clusters
    const clusterDists = this.clusters.map((c, idx) => ({
      idx,
      dist: this.squaredDistance(query, c.centroid)
    }))
    clusterDists.sort((a, b) => a.dist - b.dist)

    const probeCount = Math.min(this.config.nProbe ?? 4, this.clusters.length)
    const candidateClusters = clusterDists.slice(0, probeCount)

    // 2. Brute-force within candidate clusters
    const results: SearchResult[] = []
    for (const { idx } of candidateClusters) {
      const cluster = this.clusters[idx]
      for (const [id, { vector, metadata }] of cluster.vectors) {
        const score = this.cosineSimilarity(query, vector)
        results.push({ id, score, metadata })
      }
    }

    // 3. Sort and return top-k
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

/** Serialize for worker transfer. */
  toJSON(): string {
    return JSON.stringify({
      config: this.config,
      clusters: this.clusters.map(c => ({
        centroid: Array.from(c.centroid),
        vectors: Array.from(c.vectors.entries()).map(([id, { vector, metadata }]) => ({
          id,
          vector: Array.from(vector),
          metadata
        }))
      }))
    })
  }

  /** Load from serialized JSON. */
  static fromJSON(json: string): VectorIndex {
    const data = JSON.parse(json)
    const index = new VectorIndex(data.config)
    index.clusters = data.clusters.map((c: any) => ({
      centroid: new Float32Array(c.centroid),
      vectors: new Map(c.vectors.map((v: any) => [
        v.id,
        { vector: new Float32Array(v.vector), metadata: v.metadata }
      ]))
    }))
    index.built = true
    return index
  }

  /** Get index stats. */
  getStats(): { nClusters: number; totalVectors: number; dim: number } {
    return {
      nClusters: this.clusters.length,
      totalVectors: this.clusters.reduce((sum, c) => sum + c.vectors.size, 0),
      dim: this.dim
    }
  }

  // --- Math helpers ---

  private squaredDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0
    for (let i = 0; i < this.dim; i++) {
      const diff = a[i] - b[i]
      sum += diff * diff
    }
    return sum
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < this.dim; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
  }

  private findNearestCluster(vector: Float32Array, centroids: Float32Array[]): number {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < centroids.length; i++) {
      const dist = this.squaredDistance(vector, centroids[i])
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    }
    return best
  }

  private computeCentroid(vectors: Float32Array[]): Float32Array {
    if (vectors.length === 0) return new Float32Array(this.dim)
    const centroid = new Float32Array(this.dim)
    for (const v of vectors) {
      for (let i = 0; i < this.dim; i++) centroid[i] += v[i]
    }
    for (let i = 0; i < this.dim; i++) centroid[i] /= vectors.length
    return centroid
  }
}

/**
 * Worker-compatible search function.
 * Usage in worker:
 *   const index = VectorIndex.fromJSON(serialized)
 *   const results = await index.search(queryVector, limit)
 */
export function createVectorIndexWorker(config: VectorIndexConfig): {
  build: (items: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>) => Promise<void>
  search: (query: Float32Array, limit: number) => Promise<SearchResult[]>
  getStats: () => { nClusters: number; totalVectors: number; dim: number }
} {
  const index = new VectorIndex(config)
  return {
    build: (items) => index.build(items),
    search: (query, limit) => index.search(query, limit),
    getStats: () => index.getStats()
  }
}

/**
 * Simple flat index fallback for small datasets (< 1000 vectors).
 * No clustering overhead, just brute-force with SIMD-friendly loops.
 */
export class FlatVectorIndex {
  private vectors: Map<string, { vector: Float32Array; metadata?: Record<string, unknown> }> = new Map()
  private dim: number

  constructor(dim: number) {
    this.dim = dim
  }

  add(id: string, vector: Float32Array, metadata?: Record<string, unknown>): void {
    this.vectors.set(id, { vector, metadata })
  }

  async search(query: Float32Array, limit: number = 20): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    for (const [id, { vector, metadata }] of this.vectors) {
      const score = this.cosineSimilarity(query, vector)
      results.push({ id, score, metadata })
    }
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < this.dim; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
  }

  size(): number {
    return this.vectors.size
  }

  clear(): void {
    this.vectors.clear()
  }
}