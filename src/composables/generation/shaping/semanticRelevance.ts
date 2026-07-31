import { getEmbeddings } from '../../../services/embeddingService'
import { computeCosineSimilarity } from '../../../services/aiResponseCache'

/**
 * Minimum spread between the best and worst entity score for the ranking to be
 * considered informative.
 *
 * When every entity scores about the same, the embedding says nothing useful
 * about which to keep — that is the "similarity is uniform" fallback. Ordering
 * by noise would be strictly worse than the recency heuristic it replaces.
 */
const MIN_SCORE_SPREAD = 0.02

/** Entities are not embedded below this query length — too little signal to rank against. */
const MIN_QUERY_CHARS = 40

/** Cap on entities embedded per call, to bound cost on large story bibles. */
const MAX_ENTITIES_PER_TYPE = 40

export interface RelevanceIndex {
  scoreFor(entity: unknown, type: string): number | null
  readonly size: number
}

/** Stable key for an entity across the embed and lookup passes. */
function entityKey(entity: any, type: string): string {
  const id = entity?.id ?? entity?.name ?? entity?.title ?? ''
  return `${type}:${id}`
}

/**
 * The text an entity is embedded as.
 *
 * Deliberately the same shape the prompt will carry, so relevance is measured
 * against what the model actually sees rather than an internal representation.
 */
function entityText(entity: any): string {
  const parts = [
    entity?.name ?? entity?.title,
    entity?.role,
    entity?.goal,
    entity?.description,
    entity?.notes,
    Array.isArray(entity?.traits) ? entity.traits.join(' ') : entity?.traits
  ]
  return parts.filter(Boolean).join(' — ').slice(0, 600)
}

/**
 * Rank entity blocks by semantic closeness to the scene being generated.
 *
 * Returns `null` — meaning "use the existing heuristic" — when there is no
 * usable query, embeddings are unavailable, or the resulting scores are too
 * uniform to carry information. Callers must treat null as the normal case, not
 * an error: embeddings are optional infrastructure here.
 */
export async function buildRelevanceIndex(options: {
  query: string
  entities: Record<string, any[]>
}): Promise<RelevanceIndex | null> {
  const query = (options.query || '').trim()
  if (query.length < MIN_QUERY_CHARS) return null

  const pairs: Array<{ key: string; text: string }> = []
  for (const [type, list] of Object.entries(options.entities || {})) {
    if (!Array.isArray(list)) continue
    for (const entity of list.slice(0, MAX_ENTITIES_PER_TYPE)) {
      const text = entityText(entity)
      if (text) pairs.push({ key: entityKey(entity, singular(type)), text })
    }
  }

  if (pairs.length === 0) return null

  let vectors: Array<ArrayLike<number> | null>
  try {
    const result = await getEmbeddings([query, ...pairs.map(p => p.text)])
    vectors = result?.vectors ?? []
  } catch {
    // Embeddings are best-effort — never fail a generation over ranking.
    return null
  }

  const queryVector = vectors[0]
  if (!queryVector) return null

  const scores = new Map<string, number>()
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < pairs.length; i++) {
    const vector = vectors[i + 1]
    if (!vector) continue
    const score = computeCosineSimilarity(queryVector, vector)
    scores.set(pairs[i].key, score)
    if (score < min) min = score
    if (score > max) max = score
  }

  if (scores.size === 0) return null
  if (max - min < MIN_SCORE_SPREAD) return null

  return {
    size: scores.size,
    scoreFor(entity: unknown, type: string) {
      const score = scores.get(entityKey(entity, type))
      return score === undefined ? null : score
    }
  }
}

/** `characters` → `character`, so index keys match `sortByRelevance`'s type argument. */
function singular(type: string): string {
  if (type === 'characters') return 'character'
  if (type === 'locations') return 'location'
  if (type === 'plotThreads') return 'plotThread'
  return type
}

export { entityKey, entityText, MIN_SCORE_SPREAD }
