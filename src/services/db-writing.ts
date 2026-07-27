import { db as _db } from './db-core'

const db = _db as any

// ========== SPARK HISTORY ==========

export async function getSparkHistory(projectId: string) {
  return db.sparkHistory.where('projectId').equals(projectId).reverse().toArray()
}

export async function addSparkHistory(projectId: string, data: any) {
  return db.sparkHistory.add({ projectId, ...data, createdAt: new Date().toISOString() })
}

export async function clearSparkHistory(projectId: string) {
  return db.sparkHistory.where('projectId').equals(projectId).delete()
}

// ========== ANNOTATIONS ==========

export async function getAnnotations(projectId: string) {
  return db.annotations.where('projectId').equals(projectId).toArray()
}

export async function addAnnotation(projectId: string, data: any) {
  return db.annotations.add({ projectId, ...data })
}

export async function updateAnnotation(id: string, data: any) {
  return db.annotations.update(id, data)
}

export async function deleteAnnotation(id: string) {
  return db.annotations.delete(id)
}

export async function clearAnnotations(projectId: string) {
  return db.annotations.where('projectId').equals(projectId).delete()
}

// ========== SNIPPETS ==========

export async function getSnippets(projectId: string) {
  return db.snippets.where('projectId').equals(projectId).toArray()
}

export async function addSnippet(projectId: string, data: any) {
  return db.snippets.add({ projectId, ...data })
}

export async function updateSnippet(id: string, data: any) {
  return db.snippets.update(id, data)
}

export async function deleteSnippet(id: string) {
  return db.snippets.delete(id)
}

export async function incrementSnippetWord(projectId: string, word: string) {
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

export async function getRevisionComments(projectId: string) {
  return db.revisionComments.where('projectId').equals(projectId).toArray()
}

export async function addRevisionComment(projectId: string, data: any) {
  return db.revisionComments.add({
    projectId,
    createdAt: new Date().toISOString(),
    ...data
  })
}

export async function updateRevisionComment(id: string, data: any) {
  return db.revisionComments.update(id, data)
}

export async function deleteRevisionComment(id: string) {
  return db.revisionComments.delete(id)
}
