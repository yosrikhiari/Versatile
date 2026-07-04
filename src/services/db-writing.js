import { db } from './db-core'

// ========== SPARK HISTORY ==========

export async function getSparkHistory(projectId) {
  return db.sparkHistory.where('projectId').equals(projectId).reverse().toArray()
}

export async function addSparkHistory(projectId, data) {
  return db.sparkHistory.add({ projectId, ...data, createdAt: new Date().toISOString() })
}

export async function clearSparkHistory(projectId) {
  return db.sparkHistory.where('projectId').equals(projectId).delete()
}

// ========== ANNOTATIONS ==========

export async function getAnnotations(projectId) {
  return db.annotations.where('projectId').equals(projectId).toArray()
}

export async function addAnnotation(projectId, data) {
  return db.annotations.add({ projectId, ...data })
}

export async function updateAnnotation(id, data) {
  return db.annotations.update(id, data)
}

export async function deleteAnnotation(id) {
  return db.annotations.delete(id)
}

export async function clearAnnotations(projectId) {
  return db.annotations.where('projectId').equals(projectId).delete()
}

// ========== SNIPPETS ==========

export async function getSnippets(projectId) {
  return db.snippets.where('projectId').equals(projectId).toArray()
}

export async function addSnippet(projectId, data) {
  return db.snippets.add({ projectId, ...data })
}

export async function updateSnippet(id, data) {
  return db.snippets.update(id, data)
}

export async function deleteSnippet(id) {
  return db.snippets.delete(id)
}

export async function incrementSnippetWord(projectId, word) {
  const existing = await db.snippets.where({ projectId, word }).first()
  if (existing) {
    return db.snippets.update(existing.id, {
      count: existing.count + 1,
      lastSeen: new Date().toISOString()
    })
  }
  return db.snippets.add({ projectId, word, count: 1, lastSeen: new Date().toISOString() })
}

// ========== REVISION COMMENTS ==========

export async function getRevisionComments(projectId) {
  return db.revisionComments.where('projectId').equals(projectId).toArray()
}

export async function addRevisionComment(projectId, data) {
  return db.revisionComments.add({
    projectId,
    createdAt: new Date().toISOString(),
    ...data
  })
}

export async function updateRevisionComment(id, data) {
  return db.revisionComments.update(id, data)
}

export async function deleteRevisionComment(id) {
  return db.revisionComments.delete(id)
}
