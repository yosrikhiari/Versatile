export function hitRate(results, relevantIds, k = results.length) {
  if (!results.length || !relevantIds.length) return 0
  const topK = results.slice(0, k)
  return topK.some((r) => relevantIds.includes(r.id)) ? 1 : 0
}

export function meanReciprocalRank(results, relevantIds) {
  if (!results.length || !relevantIds.length) return 0
  for (let i = 0; i < results.length; i++) {
    if (relevantIds.includes(results[i].id)) {
      return 1 / (i + 1)
    }
  }
  return 0
}

export function averagePrecision(results, relevantIds) {
  if (!results.length || !relevantIds.length) return 0
  let hits = 0
  let sumPrecision = 0
  for (let i = 0; i < results.length; i++) {
    if (relevantIds.includes(results[i].id)) {
      hits++
      sumPrecision += hits / (i + 1)
    }
  }
  return relevantIds.length > 0 ? sumPrecision / relevantIds.length : 0
}

export function ndcgAtK(results, relevantIds, k = results.length) {
  const topK = results.slice(0, k)
  if (!topK.length || !relevantIds.length) return 0

  let dcg = 0
  for (let i = 0; i < topK.length; i++) {
    const rel = relevantIds.includes(topK[i].id) ? 1 : 0
    dcg += rel / Math.log2(i + 2)
  }

  const idealRelevant = Math.min(relevantIds.length, k)
  let idcg = 0
  for (let i = 0; i < idealRelevant; i++) {
    idcg += 1 / Math.log2(i + 2)
  }

  return idcg > 0 ? dcg / idcg : 0
}

export function recallAtK(results, relevantIds, k = results.length) {
  if (!relevantIds.length) return 0
  const topK = results.slice(0, k)
  const retrieved = topK.filter((r) => relevantIds.includes(r.id)).length
  return retrieved / relevantIds.length
}

export function precisionAtK(results, relevantIds, k = results.length) {
  if (!k) return 0
  const topK = results.slice(0, k)
  const relevant = topK.filter((r) => relevantIds.includes(r.id)).length
  return relevant / k
}

export function computeAll(results, relevantIds, opts = {}) {
  const k = opts.k || results.length
  return {
    hitRate: hitRate(results, relevantIds, k),
    mrr: meanReciprocalRank(results, relevantIds),
    map: averagePrecision(results, relevantIds),
    ndcg: ndcgAtK(results, relevantIds, k),
    recall: recallAtK(results, relevantIds, k),
    precision: precisionAtK(results, relevantIds, k),
    resultCount: results.length,
    relevantCount: relevantIds.length,
    k
  }
}
