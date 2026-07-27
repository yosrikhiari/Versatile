import { EMBEDDING_DEFAULTS } from '../config/ai'
import { getEmbeddings } from './embeddingService'
import { useSettingsStore } from '../stores/settingsStore'

const MAX_SAFE_CHUNK_SIZE = 300000

interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

interface WorkerMessage {
  id: number
  result?: unknown
  error?: string
}

interface HeadingInfo {
  text: string
  level?: number
}

interface ChunkResult {
  text: string
  sentences: string[]
  startIdx: number
  endIdx: number
  chunkIndex?: number
}

/**
 * The emitted chunk. Deliberately NOT `extends ChunkResult` — the internal
 * `sentences`/`startIdx`/`endIdx` bookkeeping is collapsed into `sentenceCount`
 * and dropped before a chunk leaves this module.
 */
interface DocumentChunk {
  text: string
  chunkIndex: number
  heading: string | null
  sentenceCount: number
  charCount: number
  tokenEstimate: number
  tags: string[]
}

interface ChunkDocumentResult extends Array<DocumentChunk> {
  documentTags?: string[]
}

interface ComputeSemanticOptions {
  threshold?: number
  maxChunkSize?: number
  embeddingProvider?: string
  embeddingModel?: string
  onProgress?: (pct: number, msg?: string) => void
  skipEmbeddings?: boolean
  fastMode?: boolean
}

interface ChunkDocumentOptions {
  threshold?: number
  maxChunkSize?: number
  fastMode?: boolean
  onProgress?: (pct: number, msg?: string) => void
}

let worker: Worker | null = null
let requestId = 0
const pending = new Map<number, PendingEntry>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./documentChunker.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = function (e: MessageEvent<WorkerMessage>) {
      const { id, result, error } = e.data
      const entry = pending.get(id)
      if (!entry) return
      pending.delete(id)
      if (error) entry.reject(new Error(error))
      else entry.resolve(result)
    }
    worker.onerror = function (e: ErrorEvent) {
      console.error('[documentChunker] Worker error:', e.message)
    }
  }
  return worker
}

function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [, entry] of pending) {
      entry.reject(new Error('Worker terminated'))
    }
    pending.clear()
  }
}

let directFns: Record<string, (...args: unknown[]) => unknown> | null = null

async function directCall(method: string, ...args: unknown[]): Promise<unknown> {
  if (!directFns) {
    directFns = (await import('./documentChunker.worker.ts')).methodMap as Record<string, (...args: unknown[]) => unknown>
  }
  const fn = directFns[method]
  if (!fn) throw new Error('Unknown worker method: ' + method)
  return fn(...args)
}

function workerCall(method: string, ...args: unknown[]): Promise<unknown> {
  if (typeof Worker === 'undefined') {
    return directCall(method, ...args)
  }
  return new Promise((resolve, reject) => {
    const id = ++requestId
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, method, args })
  })
}

export async function splitSentences(text: string): Promise<string[]> {
  return workerCall('splitSentences', text) as Promise<string[]>
}

export async function computeChunksForSentences(
  sentences: string[],
  embeddings: (ArrayLike<number> | null)[],
  threshold: number
): Promise<ChunkResult[]> {
  return workerCall('computeChunksForSentences', sentences, embeddings, threshold) as Promise<ChunkResult[]>
}

export async function mergeSmallChunks(chunks: ChunkResult[], minSentences: number): Promise<ChunkResult[]> {
  return workerCall('mergeSmallChunks', chunks, minSentences) as Promise<ChunkResult[]>
}

const CHUNK_OVERLAP_SENTENCES = 1

function addChunkOverlap(chunks: ChunkResult[], overlap = CHUNK_OVERLAP_SENTENCES): ChunkResult[] {
  if (!Array.isArray(chunks) || chunks.length <= 1 || overlap <= 0) return chunks
  return chunks.map((chunk, i) => {
    if (i === 0) return chunk
    const prevSentences = chunks[i - 1].sentences
    if (!Array.isArray(prevSentences) || prevSentences.length === 0) return chunk
    const tail = prevSentences.slice(-overlap).join(' ').trim()
    if (!tail) return chunk
    return { ...chunk, text: `${tail} ${chunk.text}`.trim() }
  })
}

