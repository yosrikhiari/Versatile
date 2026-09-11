/**
 * Vector Index Worker - Hosts the IVF VectorIndex in a Web Worker.
 * 
 * This worker runs the vector index build and search operations off the main thread
 * to prevent blocking the UI during large-scale semantic search operations.
 */

import type { VectorIndexConfig, SearchResult } from '../services/vectorIndex'
import { VectorIndex } from '../services/vectorIndex'

interface VectorIndexWorkerRequest {
  id: number
  method: 'build' | 'search' | 'getStats' | 'serialize'
  args: unknown[]
}

interface WorkerResponse {
  id: number
  result?: unknown
  error?: string
}

const indexes = new Map<string, VectorIndex>()

function indexFor(key: string): VectorIndex | null {
  return indexes.get(key) ?? null
}

self.onmessage = async function (e: MessageEvent<VectorIndexWorkerRequest>) {
  const { id, method, args } = e.data

  try {
    let result: unknown

    switch (method) {
      case 'build': {
        const [key, items, config] = args as [string, Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>, VectorIndexConfig]

        // The built index is retained per key so later messages can use it.
        // It used to be built, discarded, and reported as a success — which is
        // why `search` returned [] and `getStats` returned zeros no matter what
        // had been indexed, and why module-level `index` was never assigned.
        const idx = new VectorIndex(config)
        await idx.build(items as any)
        indexes.set(key, idx)
        result = { success: true }
        break
      }

      case 'search': {
        // No build message yet means nothing to search, which is empty rather
        // than an error: the caller may legitimately query before indexing.
        const [key, query, limit] = args as [string, Float32Array, number]
        const target = indexFor(key)
        if (!target) {
          result = []
          break
        }
        result = await target.search(query, limit)
        break
      }

      case 'getStats': {
        const [key] = args as [string]
        const target = indexFor(key)
        result = target ? target.getStats() : { nClusters: 0, totalVectors: 0, dim: 0 }
        break
      }

      case 'serialize': {
        const [key] = args as [string]
        const target = indexFor(key)
        result = target ? target.toJSON() : '{}'
        break
      }

      default:
        throw new Error('Unknown worker method: ' + method)
    }

    self.postMessage({ id: e.data.id, result })
  } catch (error) {
    self.postMessage({ id: e.data.id, error: (error as Error).message })
  }
}

self.onerror = function (e: string | Event) {
  console.error('[vectorIndex] Worker error:', e instanceof Event ? e.type : e)
}