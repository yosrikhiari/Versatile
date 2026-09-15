export function buildBetaReport({
  factLedger,
  contradictions,
  arc,
  repetitions
}: {
  factLedger: any
  contradictions: any[]
  arc: any
  repetitions: any[]
}) {
  const allResults = [
    ...contradictions.map((r: any) => ({ ...r, pass: 'contradictions' })),
    ...(arc?.all || []),
    ...repetitions.map((r: any) => ({ ...r, pass: 'repetition' }))
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
    orphanedSetups: arc?.setupPayoffs?.filter((s: any) => s.status !== 'paid_off')?.length || 0,
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

/** "dropped_thread" -> "Dropped thread": the category is shown to the writer. */
export function humanizeCategory(key: any): string {
  const k = String(key || '')
    .replace(/_/g, ' ')
    .trim()
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : ''
}

/** The scan summary as one line of prose; the object itself was being rendered as JSON. */
export function summarySentence(summary: any): string {
  if (!summary) return ''
  if (typeof summary === 'string') return summary
  const n = (v: any) => Number(v) || 0
  const scenes = n(summary.totalScenes)
  const parts = [
    `${scenes} ${scenes === 1 ? 'scene' : 'scenes'} read`,
    `${n(summary.contradictionsFound)} ${n(summary.contradictionsFound) === 1 ? 'contradiction' : 'contradictions'}`,
    `${n(summary.droppedThreadsFound)} dropped ${n(summary.droppedThreadsFound) === 1 ? 'thread' : 'threads'}`,
    `${n(summary.orphanedSetups)} unpaid ${n(summary.orphanedSetups) === 1 ? 'setup' : 'setups'}`,
    `${n(summary.repetitionsFound)} ${n(summary.repetitionsFound) === 1 ? 'repetition' : 'repetitions'}`
  ]
  return parts.join(' · ')
}
