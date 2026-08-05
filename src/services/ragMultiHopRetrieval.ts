import { getEmbedding } from './embeddingService'
import { semanticSearch, searchLexical, getAllResearchDocuments } from './researchDb'
import { rerankChunks } from './rerankingService'
import { estimateTokens } from './ai/contextBudget'

const MAX_CHUNKS_PER_SOURCE = 5
// Was MAX_TOTAL_CHARS = 4000, i.e. ~1000 tokens under the old 4:1 guess.
// Retrieved chunks are the worst case for that guess: research documents carry
// tables, code, and proper nouns that tokenize far denser than prose, so a
// character cap silently admitted more context than it claimed to.
const MAX_TOTAL_TOKENS = 1000
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
  /**
   * Restrict retrieval to these research documents. Empty/omitted means "every
   * document in the project" — the same contract the story director uses, so the
   * generator's source picker means the same thing at plan time and write time.
   */
  documentIds?: (string | number)[]
}

export async function multiHopRetrieval({
  queries,
  projectId,
  topK = MAX_CHUNKS_PER_SOURCE,
  rerank = false,
  documentIds
}: MultiHopOptions): Promise<BaseChunk[]> {
  if (!projectId) return []
  if (!queries || queries.length === 0) return []

  const queryTexts = queries.map((q) => (typeof q === 'string' ? q : q.query)).filter(Boolean)
  if (queryTexts.length === 0) return []

  const scopeIds =
    Array.isArray(documentIds) && documentIds.length ? new Set(documentIds.map(String)) : null
  // Scoping throws away results *after* the search ranked them, so ask for more
  // when it is on — otherwise a project with one selected source out of ten
  // retrieves nothing at all.
  const searchK = scopeIds ? topK * 5 : topK
  const inScope = (list: BaseChunk[]): BaseChunk[] =>
    scopeIds ? list.filter((c) => scopeIds.has(String(c.documentId))) : list

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
    const lexical = await searchLexical(projectId, text, searchK)
    fuseRanked(inScope(lexical.filter((c: BaseChunk) => c._score! >= LEXICAL_MIN_SCORE)))

    let embedding: Float32Array | null = null
    try {
      embedding = await getEmbedding(text)
    } catch {
      embedding = null
    }
    if (embedding) {
      const semantic = await semanticSearch(projectId, embedding, searchK)
      fuseRanked(inScope(semantic.filter((c: BaseChunk) => c._score! >= SEMANTIC_MIN_SCORE)))
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

  let totalTokens = 0
  const deduped: BaseChunk[] = []
  for (const r of fused) {
    const text = r.text || r.content || ''
    const tokens = estimateTokens(text)
    if (totalTokens + tokens > MAX_TOTAL_TOKENS) break
    deduped.push(r)
    totalTokens += tokens
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
