import { db } from './db-core'

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
  return db.researchChunks.bulkAdd(chunks, null, { allKeys: true })
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
        embeddedAt: now
      })
    }
  })
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
    .filter(c => !c.embedding)
    .toArray()
}
