import { ref } from 'vue'
import { db } from '../services/db-core'
import {
  getAllResearchDocuments,
  addResearchDocument,
  deleteResearchDocument,
  deleteChunksForDocument,
  addResearchChunks,
  getChunksForDocument,
  getAllChunksForProject
} from '../services/researchDb'
import { extractFileText } from '../services/pdfExtractorService'
import { chunkDocument } from '../services/documentChunker'
import { useEmbeddingIndexer } from './useEmbeddingIndexer'

const WARN_SIZE = 500000
const MAX_SIZE = 3000000

function splitText(text, maxSegmentSize = 300000) {
  if (text.length <= maxSegmentSize) return [text]

  const hasDoubleNewline = text.indexOf('\n\n') !== -1
  const hasSingleNewline = text.indexOf('\n') !== -1

  let parts
  if (hasDoubleNewline) {
    parts = text.split(/(?<=\n\n)/)
  } else if (hasSingleNewline) {
    parts = text.split(/(?<=\n)/)
  } else {
    parts = text.split(/(?<=\s)/)
  }

  const segments = []
  let current = ''
  for (const part of parts) {
    if (current.length + part.length > maxSegmentSize && current.length > 0) {
      segments.push(current)
      current = part
    } else {
      current += part
    }
  }
  if (current.length > 0) segments.push(current)
  return segments
}

