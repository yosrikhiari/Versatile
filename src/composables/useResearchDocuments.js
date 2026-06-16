import { ref } from 'vue'
import { db } from '../services/db-core'
import {
  getAllResearchDocuments,
  addResearchDocument,
  deleteResearchDocument,
  addResearchChunks,
  getChunksForDocument,
  getAllChunksForProject
} from '../services/researchDb'
import { extractFileText } from '../services/pdfExtractorService'
import { chunkDocument } from '../services/documentChunker'
import { useEmbeddingIndexer } from './useEmbeddingIndexer'
function splitText(text, maxSegmentSize = 500000) {
  if (text.length <= maxSegmentSize) return [text]
  const segments = []
  const parts = text.split(/(?<=\n\n)/)
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
  const { enqueueChunks } = useEmbeddingIndexer()

  async function loadDocuments() {
    if (!projectId.value) return
    documents.value = await getAllResearchDocuments(projectId.value)
  }

  async function importFiles(files) {
    importError.value = null
    isImporting.value = true

    try {
      for (const file of files) {
        importProgress.value = `Importing ${file.name}...`

        const result = await extractFileText(file)

        if (result.isScanned) {
          importError.value = `"${file.name}" appears to be a scanned PDF with no selectable text. OCR is not yet supported.`
          continue
        }

        if (!result.text.trim()) {
          importError.value = `"${file.name}" is empty or contains no extractable text.`
          continue
        }

        const docId = await addResearchDocument({
          projectId: projectId.value,
          fileName: file.name,
          fileType: file.name.split('.').pop().toLowerCase(),
          text: result.text,
          charCount: result.text.length,
          importedAt: Date.now()
        })

        const segments = splitText(result.text)
        let allChunks = []
        const allDocTags = new Set()

        for (let s = 0; s < segments.length; s++) {
          importProgress.value = `Chunking ${file.name} (segment ${s + 1}/${segments.length})...`
          const chunks = await chunkDocument(segments[s])
          const docTags = chunks.documentTags || []
          for (const t of docTags) allDocTags.add(t)
          allChunks.push(...chunks)
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

        const ids = await addResearchChunks(chunkRows)

        importProgress.value = `Indexing ${file.name}...`
        const idTextPairs = ids.map((id, i) => ({ id, text: allChunks[i].text }))
        enqueueChunks(docId, idTextPairs)
      }

      importProgress.value = ''
      await loadDocuments()
    } catch (err) {
      importError.value = err.message || 'Import failed'
    } finally {
      isImporting.value = false
    }
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
    await deleteResearchDocument(documentId)
    const file = new File([doc.text], doc.fileName, { type: doc.fileType === 'pdf' ? 'application/pdf' : 'text/plain' })
    await importFiles([file])
  }

  return {
    documents,
    isImporting,
    importProgress,
    importError,
    loadDocuments,
    importFiles,
    removeDocument,
    getDocumentChunks,
    getAllChunks,
    reindexDocument
  }
}
