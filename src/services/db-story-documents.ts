import { db as _db } from './db-core'

const db = _db as any

export const DOC_TYPES = {
  SYNOPSIS: 'synopsis',
  CHARACTERS: 'characters',
  WORLD: 'world',
  TIMELINE: 'timeline',
  RELATIONSHIPS: 'relationships',
  REJECTED_PATTERNS: 'rejected_patterns',
  STYLE_GUIDE: 'style_guide',
  STORY_CONTEXT: 'story_context'
}

export async function getStoryDocument(projectId: string, docType: string) {
  try {
    return await db.storyDocuments.where({ projectId, docType }).first()
  } catch (error) {
    console.error('Failed to get story document:', error)
    return null
  }
}

export async function getAllStoryDocuments(projectId: string) {
  try {
    return await db.storyDocuments.where('projectId').equals(projectId).toArray()
  } catch (error) {
    console.error('Failed to get all story documents:', error)
    return []
  }
}

/**
 * Who last wrote this document.
 *
 * These docs are derived from the story bible but are also directly editable and
 * uploadable, so "regenerate everything" cannot be applied blindly — it would
 * silently destroy hand-written canon. Recording provenance lets the end-of-run
 * refresh update the machine-generated ones and leave the author's alone.
 *
 * Rows written before this field existed have no `source`. They are treated as
 * `auto`, which matches how they were in fact produced in every code path that
 * existed at the time except a manual edit in the document editor.
 */
export type DocSource = 'auto' | 'user'

export async function upsertStoryDocument(
  projectId: string,
  docType: string,
  content: string,
  source: DocSource = 'user'
) {
  try {
    const existing = await db.storyDocuments.where({ projectId, docType }).first()
    if (existing) {
      await db.storyDocuments.update(existing.id, { content, source, updatedAt: Date.now() })
      return existing.id
    }
    return await db.storyDocuments.add({
      projectId,
      docType,
      content,
      source,
      updatedAt: Date.now()
    })
  } catch (error) {
    console.error('Failed to upsert story document:', error)
    throw error
  }
}

/** True when the author has taken ownership of this doc and it must not be auto-overwritten. */
export function isUserOwned(doc: { source?: string } | null | undefined) {
  return doc?.source === 'user'
}

export async function deleteStoryDocument(projectId: string, docType: string) {
  try {
    const existing = await db.storyDocuments.where({ projectId, docType }).first()
    if (existing) {
      await db.storyDocuments.delete(existing.id)
    }
  } catch (error) {
    console.error('Failed to delete story document:', error)
  }
}

export async function appendRejectedPattern(projectId: string, pattern: any) {
  try {
    const doc = await db.storyDocuments
      .where({ projectId, docType: DOC_TYPES.REJECTED_PATTERNS })
      .first()
    const entry = { ...pattern, rejectedAt: Date.now() }
    if (doc) {
      let patterns = []
      try {
        patterns = JSON.parse(doc.content || '[]')
      } catch (err) {
        console.warn('[db-story-documents] Corrupt pattern JSON; starting fresh:', err)
      }
      patterns.push(entry)
      await db.storyDocuments.update(doc.id, {
        content: JSON.stringify(patterns),
        updatedAt: Date.now()
      })
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
