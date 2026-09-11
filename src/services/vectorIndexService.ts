/**
 * Vector Index Service - Offloads IVF vector search to a Web Worker.
 * 
 * This service manages a Web Worker that hosts the VectorIndex class and handles
 * build/search operations off the main thread to prevent blocking the UI during
 * large-scale semantic search.
 */

import type { VectorIndexConfig } from './vectorIndex'

const MAX_SAFE_VECTORS = 50000

interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface WorkerMessage {
  id: number
  result?: unknown
  error?: string
}

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, PendingEntry>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./vectorIndex.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = function (e: MessageEvent<WorkerMessage>) {
      const { id, result, error } = e.data
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (error) entry.reject(new Error(error))
      else entry.resolve(result)
    }
    worker.onerror = function (e: ErrorEvent) {
      // A dead worker must fail its callers, not hang them: reject every
      // in-flight request the same way terminate does below.
      console.error('[vectorIndex] Worker error:', e.message)
      for (const [, entry] of pending) {
        entry.reject(new Error(`Vector index worker error: ${e.message}`))
      }
      pending.clear()
    }
  }
  return worker
}

interface WorkerMessage {
  id: number
  result?: unknown
  error?: string
}

// Worker-less fallback (SSR/tests): one real index per key, mirroring the
// worker's keyed map below. Previously build constructed an index, threw it
// away, and search ran on a shared empty one — every result was [].
const directIndexes = new Map<string, any>()

async function directCall(method: string, ...args: unknown[]): Promise<unknown> {
  const [key, ...rest] = args as [string, ...unknown[]]
  if (method === 'build') {
    const [items, config] = rest as [any, VectorIndexConfig]
    const { VectorIndex } = await import('./vectorIndex')
    const idx = new VectorIndex(config)
    await idx.build(items as any)
    directIndexes.set(key, idx)
    return { success: true }
  }
  const index = directIndexes.get(key)
  if (method === 'search') {
    if (!index) return []
    const [query, limit] = rest as [Float32Array, number]
    return index.search(query, limit)
  }
  if (method === 'getStats') {
    return index ? index.getStats() : { nClusters: 0, totalVectors: 0, dim: 0 }
  }
  if (method === 'serialize') {
    return index ? index.toJSON() : '{}'
  }
  throw new Error('Unknown worker method: ' + method)
}

function workerCall(method: string, ...args: unknown[]): Promise<unknown> {
  if (typeof Worker === 'undefined') {
    return directCall(method, ...args)
  }
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, method, args })
  })
}

// --- Public API ---
//
// All calls are keyed (researchDb passes projectId): the worker and the
// fallback each hold one index per key so projects never see each
// other's vectors.

export async function buildVectorIndex(
  key: string,
  items: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>,
  config: { dim: number; nClusters?: number; nProbe?: number; minClusterSize?: number }
): Promise<void> {
  if (items.length > MAX_SAFE_VECTORS) {
    console.warn(`[vectorIndexService] ${items.length} vectors exceeds safe limit of ${MAX_SAFE_VECTORS}`)
  }
  await workerCall('build', key, items, config)
}

export async function searchVectorIndex(key: string, query: Float32Array, limit = 20): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
  return workerCall('search', key, query, limit) as Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>
}

export async function getVectorIndexStats(key: string): Promise<{ nClusters: number; totalVectors: number; dim: number }> {
  return workerCall('getStats', key) as Promise<{ nClusters: number; totalVectors: number; dim: number }>
}

export async function serializeVectorIndex(key: string): Promise<string> {
  return workerCall('serialize', key) as Promise<string>
}

export function terminateVectorIndexWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [, entry] of pending) {
      entry.reject(new Error('Worker terminated'))
    }
    pending.clear()
  }
}