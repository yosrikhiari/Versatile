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
  const withStatus = chunks.map((c) => ({ ...c, embeddingStatus: c.embeddingStatus || PENDING }))
  const BATCH = 500
  const allIds = []
  const committedIds = []
  try {
    for (let i = 0; i < withStatus.length; i += BATCH) {
      const batch = withStatus.slice(i, i + BATCH)
      const ids = await db.researchChunks.bulkAdd(batch, null, { allKeys: true })
      allIds.push(...ids)
      committedIds.push(...ids)
      if (i + BATCH < withStatus.length) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }
    return allIds
  } catch (err) {
    if (committedIds.length > 0) {
      try {
        await db.researchChunks.bulkDelete(committedIds)
      } catch (rollbackErr) {
        throw new Error(
          `addResearchChunks failed after committing ${committedIds.length} chunks. ` +
            `Rollback also failed: ${rollbackErr.message}. ` +
            `Original error: ${err.message}`
        )
      }
    }
    throw new Error(
      `addResearchChunks failed after ${committedIds.length} of ${withStatus.length} chunks committed (rolled back): ${err.message}`
    )
  }
}

export async function updateChunkEmbeddings(updates, meta = {}) {
  const now = Date.now()
  const { provider, model, version } = meta
  await db.transaction('rw', db.researchChunks, async () => {
    for (const { id, embedding } of updates) {
      await db.researchChunks.update(id, {
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
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: PROCESSING })
    }
  })
}

export async function markFailed(ids) {
  await Promise.all(ids.map((id) => db.researchChunks.update(id, { embeddingStatus: FAILED })))
}

export async function markStale(projectId, currentProvider, currentModel, currentVersion) {
  const chunks = await db.researchChunks
    .where({ projectId })
    .filter(
      (c) =>
        c.embeddingStatus === READY &&
        (c.embeddingProvider !== currentProvider ||
          c.embeddingModel !== currentModel ||
          c.embeddingVersion !== currentVersion)
    )
    .toArray()
  if (chunks.length === 0) return 0
  const ids = chunks.map((c) => c.id)
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: STALE })
    }
  })
  return ids.length
}

export async function countByStatus(projectId) {
  const all = await db.researchChunks.where({ projectId }).toArray()
  return {
    total: all.length,
    PENDING: all.filter((c) => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter((c) => c.embeddingStatus === PROCESSING).length,
    READY: all.filter((c) => c.embeddingStatus === READY).length,
    FAILED: all.filter((c) => c.embeddingStatus === FAILED).length,
    STALE: all.filter((c) => c.embeddingStatus === STALE).length,
    unset: all.filter((c) => !c.embeddingStatus).length
  }
}

export async function deleteChunksForDocument(documentId) {
  return db.researchChunks.where({ documentId }).delete()
}

export async function updateChunkEmbedding(chunkId, embedding) {
  return db.researchChunks.update(chunkId, { embedding })
}

export async function getDocumentChunkEmbeddings(documentId) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter((c) => c.embedding && c.embeddingStatus === READY)
    .toArray()
  return chunks.map((c) => c.embedding)
}

export async function setDocumentEmbedding(documentId, embedding) {
  return db.researchDocuments.update(documentId, {
    embedding,
    embeddingComputedAt: Date.now()
  })
}

export async function getUnindexedChunks(projectId) {
  return db.researchChunks
    .where({ projectId })
    .filter((c) => {
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
    PENDING: all.filter((c) => c.embeddingStatus === PENDING).length,
    PROCESSING: all.filter((c) => c.embeddingStatus === PROCESSING).length,
    READY: all.filter((c) => c.embeddingStatus === READY).length,
    FAILED: all.filter((c) => c.embeddingStatus === FAILED).length,
    STALE: all.filter((c) => c.embeddingStatus === STALE).length
  }
}

export async function searchLexical(projectId, query, limit = 20) {
  const qTokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 1)
  if (qTokens.length === 0) return []

  const allChunks = await db.researchChunks.where({ projectId }).toArray()
  const N = allChunks.length
  if (N === 0) return []

  const df = {}
  for (const token of qTokens) {
    df[token] = allChunks.filter((c) => c.text.toLowerCase().includes(token)).length
  }

  const scored = allChunks.map((chunk) => {
    const lowerText = chunk.text.toLowerCase()
    let score = 0
    for (const token of qTokens) {
      const tf = (
        lowerText.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
      ).length
      if (tf === 0) continue
      const idf = Math.log((N - df[token] + 0.5) / (df[token] + 0.5) + 1)
      score += (1 + Math.log(tf)) * idf
    }
    return { ...chunk, _score: score }
  })

  return scored
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0,
    magA = 0,
    magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export async function semanticSearch(projectId, queryEmbedding, limit = 20) {
  if (!queryEmbedding) return []
  const chunks = await db.researchChunks
    .where({ projectId })
    .filter((c) => c.embedding && c.embedding.length > 0)
    .toArray()
  const scored = chunks.map((c) => ({
    ...c,
    _score: cosineSimilarity(c.embedding, queryEmbedding)
  }))
  return scored
    .filter((c) => c._score > 0.1)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
}

export async function getEmbeddingCacheEntry(hash) {
  return db.embeddingCache.get(hash)
}

export async function setEmbeddingCacheEntry(hash, embedding) {
  await db.embeddingCache.put({
    hash,
    embedding: Array.from(embedding),
    createdAt: Date.now()
  })
}

export async function getBulkCachedEmbeddings(hashes) {
  if (!hashes.length) return new Map()
  const entries = await db.embeddingCache.bulkGet(hashes)
  const map = new Map()
  for (let i = 0; i < hashes.length; i++) {
    if (entries[i]) {
      map.set(hashes[i], new Float32Array(entries[i].embedding))
    }
  }
  return map
}

export async function pruneEmbeddingCache(maxEntries = 20000) {
  const count = await db.embeddingCache.count()
  if (count <= maxEntries) return
  const toPrune = await db.embeddingCache
    .orderBy('createdAt')
    .limit(count - maxEntries)
    .toArray()
  const keys = toPrune.map((e) => e.hash)
  if (keys.length) await db.embeddingCache.bulkDelete(keys)
}

export async function resetChunksStatus(documentId, fromStatus) {
  const chunks = await db.researchChunks
    .where({ documentId })
    .filter((c) => c.embeddingStatus === fromStatus)
    .toArray()
  if (chunks.length === 0) return []
  const ids = chunks.map((c) => c.id)
  await db.transaction('rw', db.researchChunks, async () => {
    for (const id of ids) {
      await db.researchChunks.update(id, { embeddingStatus: PENDING })
    }
  })
  return chunks.map((c) => ({ id: c.id, text: c.text }))
}
