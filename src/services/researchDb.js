import { db } from './db-core'

const PENDING = 'PENDING'
const PROCESSING = 'PROCESSING'
const READY = 'READY'
const FAILED = 'FAILED'
const STALE = 'STALE'

export function getStatuses() {
  return { PENDING, PROCESSING, READY, FAILED, STALE }
}

export async function getAllResearchDocuments(projectId) {
  return db.researchDocuments.where({ projectId }).reverse().sortBy('importedAt')
}

export async function getResearchDocument(id) {
  return db.researchDocuments.get(id)
}

export async function addResearchDocument(doc) {
  return db.researchDocuments.add(doc)
}

export async function deleteResearchDocument(id) {
  await db.researchChunks.where({ documentId: id }).delete()
  return db.researchDocuments.delete(id)
}

export async function getChunksForDocument(documentId) {
  return db.researchChunks.where({ documentId }).sortBy('chunkIndex')
}

export async function getAllChunksForProject(projectId) {
  return db.researchChunks.where({ projectId }).toArray()
}

export async function addResearchChunks(chunks) {
  const withStatus = chunks.map(c => ({ ...c, embeddingStatus: PENDING }))
  return db.researchChunks.bulkAdd(withStatus, null, { allKeys: true })
}

export async function updateChunkEmbeddings(updates, meta = {}) {
  const now = Date.now()
  const { provider, model, version } = meta
  await db.transaction('rw', db.researchChunks, () => {
    for (const { id, embedding } of updates) {
      db.researchChunks.update(id, {
        embedding,
        embeddingProvider: provider || null,
        embeddingModel: model || null,
        embeddingVersion: version || null,
        embeddedAt: now,
        embeddingStatus: READY
      })
    }
  })
}

export async function markProcessing(ids) {
  await db.transaction('rw', db.researchChunks, () => {
    for (const id of ids) {
      db.researchChunks.update(id, { embeddingStatus: PROCESSING })
    }
  })
}

export async function markFailed(ids) {
  await db.transaction('rw', db.researchChunks, () => {
    for (const id of ids) {
      db.researchChunks.update(id, { embeddingStatus: FAILED })
    }
  })
}

export async function markStale(projectId, currentProvider, currentModel, currentVersion) {
  const chunks = await db.researchChunks
    .where({ projectId })
    .filter(c =>
      c.embeddingStatus === READY && (
        c.embeddingProvider !== currentProvider ||
        c.embeddingModel !== currentModel ||
        c.embeddingVersion !== currentVersion
      )
    )
    .toArray()
  if (chunks.length === 0) return 0
  const ids = chunks.map(c => c.id)
  await db.transaction('rw', db.researchChunks, () => {
    for (const id of ids) {
      db.researchChunks.update(id, { embeddingStatus: STALE })
    }
  })
  return ids.length
}

export async function countByStatus(projectId) {
  const all = await db.researchChunks.where({ projectId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter(c => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter(c => c.embeddingStatus === PROCESSING).length,
    READY: all.filter(c => c.embeddingStatus === READY).length,
    FAILED: all.filter(c => c.embeddingStatus === FAILED).length,
    STALE: all.filter(c => c.embeddingStatus === STALE).length,
    unset: all.filter(c => !c.embeddingStatus).length
  }
}

export async function deleteChunksForDocument(documentId) {
  return db.researchChunks.where({ documentId }).delete()
}

export async function updateChunkEmbedding(chunkId, embedding) {
  return db.researchChunks.update(chunkId, { embedding })
}

export async function getUnindexedChunks(projectId) {
  return db.researchChunks
    .where({ projectId })
    .filter(c => {
      if (c.embeddingStatus === READY) return false
      if (!c.embeddingStatus && c.embedding) return false
      return true
    })
    .toArray()
}

export async function getDocumentStatusCounts(documentId) {
  const all = await db.researchChunks.where({ documentId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter(c => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter(c => c.embeddingStatus === PROCESSING).length,
    READY: all.filter(c => c.embeddingStatus === READY).length,
    FAILED: all.filter(c => c.embeddingStatus === FAILED).length,
    STALE: all.filter(c => c.embeddingStatus === STALE).length
  }
}

export async function resetChunksStatus(documentId, fromStatus) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter(c => c.embeddingStatus === fromStatus)
    .toArray()
  if (chunks.length === 0) return []
  const ids = chunks.map(c => c.id)
  await db.transaction('rw', db.researchChunks, () => {
    for (const id of ids) {
      db.researchChunks.update(id, { embeddingStatus: PENDING })
    }
  })
  return chunks.map(c => ({ id: c.id, text: c.text }))
}
