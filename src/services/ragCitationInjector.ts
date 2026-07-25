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
  const lines = ['', '---', 'Références:', '']

  for (const chunk of chunks) {
    const text = chunk.text || chunk.content || ''
    if (!text.trim()) continue

    const source = chunk.documentTitle || chunk.heading || chunk.documentId || 'source inconnu'
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
    const title = c.documentTitle || c.heading || c.documentId || 'source inconnu'
    sources.add(title)
  }
  return [...sources].map((s) => `- "${s}"`).join('\n')
}
