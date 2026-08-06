import { getOllamaEndpoint } from '../config/ollama'
import { RERANKING_DEFAULTS } from '../config/ai'
import { getEmbedding } from './embeddingService'
import { armTimeLimit } from '../config/timeLimits'

const DEFAULT_RERANK_MODEL = 'jina/jina-reranker-v2-base-multilingual'
const FALLBACK_MODEL = 'nomic-embed-text'

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

interface RerankChunk {
  id: string
  text?: string
  content?: string
  documentId?: string
  [key: string]: unknown
}

interface RerankOptions<T extends RerankChunk = RerankChunk> {
  chunks: T[]
  query: string
  topN?: number
  model?: string
  minScore?: number
}

/** Reranking annotates chunks; it must not erase the caller's chunk type. */
type Reranked<T> = T & {
  _rerankScore: number
  _rerankIndex: number
}

export async function rerankChunks<T extends RerankChunk>({
  chunks,
  query,
  topN = RERANKING_DEFAULTS.topN,
  model,
  minScore
}: RerankOptions<T>): Promise<Reranked<T>[]> {
  if (!chunks || chunks.length === 0) return []
  if (!query) return chunks.map((c, i) => ({ ...c, _rerankScore: 0, _rerankIndex: i }))

  const effectiveTopN = Math.min(topN, chunks.length)
  const effectiveMinScore = minScore ?? RERANKING_DEFAULTS.minScore

  try {
    return await rerankWithOllama(chunks, query, effectiveTopN, model, effectiveMinScore)
  } catch {
    // Fallback to embedding-based similarity rerank
  }

  try {
    return await rerankWithEmbeddings(chunks, query, effectiveTopN, effectiveMinScore)
  } catch {
    // Return original order with 0 scores on total failure
    return chunks.map((c, i) => ({ ...c, _rerankScore: 0, _rerankIndex: i }))
  }
}

async function rerankWithOllama<T extends RerankChunk>(
  chunks: T[],
  query: string,
  topN: number,
  model: string | undefined,
  minScore: number
): Promise<Reranked<T>[]> {
  const rerankModel = model || RERANKING_DEFAULTS.model || DEFAULT_RERANK_MODEL
  const documents = chunks.map((c) => c.text || c.content || '')

  const controller = new AbortController()
  const timeout = armTimeLimit(30000, () =>
    controller.abort(new DOMException('Rerank request timed out', 'AbortError'))
  )

  try {
    const response = await fetch(`${getOllamaEndpoint()}/api/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: rerankModel,
        query,
        documents,
        top_n: topN
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama rerank error (${response.status})`)
    }

    interface RerankResult {
      results?: { index: number; relevance_score: number }[]
    }

    const data: RerankResult = await response.json()
    const results = data.results || []

    const scoreByIndex = new Map(results.map((r) => [r.index, r.relevance_score]))
    const ranked: Reranked<T>[] = chunks
      .map((c, i) => ({
        ...c,
        _rerankScore: scoreByIndex.get(i) ?? 0,
        _rerankIndex: i
      }))
      .filter((c) => c._rerankScore >= minScore)
      .sort((a, b) => b._rerankScore - a._rerankScore)
      .slice(0, topN)

    return ranked
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}

async function rerankWithEmbeddings<T extends RerankChunk>(
  chunks: T[],
  query: string,
  topN: number,
  minScore: number
): Promise<Reranked<T>[]> {
  const queryVec = await getEmbedding(query, { model: FALLBACK_MODEL })
  if (!queryVec) throw new Error('Failed to get query embedding')

  const chunkTexts = chunks.map((c) => (c.text || c.content || '').slice(0, 2000))
  const chunkVecs = await Promise.all(
    chunkTexts.map((t) => (t ? getEmbedding(t, { model: FALLBACK_MODEL }).catch(() => null) : null))
  )

  const scored: Reranked<T>[] = chunks
    .map((c, i) => {
      const sim = chunkVecs[i] ? cosineSimilarity(queryVec, chunkVecs[i]!) : 0
      return { ...c, _rerankScore: sim, _rerankIndex: i }
    })
    .filter((c) => c._rerankScore >= minScore)
    .sort((a, b) => b._rerankScore - a._rerankScore)

  return scored.slice(0, topN)
}
