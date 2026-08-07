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

let index: VectorIndex | null = null

self.onmessage = async function (e: MessageEvent<VectorIndexWorkerRequest>) {
  const { id, method, args } = e.data
  
  try {
    let result: unknown
    
    switch (method) {
      case 'build': {
        const [items, config] = args as [Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>, VectorIndexConfig]

        // The built index is retained on `index` so later messages can use it.
        // It used to be built, discarded, and reported as a success — which is
        // why `search` returned [] and `getStats` returned zeros no matter what
        // had been indexed, and why module-level `index` was never assigned.
        const idx = new VectorIndex(config)
        await idx.build(items as any)
        index = idx
        result = { success: true }
        break
      }

      case 'search': {
        // No build message yet means nothing to search, which is empty rather
        // than an error: the caller may legitimately query before indexing.
        if (!index) {
          result = []
          break
        }
        const [query, limit] = args as [Float32Array, number]
        result = await index.search(query, limit)
        break
      }

      case 'getStats': {
        result = index ? index.getStats() : { nClusters: 0, totalVectors: 0, dim: 0 }
        break
      }
      
      case 'serialize': {
        result = '{}'
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