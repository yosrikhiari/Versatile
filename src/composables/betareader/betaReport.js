export function buildBetaReport({ factLedger, contradictions, arc, repetitions }) {
  const allResults = [
    ...contradictions.map((r) => ({ ...r, pass: 'contradictions' })),
    ...(arc?.all || []),
    ...repetitions.map((r) => ({ ...r, pass: 'repetition' }))
  ]

  const counts = {
    errors: allResults.filter((r) => r.severity === 'error').length,
    warnings: allResults.filter((r) => r.severity === 'warning').length,
    info: allResults.filter((r) => r.severity === 'info').length
  }

  const resultsBySeverity = {
    errors: allResults.filter((r) => r.severity === 'error'),
    warnings: allResults.filter((r) => r.severity === 'warning'),
    info: allResults.filter((r) => r.severity === 'info')
  }

  const resultsByPass = {
    contradictions: contradictions,
    pacing: arc?.pacing || [],
    setupPayoffs: arc?.setupPayoffs || [],
    droppedThreads: arc?.droppedThreads || [],
    repetition: repetitions
  }

  const summary = {
    totalScenes: factLedger?.length || 0,
    contradictionsFound: contradictions.length,
    droppedThreadsFound: arc?.droppedThreads?.length || 0,
    orphanedSetups: arc?.setupPayoffs?.filter((s) => s.status !== 'paid_off')?.length || 0,
    repetitionsFound: repetitions.length
  }

  return {
    allResults,
    counts,
    resultsBySeverity,
    resultsByPass,
    summary,
    factLedger
  }
}
