const ABBREVIATIONS = new Set([
  'dr',
  'mr',
  'ms',
  'mrs',
  'jr',
  'sr',
  'st',
  'ave',
  'blvd',
  'rd',
  'etc',
  'vs',
  'inc',
  'ltd',
  'co',
  'dept',
  'est',
  'govt',
  'e.g',
  'i.e',
  'al',
  'ch',
  'vol',
  'no',
  'pp',
  'pg',
  'prof',
  'sr',
  'gen',
  'col',
  'maj',
  'capt',
  'lt',
  'sgt',
  'univ',
  'assn',
  'bros',
  'corp'
])

const HYPHEN_RE = /(\w)-\s*\n\s*/g
const HEADING_RE = /^(#{1,6}\s+|[\w\s]{2,50}\n[=\-]+\s*$)/gm

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'were',
  'are',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'dare',
  'ought',
  'used',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'they',
  'them',
  'their',
  'he',
  'she',
  'him',
  'her',
  'we',
  'us',
  'our',
  'you',
  'your',
  'i',
  'me',
  'my',
  'not',
  'no',
  'nor',
  'so',
  'if',
  'than',
  'then',
  'also',
  'very',
  'just',
  'about',
  'up',
  'out',
  'over',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'between',
  'under',
  'again',
  'further',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'own',
  'same',
  'too',
  'very',
  'what',
  'which',
  'who',
  'whom',
  'because',
  'until',
  'while',
  'within',
  'without',
  'though',
  'although',
  'like',
  'well',
  'back',
  'still'
])

const VERB_SUFFIXES = ['ed', 'ing', 'tion', 's', 'es', 'ize', 'ify', 'en', 'ate']

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dotProduct = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

function isLikelyVerb(word) {
  const v = word.toLowerCase()
  if (v.length <= 4) return false
  return VERB_SUFFIXES.some((s) => v.endsWith(s))
}