export function useResearchDocuments(projectId) {
  const documents = ref([])
  const isImporting = ref(false)
  const importProgress = ref('')
  const importError = ref(null)
  const showSizeWarning = ref(false)
  const pendingImportInfo = ref({ files: [], totalChars: 0 })
  const truncationInfo = ref(null)
  const { enqueueChunks } = useEmbeddingIndexer()

  function confirmImport() {
    showSizeWarning.value = false
    pendingImportInfo.value = { files: [], totalChars: 0 }
  }

  function cancelImport() {
    showSizeWarning.value = false
    pendingImportInfo.value = { files: [], totalChars: 0 }
    importError.value = null
  }

  async function loadDocuments() {
    if (!projectId.value) return
    documents.value = await getAllResearchDocuments(projectId.value)
  }

  function checkFileSizes(files) {
    let totalChars = 0
    const oversized = []
    for (const file of files) {
      if (file.size > MAX_SIZE) {
        oversized.push(file)
      }
      totalChars += file.size
    }

    if (oversized.length > 0) {
      const names = oversized.map(f => f.name).join(', ')
      importError.value = `"${names}" ${oversized.length > 1 ? 'are' : 'is'} too large. Maximum file size is ${(MAX_SIZE / 1000000).toFixed(0)}MB.`
      return false
    }

    if (totalChars > WARN_SIZE) {
      pendingImportInfo.value = { files, totalChars }
      showSizeWarning.value = true
      return false
    }

    return true
  }

  function truncateText(text) {
    return text.length > MAX_SIZE ? text.slice(0, MAX_SIZE) : text
  }

  async function importFiles(files) {
    importError.value = null
    isImporting.value = true
    let totalChunks = 0
    let processed = 0

    try {
      for (const file of files) {
        importProgress.value = `Reading ${file.name}...`
        await yieldToMain()

        const result = await extractFileText(file)

        if (result.isScanned) {
          importError.value = `"${file.name}" appears to be a scanned PDF with no selectable text. OCR is not yet supported.`
          continue
        }

        if (!result.text.trim()) {
          importError.value = `"${file.name}" is empty or contains no extractable text.`
          continue
        }

        let text = result.text
        let wasTruncated = false
        if (text.length > MAX_SIZE) {
          text = truncateText(text)
          wasTruncated = true
        }

        const docId = await addResearchDocument({
          projectId: projectId.value,
          fileName: file.name,
          fileType: file.name.split('.').pop().toLowerCase(),
          text: text,
          charCount: text.length,
          importedAt: Date.now()
        })

        const segments = splitText(text)
        let allChunks = []
        const allDocTags = new Set()

        for (let s = 0; s < segments.length; s++) {
          importProgress.value = `Chunking ${file.name} (${s + 1}/${segments.length})...`
          const segment = segments[s]
          const chunks = await chunkDocument(segment, {
            onProgress: (msg) => {
              importProgress.value = `${file.name}: ${msg}`
            }
          })
          const docTags = chunks.documentTags || []
          for (const t of docTags) allDocTags.add(t)
          allChunks.push(...chunks)
          await yieldToMain()
        }

        await db.researchDocuments.update(docId, { tags: [...allDocTags].slice(0, 20) })

        const chunkRows = allChunks.map((c, i) => ({
          documentId: docId,
          projectId: projectId.value,
          text: c.text,
          chunkIndex: i,
          heading: c.heading,
          sentenceCount: c.sentenceCount,
          charCount: c.charCount,
          tokenEstimate: c.tokenEstimate,
          tags: c.tags || []
        }))

        totalChunks = chunkRows.length
        const ids = await addResearchChunks(chunkRows)

        importProgress.value = `Indexing ${file.name} (${totalChunks} chunks)...`
        const idTextPairs = ids.map((id, i) => ({ id, text: allChunks[i].text }))
        enqueueChunks(docId, idTextPairs)

        processed++

        if (wasTruncated) {
          const mb = (result.text.length / 1000000).toFixed(1)
          truncationInfo.value = `${file.name} was ${mb}MB — truncated to ${(MAX_SIZE / 1000000).toFixed(0)}MB.`
        }
      }

      importProgress.value = ''
      await loadDocuments()
    } catch (err) {
      importError.value = err.message || 'Import failed'
    } finally {
      isImporting.value = false
    }
  }

  function yieldToMain() {
    return new Promise(r => setTimeout(r, 0))
  }

  async function removeDocument(id) {
    await deleteResearchDocument(id)
    await loadDocuments()
  }

  async function getDocumentChunks(documentId) {
    return getChunksForDocument(documentId)
  }

  async function getAllChunks() {
    if (!projectId.value) return []
    return getAllChunksForProject(projectId.value)
  }

  async function reindexDocument(documentId) {
    const doc = await db.researchDocuments.get(documentId)
    if (!doc?.text) throw new Error('Document text unavailable for re-index')

    const oldChunks = await getChunksForDocument(documentId)
    const oldChunkByText = new Map()
    for (const c of oldChunks) {
      oldChunkByText.set(c.text, c)
    }

    await deleteChunksForDocument(documentId)

    const segments = splitText(doc.text)
    let allChunks = []
    const allDocTags = new Set()

    for (let s = 0; s < segments.length; s++) {
      importProgress.value = `Re-chunking ${doc.fileName} (segment ${s + 1}/${segments.length})...`
      const result = await chunkDocument(segments[s])
      const docTags = result.documentTags || []
      for (const t of docTags) allDocTags.add(t)
      allChunks.push(...result)
    }

    const chunkRows = []
    const needsEmbedding = []

    for (let i = 0; i < allChunks.length; i++) {
      const c = allChunks[i]
      const existing = oldChunkByText.get(c.text)

      if (existing?.embedding && existing.embeddingStatus === 'READY') {
        chunkRows.push({
          documentId,
          projectId: projectId.value,
          text: c.text,
          chunkIndex: i,
          heading: c.heading,
          sentenceCount: c.sentenceCount,
          charCount: c.charCount,
          tokenEstimate: c.tokenEstimate,
          tags: c.tags || [],
          embedding: existing.embedding,
          embeddingStatus: 'READY',
          embeddingProvider: existing.embeddingProvider,
          embeddingModel: existing.embeddingModel,
          embeddingVersion: existing.embeddingVersion,
          embeddedAt: existing.embeddedAt
        })
      } else {
        chunkRows.push({
          documentId,
          projectId: projectId.value,
          text: c.text,
          chunkIndex: i,
          heading: c.heading,
          sentenceCount: c.sentenceCount,
          charCount: c.charCount,
          tokenEstimate: c.tokenEstimate,
          tags: c.tags || [],
          embeddingStatus: 'PENDING'
        })
        needsEmbedding.push(i)
      }
    }

    await db.researchDocuments.update(documentId, { tags: [...allDocTags].slice(0, 20) })

    const ids = await addResearchChunks(chunkRows)

    if (needsEmbedding.length > 0) {
      const idTextPairs = needsEmbedding.map(i => ({
        id: ids[i],
        text: allChunks[i].text
      }))
      enqueueChunks(documentId, idTextPairs)
    }

    importProgress.value = ''
    await loadDocuments()
  }

  return {
    documents,
    isImporting,
    importProgress,
    importError,
    showSizeWarning,
    pendingImportInfo,
    truncationInfo,
    loadDocuments,
    importFiles,
    checkFileSizes,
    confirmImport,
    cancelImport,
    removeDocument,
    getDocumentChunks,
    getAllChunks,
    reindexDocument
  }
}
