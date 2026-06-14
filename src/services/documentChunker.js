import { computeSemanticChunks } from '../composables/useSemanticChunking'
import { EMBEDDING_DEFAULTS } from '../config/ai'

const HYPHEN_RE = /(\w)-\s*\n\s*/g
const HEADING_RE = /^(#{1,6}\s+|[\w\s]{2,50}\n[=\-]+\s*$)/gm

function normalizeText(text) {
  return text.replace(HYPHEN_RE, '$1')
}

function detectHeadings(text) {
  const headings = []
  let match
  while ((match = HEADING_RE.exec(text)) !== null) {
    headings.push({ index: match.index, text: match[0].trim() })
  }
  return headings
}

export async function chunkDocument(text, options = {}) {
  const normalized = normalizeText(text)
  const headings = detectHeadings(normalized)

  const chunks = await computeSemanticChunks(normalized, {
    threshold: options.threshold ?? EMBEDDING_DEFAULTS.threshold,
    maxChunkSize: options.maxChunkSize ?? 3500
  })

  return chunks.map((chunk, index) => {
    const heading = headings.find(h =>
      chunk.text.startsWith(h.text) ||
      normalized.indexOf(h.text) <= normalized.indexOf(chunk.text)
    )
    return {
      text: chunk.text,
      chunkIndex: index,
      heading: heading?.text || null,
      sentenceCount: chunk.sentences.length,
      charCount: chunk.text.length,
      tokenEstimate: Math.ceil(chunk.text.length / 4)
    }
  })
}
