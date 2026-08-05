interface Chunk {
  text?: string
  content?: string
  documentTitle?: string
  heading?: string
  documentId?: string
}

export function buildRagCitations(chunks: Chunk[] | null | undefined): string {
  if (!chunks || chunks.length === 0) return ''

  const seen = new Set()
  // English, and explicit about what the model is looking at. These lines used
  // to say "Références:" / "source inconnu" — harmless while nothing consumed
  // this function, but it is now prepended to the scene writer's context, and a
  // stray French header in an otherwise English prompt is exactly the kind of
  // thing a local model echoes back into the prose.
  const lines = [
    '',
    '---',
    'RESEARCH (from this project\'s imported sources — treat as factual; do not contradict):',
    ''
  ]

  for (const chunk of chunks) {
    const text = chunk.text || chunk.content || ''
    if (!text.trim()) continue

    const source = chunk.documentTitle || chunk.heading || chunk.documentId || 'unknown source'
    const key = `${source}::${text.slice(0, 80)}`
    if (seen.has(key)) continue
    seen.add(key)

    const snippet = text.trim().slice(0, 300)
    lines.push(`[source:${source}] ${snippet}`)
  }

  if (lines.length <= 3) return ''
  return lines.join('\n')
}

export const formatCitationContext = buildRagCitations

export function getCitationSummary(chunks: Chunk[] | null | undefined): string {
  if (!chunks || chunks.length === 0) return ''
  const sources = new Set()
  for (const c of chunks) {
    const title = c.documentTitle || c.heading || c.documentId || 'unknown source'
    sources.add(title)
  }
  return [...sources].map((s) => `- "${s}"`).join('\n')
}
