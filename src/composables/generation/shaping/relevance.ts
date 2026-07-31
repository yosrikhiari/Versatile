import type { RelevanceIndex } from './semanticRelevance'

/**
 * Order entities so the most useful ones survive the per-type slice.
 *
 * When a `RelevanceIndex` is supplied, entities are ranked by semantic
 * closeness to the scene being generated. Without one — or for entities the
 * index has no score for — this falls back to the original heuristic: recency
 * for characters and locations, timeline position for plot threads.
 *
 * The fallback is not a degraded path. Embeddings are optional infrastructure,
 * and `buildRelevanceIndex` deliberately returns null whenever the scores are
 * too uniform to be informative.
 */
export function sortByRelevance(entities: any, type: any, index?: RelevanceIndex | null) {
  const list = [...(entities || [])]

  if (index) {
    const scored = list.map((entity) => ({ entity, score: index.scoreFor(entity, type) }))

    // Entities the index could not score keep their heuristic ordering among
    // themselves, and sort below everything that did get a score.
    const withScore = scored.filter((s) => s.score !== null)
    const withoutScore = scored.filter((s) => s.score === null).map((s) => s.entity)

    if (withScore.length > 0) {
      withScore.sort((a, b) => (b.score as number) - (a.score as number))
      return [...withScore.map((s) => s.entity), ...heuristicSort(withoutScore, type)]
    }
  }

  return heuristicSort(list, type)
}

function heuristicSort(entities: any[], type: any) {
  switch (type) {
    case 'plotThread':
      return [...entities].sort((a, b) => (a.timelineOrder ?? 0) - (b.timelineOrder ?? 0))
    case 'character':
    case 'location':
    default:
      return [...entities].sort((a, b) => (b.lastEditedAt ?? 0) - (a.lastEditedAt ?? 0))
  }
}

export { heuristicSort }
