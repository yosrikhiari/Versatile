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

const VERB_SUFFIXES = ['ed', 'ing', 'tion', 's', 'es', 'ize', 'ify', 'en', 'ate']

function isLikelyVerb(word) {
  const v = word.toLowerCase()
  if (v.length <= 4) return false
  return VERB_SUFFIXES.some(s => v.endsWith(s))
}

function extractTags(text, maxTags = 10) {
  const tokens = text.toLowerCase().match(/[a-z]{3,}/g) || []
  const bigrams = []
  for (let i = 0; i < tokens.length - 1; i++) {
    const w1 = tokens[i], w2 = tokens[i + 1]
    if (!STOP_WORDS.has(w1) && !STOP_WORDS.has(w2)) {
      bigrams.push(w1 + ' ' + w2)
    }
  }

  const unigramFreq = {}
  for (const w of tokens) {
    if (STOP_WORDS.has(w)) continue
    unigramFreq[w] = (unigramFreq[w] || 0) + 1
  }

  const bigramFreq = {}
  for (const b of bigrams) {
    bigramFreq[b] = (bigramFreq[b] || 0) + 1
  }

  const unigramScore = (word, freq) => {
    if (isLikelyVerb(word)) return 0
    const tf = freq / Math.sqrt(tokens.length)
    const specificity = Math.log(word.length + 1)
    return tf * specificity * 100
  }

  const bigramScore = (phrase, freq) => {
    if (freq < 2) return 0
    const tf = freq / Math.sqrt(bigrams.length + 1)
    const specificity = Math.log(phrase.length + 1) * 1.5
    return tf * specificity * 100
  }

  const scored = []

  for (const [word, freq] of Object.entries(unigramFreq)) {
    const score = unigramScore(word, freq)
    if (score > 0) scored.push({ label: word, score })
  }

  for (const [phrase, freq] of Object.entries(bigramFreq)) {
    const score = bigramScore(phrase, freq)
    if (score > 0) scored.push({ label: phrase, score })
  }

  scored.sort((a, b) => b.score - a.score)

  const seen = new Set()
  return scored
    .filter(t => {
      const key = t.label.replace(/\s+/g, ' ')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxTags)
    .map(t => t.label)
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

const MAX_SAFE_CHUNK_SIZE = 300000

export async function chunkDocument(text, options = {}) {
  const onProgress = options.onProgress || (() => {})

  if (text.length > MAX_SAFE_CHUNK_SIZE * 3) {
    const segments = preSplitText(text, MAX_SAFE_CHUNK_SIZE)
    const allChunks = []
    const allDocTags = new Set()
    for (let s = 0; s < segments.length; s++) {
      onProgress(`Part ${s + 1}/${segments.length}`)
      const segChunks = await chunkDocument(segments[s], {
        ...options,
        onProgress: (msg) => onProgress(`Part ${s + 1}/${segments.length}: ${msg}`)
      })
      const docTags = segChunks.documentTags || []
      for (const t of docTags) allDocTags.add(t)
      for (const c of segChunks) {
        c.chunkIndex = allChunks.length + segChunks.indexOf(c)
        allChunks.push(c)
      }
      await yieldToMain()
    }
    allChunks.documentTags = [...allDocTags].slice(0, 20)
    return allChunks
  }

  const normalized = normalizeText(text)
  const headings = await detectHeadings(normalized)

  const chunks = await computeSemanticChunks(normalized, {
    threshold: options.threshold ?? EMBEDDING_DEFAULTS.threshold,
    maxChunkSize: options.maxChunkSize ?? 1500
  })

  const allTags = new Set()
  const result = []
  for (let index = 0; index < chunks.length; index++) {
    if (index % 10 === 0) await yieldToMain()
    const chunk = chunks[index]
    const heading = headings.find(h =>
      chunk.text.startsWith(h.text) ||
      normalized.indexOf(h.text) <= normalized.indexOf(chunk.text)
    )
    const tags = extractTags(chunk.text)
    for (const t of tags) allTags.add(t)
    result.push({
      text: chunk.text,
      chunkIndex: index,
      heading: heading?.text || null,
      sentenceCount: chunk.sentences.length,
      charCount: chunk.text.length,
      tokenEstimate: Math.ceil(chunk.text.length / 4),
      tags
    })
    onProgress(`Chunk ${index + 1}/${chunks.length}`)
  }

  result.documentTags = [...allTags].slice(0, 20)
  return result
}

function preSplitText(text, maxSize) {
  const parts = text.split(/(?<=\n\n)/)
  if (parts.length <= 1) {
    return [text.slice(0, maxSize)]
  }
  const segments = []
  let current = ''
  for (const part of parts) {
    if (current.length + part.length > maxSize && current.length > 0) {
      segments.push(current)
      current = part
    } else {
      current += part
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}
