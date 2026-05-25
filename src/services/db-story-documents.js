import { db } from './db-core'

export const DOC_TYPES = {
  SYNOPSIS: 'synopsis',
  CHARACTERS: 'characters',
  WORLD: 'world',
  TIMELINE: 'timeline',
  RELATIONSHIPS: 'relationships',
  REJECTED_PATTERNS: 'rejected_patterns'
}

export async function getStoryDocument(projectId, docType) {
  try {
    return await db.storyDocuments
      .where({ projectId, docType })
      .first()
  } catch (error) {
    console.error('Failed to get story document:', error)
    return null
  }
}

export async function getAllStoryDocuments(projectId) {
  try {
    return await db.storyDocuments
      .where('projectId')
      .equals(projectId)
      .toArray()
  } catch (error) {
    console.error('Failed to get all story documents:', error)
    return []
  }
}

export async function upsertStoryDocument(projectId, docType, content) {
  try {
    const existing = await db.storyDocuments
      .where({ projectId, docType })
      .first()
    if (existing) {
      await db.storyDocuments.update(existing.id, { content, updatedAt: Date.now() })
      return existing.id
    }
    return await db.storyDocuments.add({ projectId, docType, content, updatedAt: Date.now() })
  } catch (error) {
    console.error('Failed to upsert story document:', error)
    throw error
  }
}

export async function deleteStoryDocument(projectId, docType) {
  try {
    const existing = await db.storyDocuments
      .where({ projectId, docType })
      .first()
    if (existing) {
      await db.storyDocuments.delete(existing.id)
    }
  } catch (error) {
    console.error('Failed to delete story document:', error)
  }
}

export async function appendRejectedPattern(projectId, pattern) {
  try {
    const doc = await db.storyDocuments
      .where({ projectId, docType: DOC_TYPES.REJECTED_PATTERNS })
      .first()
    const entry = { ...pattern, rejectedAt: Date.now() }
    if (doc) {
      const patterns = JSON.parse(doc.content || '[]')
      patterns.push(entry)
      await db.storyDocuments.update(doc.id, { content: JSON.stringify(patterns), updatedAt: Date.now() })
      return doc.id
    }
    return await db.storyDocuments.add({
      projectId,
      docType: DOC_TYPES.REJECTED_PATTERNS,
      content: JSON.stringify([entry]),
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error('Failed to append rejected pattern:', error)
  }
}
