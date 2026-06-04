import { cosineSimilarity } from '../services/ollamaService'
import { getEmbeddings } from '../services/embeddingService'
import { useSettingsStore } from '../stores/settingsStore'
import { EMBEDDING_DEFAULTS } from '../config/ai'

const ABBREVIATIONS = new Set([
  'dr', 'mr', 'ms', 'mrs', 'jr', 'sr', 'st', 'ave', 'blvd', 'rd',
  'etc', 'vs', 'inc', 'ltd', 'co', 'dept', 'est', 'govt',
  'e.g', 'i.e', 'al', 'ch', 'vol', 'no', 'pp', 'pg',
  'prof', 'sr', 'gen', 'col', 'maj', 'capt', 'lt', 'sgt',
  'univ', 'assn', 'bros', 'corp'
])

export function splitSentences(text) {
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
    merged.at(-1).sentences = [
      ...merged.at(-1).sentences,
      ...last.sentences
    ]
    merged.at(-1).endIdx = last.endIdx
  }

  return merged
}

export async function computeSemanticChunks(text, options = {}) {
  const store = useSettingsStore()
  const threshold = options.threshold ?? store.embeddingThreshold ?? EMBEDDING_DEFAULTS.threshold
  const maxChunkSize = options.maxChunkSize ?? 3500
  const embeddingProvider = options.embeddingProvider || store.embeddingProvider
  const embeddingModel = options.embeddingModel || store.embeddingModel || EMBEDDING_DEFAULTS.model

  const sentences = splitSentences(text)
  if (sentences.length <= 1) {
    return [{ text: text, sentences: [...sentences], startIdx: 0, endIdx: 0 }]
  }

  const embeddings = await getEmbeddings(sentences, {
    provider: embeddingProvider,
    model: embeddingModel
  })

  let chunks = computeChunksForSentences(sentences, embeddings, threshold)

  const result = []
  for (const chunk of chunks) {
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

  const embeddings = await getEmbeddings(sentences, { provider, model })
  const subChunks = computeChunksForSentences(sentences, embeddings, threshold)

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