export async function computeSemanticChunks(text: string, options: ComputeSemanticOptions = {}): Promise<ChunkResult[]> {
  const store = useSettingsStore()
  const threshold = options.threshold ?? store.embeddingThreshold ?? EMBEDDING_DEFAULTS.threshold
  const maxChunkSize = options.maxChunkSize ?? 3500
  const embeddingProvider = options.embeddingProvider || store.embeddingProvider
  const embeddingModel = options.embeddingModel || store.embeddingModel || EMBEDDING_DEFAULTS.model
  const onProgress = options.onProgress || (() => {})
  const skipEmbeddings = options.skipEmbeddings === true

  const sentences = await workerCall('splitSentences', text) as string[]
  onProgress(2, 'Splitting sentences...')
  if (sentences.length <= 1) {
    return [{ text, sentences: [...sentences], startIdx: 0, endIdx: 0 }]
  }

  const SENTENCE_COUNT = sentences.length

  if (skipEmbeddings || SENTENCE_COUNT > 2000) {
    if (skipEmbeddings) {
      console.info(`Fast mode: size-based chunking for ${SENTENCE_COUNT} sentences`)
    } else {
      console.warn(`Large document (${SENTENCE_COUNT} sentences), using size-based chunking`)
    }
    return addChunkOverlap(await workerCall('sizeBasedChunk', text, maxChunkSize) as ChunkResult[])
  }

  const groupByParagraph = SENTENCE_COUNT >= 12
  let groups: Array<{ sentences: string[]; startIdx: number; endIdx: number }> | null = null
  let groupTexts: string[] | null = null

  if (groupByParagraph) {
    groups = await workerCall('groupSentencesByParagraph', sentences, text) as Array<{ sentences: string[]; startIdx: number; endIdx: number }>
    if (groups.length === 1 && SENTENCE_COUNT > 20) {
      const headingBreaks = await workerCall('findHeadingBreaks', sentences, text) as number[]
      if (headingBreaks.length > 1) {
        groups = await workerCall('applyBreaks', sentences, headingBreaks) as Array<{ sentences: string[]; startIdx: number; endIdx: number }>
      }
    }
    groupTexts = groups.map((g) => g.sentences.join(' '))
  }
  onProgress(5, 'Grouping content...')

  let embeddings: (ArrayLike<number> | null)[]
  onProgress(10, 'Generating embeddings...')
  try {
    const embedInputs = groupByParagraph ? groupTexts! : sentences
    const result = await getEmbeddings(embedInputs, {
      provider: embeddingProvider,
      model: embeddingModel
    })
    embeddings = result.vectors
  } catch (e: any) {
    console.warn('Embedding failed during chunking, falling back to size-based split:', e.message)
    embeddings = (groupByParagraph ? groupTexts! : sentences).map(() => null)
  }

  onProgress(45, 'Computing chunk boundaries...')

  let chunkGroups: ChunkResult[]
  if (groupByParagraph && groups) {
    chunkGroups = await workerCall(
      'computeChunksFromParagraphGroups',
      groups,
      embeddings,
      threshold
    ) as ChunkResult[]
  } else {
    chunkGroups = await workerCall('computeChunksForSentences', sentences, embeddings, threshold) as ChunkResult[]
  }

  const result: ChunkResult[] = []
  onProgress(70, 'Assembling final chunks...')
  for (let ci = 0; ci < chunkGroups.length; ci++) {
    const chunk = chunkGroups[ci]
    onProgress(70 + Math.round((ci / chunkGroups.length) * 25))
    const chunkText = chunk.sentences.join(' ')

    if (chunkText.length > maxChunkSize && chunk.sentences.length > 1) {
      const subChunks = await recursiveSplit(
        chunk,
        maxChunkSize,
        embeddingProvider,
        embeddingModel,
        threshold
      )
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
  return addChunkOverlap(result)
}

async function recursiveSplit(
  chunk: ChunkResult,
  maxChars: number,
  provider: string,
  model: string,
  threshold: number
): Promise<ChunkResult[]> {
  const { sentences, startIdx } = chunk
  if (sentences.length <= 1 || chunk.sentences.join(' ').length <= maxChars) {
    return [
      {
        text: chunk.sentences.join(' '),
        sentences: [...sentences],
        startIdx,
        endIdx: chunk.endIdx
      }
    ]
  }

  let embeddings: (ArrayLike<number> | null)[]
  try {
    const result = await getEmbeddings(sentences, { provider, model })
    embeddings = result.vectors
  } catch (e: any) {
    console.warn('Embedding failed during recursive split, falling back:', e.message)
    embeddings = sentences.map(() => null)
  }
  const subChunks = await workerCall('computeChunksForSentences', sentences, embeddings, threshold) as ChunkResult[]

  const result: ChunkResult[] = []
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

export async function chunkDocument(text: string, options: ChunkDocumentOptions = {}): Promise<ChunkDocumentResult> {
  const onProgress = options.onProgress || (() => {})

  if (text.length > MAX_SAFE_CHUNK_SIZE * 3) {
    const segments = await workerCall('preSplitText', text, MAX_SAFE_CHUNK_SIZE) as string[]
    const allChunks: DocumentChunk[] = []
    const allDocTags = new Set<string>()
    for (let s = 0; s < segments.length; s++) {
      const segPct = Math.round((s / segments.length) * 5)
      onProgress(segPct, `Part ${s + 1}/${segments.length}`)
      const segChunks = await chunkDocument(segments[s], {
        ...options,
        onProgress: (pct: number, msg = '') => {
          const mapped = segPct + Math.round((pct / 100) * (90 / segments.length))
          onProgress(mapped, `Part ${s + 1}/${segments.length}: ${msg}`)
        }
      })
      const docTags = segChunks.documentTags || []
      for (const t of docTags) allDocTags.add(t)
      for (const c of segChunks) {
        c.chunkIndex = allChunks.length + segChunks.indexOf(c)
        allChunks.push(c)
      }
    }
    onProgress(100, 'Done')
    ;(allChunks as ChunkDocumentResult).documentTags = [...allDocTags].slice(0, 20)
    return allChunks as ChunkDocumentResult
  }

  const normalized = await workerCall('normalizeText', text) as string
  const headings = await workerCall('detectHeadings', normalized) as HeadingInfo[]
  onProgress(2, 'Detected headings')

  const chunks = await computeSemanticChunks(normalized, {
    threshold: options.threshold ?? EMBEDDING_DEFAULTS.threshold,
    maxChunkSize: options.maxChunkSize ?? 1500,
    skipEmbeddings: options.fastMode === true,
    onProgress: (pct: number, msg = '') => {
      const mapped = 2 + Math.round((pct / 100) * 88)
      onProgress(mapped, msg)
    }
  })

  const allTags = new Set<string>()
  const result: DocumentChunk[] = []
  for (let index = 0; index < chunks.length; index++) {
    const pct = 90 + Math.round((index / chunks.length) * 10)
    onProgress(pct, `Extracting tags for chunk ${index + 1}/${chunks.length}`)
    const chunk = chunks[index]
    const heading = headings.find(
      (h: HeadingInfo) =>
        chunk.text.startsWith(h.text) ||
        normalized.indexOf(h.text) <= normalized.indexOf(chunk.text)
    )
    const tags = await workerCall('extractTags', chunk.text) as string[]
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
  }

  onProgress(100, 'Done')
  ;(result as ChunkDocumentResult).documentTags = [...allTags].slice(0, 20)
  return result as ChunkDocumentResult
}
