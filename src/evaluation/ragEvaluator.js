import { computeAll } from './ragMetrics'

export function aggregateMetrics(results) {
  const keys = ['hitRate', 'mrr', 'map', 'ndcg', 'recall', 'precision']
  const agg = {}
  for (const key of keys) {
    const values = results.map((r) => r.metrics[key]).filter((v) => v !== undefined)
    agg[`avg${key.charAt(0).toUpperCase() + key.slice(1)}`] = values.length
      ? values.reduce((a, b) => a + b, 0) / values.length
      : 0
  }
  agg.totalQueries = results.length
  agg.passedQueries = results.filter((r) => r.metrics.hitRate === 1).length
  agg.passRate = results.length ? agg.passedQueries / results.length : 0
  return agg
}

export async function runEvaluation({ searchFn, testCases, projectId, k }) {
  const results = []
  for (const tc of testCases) {
    const { query, relevantChunkIds, label } = tc
    const retrieved = await searchFn(query, projectId, { k })
    const metrics = computeAll(retrieved, relevantChunkIds, { k })
    results.push({
      label: label || query,
      query,
      expected: relevantChunkIds.length,
      retrieved: retrieved.length,
      retrievedIds: retrieved.map((r) => r.id),
      metrics
    })
  }
  return {
    results,
    summary: aggregateMetrics(results),
    config: { k }
  }
}

export function formatReport(report) {
  let out = '# RAG Evaluation Report\n\n'
  out += `## Configuration\n- k: ${report.config.k}\n- queries: ${report.summary.totalQueries}\n\n`
  out += '## Summary\n\n'
  out += `| Metric | Value |\n|--------|-------|\n`
  out += `| Pass rate | ${(report.summary.passRate * 100).toFixed(1)}% |\n`
  out += `| Avg hit rate | ${(report.summary.avgHitRate * 100).toFixed(1)}% |\n`
  out += `| Avg MRR | ${report.summary.avgMrr.toFixed(4)} |\n`
  out += `| Avg MAP | ${report.summary.avgMap.toFixed(4)} |\n`
  out += `| Avg NDCG | ${report.summary.avgNdcg.toFixed(4)} |\n`
  out += `| Avg Recall | ${(report.summary.avgRecall * 100).toFixed(1)}% |\n`
  out += `| Avg Precision | ${(report.summary.avgPrecision * 100).toFixed(1)}% |\n\n`
  out += '## Per-Query Results\n\n'
  for (const r of report.results) {
    out += `### ${r.label}\n`
    out += `- Query: "${r.query}"\n`
    out += `- Expected: ${r.expected}, Retrieved: ${r.retrieved}\n`
    out += `- Hit: ${r.metrics.hitRate ? '✓' : '✗'}, MRR: ${r.metrics.mrr.toFixed(3)}, NDCG: ${r.metrics.ndcg.toFixed(3)}\n\n`
  }
  return out
}