function normalizeText(text) {
  return text.replace(HYPHEN_RE, '$1')
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

function detectHeadings(text) {
  const headings = []
  let match
  while ((match = HEADING_RE.exec(text)) !== null) {
    headings.push({ index: match.index, text: match[0].trim() })
  }
  return headings
}

function extractTags(text, maxTags = 10) {
  const tokens = text.toLowerCase().match(/[a-z]{3,}/g) || []

  const bigrams = []
  for (let i = 0; i < tokens.length - 1; i++) {
    const w1 = tokens[i],
      w2 = tokens[i + 1]
    if (!STOP_WORDS.has(w1) && !STOP_WORDS.has(w2)) {
      bigrams.push(w1 + ' ' + w2)
    }
  }

  const unigramFreq = {}
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i]
    if (STOP_WORDS.has(w)) continue
    unigramFreq[w] = (unigramFreq[w] || 0) + 1
  }

  const bigramFreq = {}
  for (let i = 0; i < bigrams.length; i++) {
    bigramFreq[bigrams[i]] = (bigramFreq[bigrams[i]] || 0) + 1
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

  const unigramEntries = Object.entries(unigramFreq)
  for (let i = 0; i < unigramEntries.length; i++) {
    const [word, freq] = unigramEntries[i]
    const score = unigramScore(word, freq)
    if (score > 0) scored.push({ label: word, score })
  }

  const bigramEntries = Object.entries(bigramFreq)
  for (let i = 0; i < bigramEntries.length; i++) {
    const [phrase, freq] = bigramEntries[i]
    const score = bigramScore(phrase, freq)
    if (score > 0) scored.push({ label: phrase, score })
  }

  scored.sort((a, b) => b.score - a.score)

  const seen = new Set()
  return scored
    .filter((t) => {
      const key = t.label.replace(/\s+/g, ' ')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxTags)
    .map((t) => t.label)
}

function splitSentences(text) {
  if (!text) return []

  const normalized = text.replaceAll('\r\n', '\n')
  const raw = normalized.split(/(?<=[.!?])\s+|(?<=\n)\s*/)

  const sentences = []
  let buffer = ''

  for (const part of raw) {
    const trimmed = part.trim()
    if (!trimmed) continue

    if (buffer) {
      buffer += ' ' + trimmed
    } else {
      buffer = trimmed
    }

    const endsWithTerminal = /[.!?]$/.test(buffer)
    if (!endsWithTerminal) continue

    const beforeLastWord =
      buffer
        .replace(/\.\s*$/, '')
        .split(/\s+/)
        .pop() || ''
    const lower = beforeLastWord.toLowerCase().replace(/\.$/, '')
    if (ABBREVIATIONS.has(lower)) continue

    sentences.push(buffer)
    buffer = ''
  }

  if (buffer.trim()) {
    sentences.push(buffer.trim())
  }

  return sentences
}

function computeChunksForSentences(sentences, embeddings, threshold) {
  if (sentences.length <= 1) {
    return [{ sentences: [...sentences], startIdx: 0, endIdx: 0 }]
  }

  const breakpoints = [0]

  for (let i = 0; i < sentences.length - 1; i++) {
    const embA = embeddings[i]
    const embB = embeddings[i + 1]
    if (!embA || !embB) {
      breakpoints.push(i + 1)
      continue
    }
    const sim = cosineSimilarity(embA, embB)
    if (sim < threshold) {
      breakpoints.push(i + 1)
    }
  }

  const chunks = []
  for (let i = 0; i < breakpoints.length; i++) {
    const start = breakpoints[i]
    const end = i < breakpoints.length - 1 ? breakpoints[i + 1] - 1 : sentences.length - 1
    if (start > end) continue
    const chunkSentences = sentences.slice(start, end + 1)
    chunks.push({
      sentences: chunkSentences,
      startIdx: start,
      endIdx: end
    })
  }

  return mergeSmallChunks(chunks, 2)
}

function mergeSmallChunks(chunks, minSentences) {
  if (chunks.length <= 1) return chunks

  const merged = []
  let current = { ...chunks[0] }

  for (let i = 1; i < chunks.length; i++) {
    if (current.sentences.length < minSentences) {
      current.sentences = [...current.sentences, ...chunks[i].sentences]
      current.endIdx = chunks[i].endIdx
    } else {
      merged.push(current)
      current = { ...chunks[i] }
    }
  }
  merged.push(current)

  if (merged.length > 1 && merged.at(-1).sentences.length < minSentences) {
    const last = merged.pop()
    merged.at(-1).sentences = [...merged.at(-1).sentences, ...last.sentences]
    merged.at(-1).endIdx = last.endIdx
  }

  return merged
}

function groupSentencesByParagraph(sentences, text) {
  const paraBreaks = []
  paraBreaks.push(0)
  for (let i = 1; i < sentences.length; i++) {
    const prevEnd = text.indexOf(sentences[i - 1]) + sentences[i - 1].length
    const curStart = text.indexOf(sentences[i], prevEnd)
    if (curStart === -1 || prevEnd === -1) continue
    const between = text.slice(prevEnd, curStart)
    if (/^\s*\n\s*\n/.test(between)) {
      paraBreaks.push(i)
    }
  }
  paraBreaks.push(sentences.length)

  const groups = []
  for (let i = 0; i < paraBreaks.length - 1; i++) {
    const start = paraBreaks[i]
    const end = paraBreaks[i + 1]
    if (start >= end) continue
    groups.push({
      sentences: sentences.slice(start, end),
      startIdx: start,
      endIdx: end - 1
    })
  }
  return groups
}

function findHeadingBreaks(sentences, text) {
  const breaks = [0]
  const headingPattern = /^#{1,6}\s+|^[-=]+\s*$/m
  for (let i = 1; i < sentences.length; i++) {
    const prevEnd = text.indexOf(sentences[i - 1]) + sentences[i - 1].length
    const curStart = text.indexOf(sentences[i], prevEnd)
    if (curStart === -1 || prevEnd === -1) continue
    const between = text.slice(prevEnd, curStart)
    if (headingPattern.test(between) || /\n[-=]+\s*$/.test(between)) {
      breaks.push(i)
    }
  }
  breaks.push(sentences.length)
  return breaks
}

function applyBreaks(sentences, breaks) {
  const groups = []
  for (let i = 0; i < breaks.length - 1; i++) {
    const start = breaks[i]
    const end = breaks[i + 1]
    if (start >= end) continue
    groups.push({
      sentences: sentences.slice(start, end),
      startIdx: start,
      endIdx: end - 1
    })
  }
  return groups
}

function computeChunksFromParagraphGroups(groups, embeddings, threshold) {
  if (groups.length <= 1) {
    return [
      {
        sentences: [...groups[0].sentences],
        startIdx: groups[0].startIdx,
        endIdx: groups[0].endIdx
      }
    ]
  }

  const mergeFlags = []
  for (let i = 0; i < groups.length - 1; i++) {
    const embA = embeddings[i]
    const embB = embeddings[i + 1]
    if (!embA || !embB) {
      mergeFlags.push(false)
      continue
    }
    const sim = cosineSimilarity(embA, embB)
    mergeFlags.push(sim >= threshold)
  }

  const chunks = []
  let curSentences = [...groups[0].sentences]
  let curStart = groups[0].startIdx
  let curEnd = groups[0].endIdx

  for (let i = 0; i < mergeFlags.length; i++) {
    if (mergeFlags[i]) {
      curSentences.push(...groups[i + 1].sentences)
      curEnd = groups[i + 1].endIdx
    } else {
      chunks.push({ sentences: curSentences, startIdx: curStart, endIdx: curEnd })
      curSentences = [...groups[i + 1].sentences]
      curStart = groups[i + 1].startIdx
      curEnd = groups[i + 1].endIdx
    }
  }
  chunks.push({ sentences: curSentences, startIdx: curStart, endIdx: curEnd })

  return mergeSmallChunks(chunks, 2)
}

function sizeBasedChunk(text, maxChunkSize) {
  let paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())
  if (paragraphs.length <= 1) {
    paragraphs = text.split('\n').filter((p) => p.trim())
  }
  if (paragraphs.length <= 1) {
    paragraphs = text.split(/(?<=[.!?])\s+/).filter((p) => p.trim())
  }
  if (paragraphs.length <= 1) {
    paragraphs = [text]
  }

  const chunks = []
  let current = []

  for (const p of paragraphs) {
    const pLen = p.length + (current.length > 0 ? 1 : 0)
    if (current.join(' ').length + pLen > maxChunkSize && current.length > 0) {
      chunks.push(current.join(' '))
      current = [p]
    } else {
      current.push(p)
    }
  }
  if (current.length > 0) chunks.push(current.join(' '))

  if (chunks.length === 0) chunks.push(text)

  const result = []
  for (let i = 0; i < chunks.length; i++) {
    result.push({
      text: chunks[i],
      sentences: splitSentences(chunks[i]),
      startIdx: i,
      endIdx: i
    })
  }
  return result
}

const methodMap = {
  normalizeText,
  preSplitText,
  detectHeadings,
  extractTags,
  splitSentences,
  computeChunksForSentences,
  mergeSmallChunks,
  groupSentencesByParagraph,
  findHeadingBreaks,
  applyBreaks,
  computeChunksFromParagraphGroups,
  sizeBasedChunk
}

export { methodMap }

self.onmessage = async function (e) {
  const { id, method, args } = e.data
  try {
    const fn = methodMap[method]
    if (!fn) throw new Error('Unknown worker method: ' + method)
    const result = fn(...args)
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error.message })
  }
}
