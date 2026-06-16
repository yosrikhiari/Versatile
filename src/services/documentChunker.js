import { computeSemanticChunks } from '../composables/useSemanticChunking'
import { EMBEDDING_DEFAULTS } from '../config/ai'

function yieldToMain() {
  return new Promise(r => setTimeout(r, 0))
}

const HYPHEN_RE = /(\w)-\s*\n\s*/g
const HEADING_RE = /^(#{1,6}\s+|[\w\s]{2,50}\n[=\-]+\s*$)/gm

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','as',
  'is','was','were','are','be','been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','shall','can','need','dare','ought','used',
  'this','that','these','those','it','its','they','them','their','he','she','him','her',
  'we','us','our','you','your','i','me','my','not','no','nor','so','if','than','then',
  'also','very','just','about','up','out','over','into','through','during','before',
  'after','above','below','between','under','again','further','once','here','there',
  'when','where','why','how','all','each','every','both','few','more','most','other',
  'some','such','only','own','same','too','very','what','which','who','whom','because',
  'until','while','within','without','though','although','like','well','back','still'
])

function extractTags(text, maxTags = 10) {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || []
  const freq = {}
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue
    freq[w] = (freq[w] || 0) + 1
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)
    .slice(0, maxTags)
    .map(([word]) => word)
}

function normalizeText(text) {
  return text.replace(HYPHEN_RE, '$1')
}

async function detectHeadings(text) {
  const headings = []
  let match
  let iter = 0
  while ((match = HEADING_RE.exec(text)) !== null) {
    if (++iter % 1000 === 0) await yieldToMain()
    headings.push({ index: match.index, text: match[0].trim() })
  }
  return headings
}

export async function chunkDocument(text, options = {}) {
  const normalized = normalizeText(text)
  const headings = await detectHeadings(normalized)

  const chunks = await computeSemanticChunks(normalized, {
    threshold: options.threshold ?? EMBEDDING_DEFAULTS.threshold,
    maxChunkSize: options.maxChunkSize ?? 1500
  })

  const allTags = new Set()
  const result = chunks.map((chunk, index) => {
    const heading = headings.find(h =>
      chunk.text.startsWith(h.text) ||
      normalized.indexOf(h.text) <= normalized.indexOf(chunk.text)
    )
    const tags = extractTags(chunk.text)
    for (const t of tags) allTags.add(t)
    return {
      text: chunk.text,
      chunkIndex: index,
      heading: heading?.text || null,
      sentenceCount: chunk.sentences.length,
      charCount: chunk.text.length,
      tokenEstimate: Math.ceil(chunk.text.length / 4),
      tags
    }
  })

  result.documentTags = [...allTags].slice(0, 20)
  return result
}
