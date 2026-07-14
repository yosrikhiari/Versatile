import { getEmbedding } from './embeddingService'
import { semanticSearch, searchLexical, getAllResearchDocuments } from './researchDb'

const MAX_CHUNKS_PER_SOURCE = 5
const MAX_TOTAL_CHARS = 4000
const SEMANTIC_MIN_SCORE = 0.45
const LEXICAL_MIN_SCORE = 0.15
// Reciprocal Rank Fusion constant. 60 is the standard value from the original
// RRF paper — it damps the contribution of low-ranked items without letting the
// top rank dominate.
const RRF_K = 60

export async function multiHopRetrieval({ queries, projectId, topK = MAX_CHUNKS_PER_SOURCE }) {
  if (!projectId) return []
  if (!queries || queries.length === 0) return []

  const queryTexts = queries.map((q) => (typeof q === 'string' ? q : q.query)).filter(Boolean)
  if (queryTexts.length === 0) return []

  // Reciprocal Rank Fusion. Lexical (BM25, unbounded ~0–10+) and semantic
  // (cosine, 0–1) scores live on incomparable scales, so the old max/weighted
  // merge let lexical almost always dominate — the semantic signal was
  // effectively decorative. RRF discards magnitudes and fuses by *rank* within
  // each list: score = Σ 1/(k + rank) across every ranked list a chunk appears
  // in, so lexical and semantic contribute symmetrically.
  const fusion = new Map() // id -> { chunk, score }
  const fuseRanked = (list) => {
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
    fuseRanked(lexical.filter((c) => c._score >= LEXICAL_MIN_SCORE))

    let embedding = null
    try {
      embedding = await getEmbedding(text)
    } catch {
      embedding = null
    }
    if (embedding) {
      const semantic = await semanticSearch(projectId, embedding, topK)
      fuseRanked(semantic.filter((c) => c._score >= SEMANTIC_MIN_SCORE))
    }
  }

  const fused = [...fusion.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk, score }) => ({ ...chunk, _score: score }))

  let totalChars = 0
  const deduped = []
  for (const r of fused) {
    const text = r.text || r.content || ''
    if (totalChars + text.length > MAX_TOTAL_CHARS) break
    deduped.push(r)
    totalChars += text.length
  }

  // Attach a human-readable source title so citations show the document name /
  // section heading instead of a bare numeric documentId. Documents (not chunks)
  // are few, so a single lookup keyed by id is cheap.
  if (deduped.length > 0) {
    try {
      const docs = await getAllResearchDocuments(projectId)
      const titleById = new Map(docs.map((d) => [d.id, d.title || d.fileName || d.name]))
      for (const r of deduped) {
        r.documentTitle = titleById.get(r.documentId) || r.heading || r.documentTitle
      }
    } catch {
      // Title enrichment is best-effort; fall back to whatever label the chunk has.
    }
  }

  return deduped
}
