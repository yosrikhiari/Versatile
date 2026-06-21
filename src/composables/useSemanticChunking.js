import { cosineSimilarity } from '../services/ollamaService'
import { getEmbeddings } from '../services/embeddingService'
import { useSettingsStore } from '../stores/settingsStore'
import { EMBEDDING_DEFAULTS } from '../config/ai'

function yieldToMain() {
  return new Promise(r => setTimeout(r, 0))
}

const ABBREVIATIONS = new Set([
  'dr', 'mr', 'ms', 'mrs', 'jr', 'sr', 'st', 'ave', 'blvd', 'rd',
  'etc', 'vs', 'inc', 'ltd', 'co', 'dept', 'est', 'govt',
  'e.g', 'i.e', 'al', 'ch', 'vol', 'no', 'pp', 'pg',
  'prof', 'sr', 'gen', 'col', 'maj', 'capt', 'lt', 'sgt',
  'univ', 'assn', 'bros', 'corp'
])

export async function splitSentences(text) {
  if (!text) return []

  const normalized = text.replaceAll('\r\n', '\n')

  const raw = normalized.split(/(?<=[.!?])\s+|(?<=\n)\s*/)

  const sentences = []
  let buffer = ''
  let iter = 0

  for (const part of raw) {
    if (++iter % 500 === 0) await yieldToMain()

    const trimmed = part.trim()
    if (!trimmed) continue

    if (buffer) {
      buffer += ' ' + trimmed
    } else {
      buffer = trimmed
    }

    const endsWithTerminal = /[.!?]$/.test(buffer)
    if (!endsWithTerminal) continue

    const beforeLastWord = buffer.replace(/\.\s*$/, '').split(/\s+/).pop() || ''
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

async function computeChunksForSentences(sentences, embeddings, threshold) {
  if (sentences.length <= 1) {
    return [{ sentences: [...sentences], startIdx: 0, endIdx: 0 }]
  }

  const breakpoints = [0]

  for (let i = 0; i < sentences.length - 1; i++) {
    if (i % 100 === 0) await yieldToMain()
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
    merged.at(-1).sentences = [
      ...merged.at(-1).sentences,
      ...last.sentences
    ]
    merged.at(-1).endIdx = last.endIdx
  }

  return merged
}

async function sizeBasedChunk(text, maxChunkSize, onProgress = () => {}) {
  let paragraphs = text.split(/\n\s*\n/).filter(p => p.trim())
  if (paragraphs.length <= 1) {
    paragraphs = text.split('\n').filter(p => p.trim())
  }
  if (paragraphs.length <= 1) {
    paragraphs = text.split(/(?<=[.!?])\s+/).filter(p => p.trim())
  }
  if (paragraphs.length <= 1) {
    paragraphs = [text]
  }

  const chunks = []
  let current = []
  let iter = 0

  for (const p of paragraphs) {
    if (++iter % 50 === 0) await yieldToMain()
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
    onProgress(Math.round((i / chunks.length) * 100))
    result.push({
      text: chunks[i],
      sentences: await splitSentences(chunks[i]),
      startIdx: i,
      endIdx: i
    })
  }
  return result
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

async function computeChunksFromParagraphGroups(groups, embeddings, threshold) {
  if (groups.length <= 1) {
    return [{ sentences: [...groups[0].sentences], startIdx: groups[0].startIdx, endIdx: groups[0].endIdx }]
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
    if (i % 50 === 0) await yieldToMain()
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

export async function computeSemanticChunks(text, options = {}) {
  const store = useSettingsStore()
  const threshold = options.threshold ?? store.embeddingThreshold ?? EMBEDDING_DEFAULTS.threshold
  const maxChunkSize = options.maxChunkSize ?? 3500
  const embeddingProvider = options.embeddingProvider || store.embeddingProvider
  const embeddingModel = options.embeddingModel || store.embeddingModel || EMBEDDING_DEFAULTS.model
  const onProgress = options.onProgress || (() => {})
  const skipEmbeddings = options.skipEmbeddings === true

  const sentences = await splitSentences(text)
  onProgress(2, 'Splitting sentences...')
  if (sentences.length <= 1) {
    return [{ text: text, sentences: [...sentences], startIdx: 0, endIdx: 0 }]
  }

  const SENTENCE_COUNT = sentences.length

  if (skipEmbeddings || SENTENCE_COUNT > 2000) {
    if (skipEmbeddings) {
      console.info(`Fast mode: size-based chunking for ${SENTENCE_COUNT} sentences`)
    } else {
      console.warn(`Large document (${SENTENCE_COUNT} sentences), using size-based chunking`)
    }
    return await sizeBasedChunk(text, maxChunkSize, onProgress)
  }

  const groupByParagraph = SENTENCE_COUNT >= 12
  let groups = null
  let groupTexts = null

  if (groupByParagraph) {
    groups = groupSentencesByParagraph(sentences, text)
    if (groups.length === 1 && SENTENCE_COUNT > 20) {
      const headingBreaks = findHeadingBreaks(sentences, text)
      if (headingBreaks.length > 1) {
        groups = applyBreaks(sentences, headingBreaks)
      }
    }
    groupTexts = groups.map(g => g.sentences.join(' '))
  }
  onProgress(5, 'Grouping content...')

  let embeddings
  onProgress(10, 'Generating embeddings...')
  try {
    const embedInputs = groupByParagraph ? groupTexts : sentences
    const result = await getEmbeddings(embedInputs, {
      provider: embeddingProvider,
      model: embeddingModel
    })
    embeddings = result.vectors
  } catch (e) {
    console.warn('Embedding failed during chunking, falling back to size-based split:', e.message)
    embeddings = (groupByParagraph ? groupTexts : sentences).map(() => null)
  }

  await yieldToMain()
  onProgress(45, 'Computing chunk boundaries...')

  let chunkGroups
  if (groupByParagraph && groups) {
    chunkGroups = await computeChunksFromParagraphGroups(groups, embeddings, threshold)
  } else {
    chunkGroups = await computeChunksForSentences(sentences, embeddings, threshold)
  }

  const result = []
  onProgress(70, 'Assembling final chunks...')
  for (let ci = 0; ci < chunkGroups.length; ci++) {
    const chunk = chunkGroups[ci]
    onProgress(70 + Math.round((ci / chunkGroups.length) * 25))
    const chunkText = chunk.sentences.join(' ')

    if (chunkText.length > maxChunkSize && chunk.sentences.length > 1) {
      const subChunks = await recursiveSplit(chunk, maxChunkSize, embeddingProvider, embeddingModel, threshold)
      for (const sub of subChunks) {
        result.push({
          text: sub.text,
          sentences: sub.sentences,
          startIdx: sub.startIdx,
          endIdx: sub.endIdx
        })
      }
    } else {
      result.push({
        text: chunkText,
        sentences: chunk.sentences,
        startIdx: chunk.startIdx,
        endIdx: chunk.endIdx
      })
    }
  }

  onProgress(100, 'Chunking complete')
  return result
}

async function recursiveSplit(chunk, maxChars, provider, model, threshold) {
  const { sentences, startIdx } = chunk
  if (sentences.length <= 1 || chunk.sentences.join(' ').length <= maxChars) {
    return [{
      text: chunk.sentences.join(' '),
      sentences: [...sentences],
      startIdx,
      endIdx: chunk.endIdx
    }]
  }

  let embeddings
  try {
    const result = await getEmbeddings(sentences, { provider, model })
    embeddings = result.vectors
  } catch (e) {
    console.warn('Embedding failed during recursive split, falling back:', e.message)
    embeddings = sentences.map(() => null)
  }
  const subChunks = await computeChunksForSentences(sentences, embeddings, threshold)

  const result = []
  for (const sub of subChunks) {
    const subText = sub.sentences.join(' ')
    if (subText.length > maxChars && sub.sentences.length > 1) {
      const deeper = await recursiveSplit(sub, maxChars, provider, model, threshold)
      result.push(...deeper)
    } else {
      result.push({
        text: subText,
        sentences: sub.sentences,
        startIdx: startIdx + sub.startIdx,
        endIdx: startIdx + sub.endIdx
      })
    }
  }
  return result
}

export { computeChunksForSentences, mergeSmallChunks }
