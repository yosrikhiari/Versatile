import { getEmbedding } from './embeddingService'
import { semanticSearch, searchLexical, getAllResearchDocuments } from './researchDb'
import { rerankChunks } from './rerankingService'

const MAX_CHUNKS_PER_SOURCE = 5
const MAX_TOTAL_CHARS = 4000
const SEMANTIC_MIN_SCORE = 0.45
const LEXICAL_MIN_SCORE = 0.15
const RRF_K = 60

interface RetrievalQuery {
  query: string
}

// A type alias, not an interface: only aliases get an implicit index signature,
// which is what lets these pass to rerankChunks' `RerankChunk` constraint.
type BaseChunk = {
  id: string
  text?: string
  content?: string
  documentId: string
  heading?: string
  documentTitle?: string
  _score?: number
}

interface FusedEntry {
  chunk: BaseChunk
  score: number
}

interface MultiHopOptions {
  queries: (string | RetrievalQuery)[]
  projectId: string
  topK?: number
  rerank?: boolean
}

export async function multiHopRetrieval({
  queries,
  projectId,
  topK = MAX_CHUNKS_PER_SOURCE,
  rerank = false
}: MultiHopOptions): Promise<BaseChunk[]> {
  if (!projectId) return []
  if (!queries || queries.length === 0) return []

  const queryTexts = queries.map((q) => (typeof q === 'string' ? q : q.query)).filter(Boolean)
  if (queryTexts.length === 0) return []

  const fusion = new Map<string, FusedEntry>()
  const fuseRanked = (list: BaseChunk[]): void => {
    list.forEach((chunk, rank) => {
      const key = chunk.id
      const contribution = 1 / (RRF_K + rank + 1)
      const existing = fusion.get(key)
      if (existing) existing.score += contribution
      else fusion.set(key, { chunk, score: contribution })
    })
  }

  for (const text of queryTexts) {
    const lexical = await searchLexical(projectId, text, topK)
    fuseRanked(lexical.filter((c: BaseChunk) => c._score! >= LEXICAL_MIN_SCORE))

    let embedding: Float32Array | null = null
    try {
      embedding = await getEmbedding(text)
    } catch {
      embedding = null
    }
    if (embedding) {
      const semantic = await semanticSearch(projectId, embedding, topK)
      fuseRanked(semantic.filter((c: BaseChunk) => c._score! >= SEMANTIC_MIN_SCORE))
    }
  }

  let fused: BaseChunk[] = [...fusion.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({ ...chunk, _score: score }))

  if (rerank && fused.length > 0) {
    fused = await rerankChunks({
      chunks: fused,
      query: queryTexts.join(' '),
      topN: topK
    })
  }

  let totalChars = 0
  const deduped: BaseChunk[] = []
  for (const r of fused) {
    const text = r.text || r.content || ''
    if (totalChars + text.length > MAX_TOTAL_CHARS) break
    deduped.push(r)
    totalChars += text.length
  }

  if (deduped.length > 0) {
    try {
      const docs = await getAllResearchDocuments(projectId)
      const titleById = new Map<string, string | undefined>(
        docs.map(
          (d: { id: string; title?: string; fileName?: string; name?: string }) =>
            [d.id, d.title || d.fileName || d.name] as const
        )
      )
      for (const r of deduped) {
        r.documentTitle = titleById.get(r.documentId) || r.heading || r.documentTitle
      }
    } catch {
      // Title enrichment is best-effort
    }
  }

  return deduped
}
