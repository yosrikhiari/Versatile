/**
 * Vector Index Service - Offloads IVF vector search to a Web Worker.
 * 
 * This service manages a Web Worker that hosts the VectorIndex class and handles
 * build/search operations off the main thread to prevent blocking the UI during
 * large-scale semantic search.
 */

import type { VectorIndexConfig, SearchResult } from './vectorIndex'

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
      console.error('[vectorIndex] Worker error:', e.message)
    }
  }
  return worker
}

function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [, entry] of pending) {
      entry.reject(new Error('Worker terminated'))
    }
    pending.clear()
  }
}

interface WorkerMessage {
  id: number
  result?: unknown
  error?: string
}

let directFns: { 
  build: (items: any, config: VectorIndexConfig) => Promise<void>
  search: (query: Float32Array, limit: number) => Promise<SearchResult[]>
  getStats: () => { nClusters: number; totalVectors: number; dim: number }
  serialize: () => string
} | null = null

async function directCall(method: string, ...args: unknown[]): Promise<unknown> {
  if (!directFns) {
    const { VectorIndex } = await import('./vectorIndex')
    const index = new VectorIndex({ dim: 0 })
    directFns = {
      build: async (items: any, config: VectorIndexConfig) => {
        const idx = new VectorIndex(config)
        await idx.build(items as any)
      },
      search: async (query: Float32Array, limit: number) => {
        return index.search(query, limit)
      },
      getStats: () => index.getStats(),
      serialize: () => index.toJSON()
    }
  }
  const fn = directFns[method as keyof typeof directFns]
  if (!fn) throw new Error('Unknown worker method: ' + method)
  return (fn as (...args: unknown[]) => Promise<unknown>)(...args)
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

export async function buildVectorIndex(
  items: Array<{ id: string; vector: Float32Array; metadata?: Record<string, unknown> }>,
  config: { dim: number; nClusters?: number; nProbe?: number; minClusterSize?: number }
): Promise<void> {
  if (items.length > 50000) {
    console.warn(`[vectorIndexService] ${items.length} vectors exceeds safe limit of 50000`)
  }
  await workerCall('build', items, config)
}

export async function searchVectorIndex(query: Float32Array, limit = 20): Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>> {
  return workerCall('search', query, limit) as Promise<Array<{ id: string; score: number; metadata?: Record<string, unknown> }>>
}

export async function getVectorIndexStats(): Promise<{ nClusters: number; totalVectors: number; dim: number }> {
  return workerCall('getStats') as Promise<{ nClusters: number; totalVectors: number; dim: number }>
}

export async function serializeVectorIndex(): Promise<string> {
  return workerCall('serialize') as Promise<string>
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