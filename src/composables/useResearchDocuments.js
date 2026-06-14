import { ref } from 'vue'
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

        importProgress.value = `Chunking ${file.name}...`
        const chunks = await chunkDocument(result.text)

        const chunkRows = chunks.map(c => ({
          documentId: docId,
          projectId: projectId.value,
          text: c.text,
          chunkIndex: c.chunkIndex,
          heading: c.heading,
          sentenceCount: c.sentenceCount,
          charCount: c.charCount,
          tokenEstimate: c.tokenEstimate
        }))

        const ids = await addResearchChunks(chunkRows)

        importProgress.value = `Indexing ${file.name}...`
        const idTextPairs = ids.map((id, i) => ({ id, text: chunks[i].text }))
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

  return {
    documents,
    isImporting,
    importProgress,
    importError,
    loadDocuments,
    importFiles,
    removeDocument,
    getDocumentChunks,
    getAllChunks
  }
}
