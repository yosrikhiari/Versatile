import { getEmbedding } from './embeddingService'
import { semanticSearch, searchLexical, getAllResearchDocuments } from './researchDb'

const MAX_CHUNKS_PER_SOURCE = 5
const MAX_TOTAL_CHARS = 4000
const SEMANTIC_MIN_SCORE = 0.45
const LEXICAL_MIN_SCORE = 0.15

export async function multiHopRetrieval({ queries, projectId, topK = MAX_CHUNKS_PER_SOURCE }) {
  if (!projectId) return []
  if (!queries || queries.length === 0) return []

  const queryTexts = queries.map((q) => (typeof q === 'string' ? q : q.query)).filter(Boolean)
  if (queryTexts.length === 0) return []

  const allResults = new Map()

  for (const text of queryTexts) {
    let embedding
    try {
      embedding = await getEmbedding(text)
    } catch {
      embedding = null
    }

    const lexical = await searchLexical(projectId, text, topK)

    const scored = lexical
      .filter((c) => c._score >= LEXICAL_MIN_SCORE)
      .map((c) => ({ ...c, _score: c._score * 0.8 }))

    if (embedding) {
      const semantic = await semanticSearch(projectId, embedding, topK)
      for (const s of semantic) {
        const key = s.id
        if (!allResults.has(key) || allResults.get(key)._score < s._score) {
          allResults.set(key, { ...s, _score: s._score >= SEMANTIC_MIN_SCORE ? s._score : 0 })
        }
      }
    }

    for (const s of scored) {
      const key = s.id
      if (!allResults.has(key) || allResults.get(key)._score < s._score) {
        allResults.set(key, s)
      }
    }
  }

  const fused = [...allResults.values()]
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK)

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
