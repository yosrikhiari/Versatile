import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * In-memory stand-in for the storyDocuments table, so these tests exercise the
 * real refresh policy rather than Dexie.
 */
let rows = []

vi.mock('@/services/db-story-documents', async () => {
  const DOC_TYPES = {
    SYNOPSIS: 'synopsis',
    CHARACTERS: 'characters',
    WORLD: 'world',
    TIMELINE: 'timeline',
    RELATIONSHIPS: 'relationships',
    REJECTED_PATTERNS: 'rejected_patterns',
    STYLE_GUIDE: 'style_guide',
    STORY_CONTEXT: 'story_context'
  }
  return {
    DOC_TYPES,
    isUserOwned: (doc) => doc?.source === 'user',
    getAllStoryDocuments: async () => rows,
    upsertStoryDocument: async (projectId, docType, content, source = 'user') => {
      const existing = rows.find((r) => r.docType === docType)
      if (existing) Object.assign(existing, { content, source })
      else rows.push({ projectId, docType, content, source })
    },
    appendRejectedPattern: async () => {}
  }
})

let docs
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  rows = []
  const mod = await import('@/composables/useStoryDocuments')
  docs = mod.useStoryDocuments()
})

describe('regenerateAllDocuments', () => {
  it('creates documents that do not exist yet', async () => {
    const refreshed = await docs.regenerateAllDocuments(1)
    expect(refreshed).toContain('characters')
    expect(refreshed).toContain('timeline')
  })

  it('leaves existing documents alone without force', async () => {
    rows.push({ projectId: 1, docType: 'characters', content: 'STALE', source: 'auto' })
    const refreshed = await docs.regenerateAllDocuments(1)
    expect(refreshed).not.toContain('characters')
    expect(rows.find((r) => r.docType === 'characters').content).toBe('STALE')
  })

  it('refreshes stale auto-generated documents when forced', async () => {
    // The bug this covers: after a generation run the docs still described the
    // project as it was beforehand, and those stale docs are fed back to the
    // model as canon on the next run.
    rows.push({ projectId: 1, docType: 'characters', content: 'STALE', source: 'auto' })
    const refreshed = await docs.regenerateAllDocuments(1, { force: true })
    expect(refreshed).toContain('characters')
    expect(rows.find((r) => r.docType === 'characters').content).not.toBe('STALE')
  })

  it('never overwrites a document the author edited by hand', async () => {
    rows.push({ projectId: 1, docType: 'world', content: 'MY OWN CANON', source: 'user' })
    const refreshed = await docs.regenerateAllDocuments(1, { force: true })
    expect(refreshed).not.toContain('world')
    expect(rows.find((r) => r.docType === 'world').content).toBe('MY OWN CANON')
  })

  it('treats pre-provenance rows as auto so legacy projects still get refreshed', async () => {
    rows.push({ projectId: 1, docType: 'timeline', content: 'OLD' }) // no `source`
    const refreshed = await docs.regenerateAllDocuments(1, { force: true })
    expect(refreshed).toContain('timeline')
  })

  it('marks regenerated documents as auto so a later refresh can update them again', async () => {
    await docs.regenerateAllDocuments(1)
    expect(rows.every((r) => r.source === 'auto')).toBe(true)
  })

  it('returns an empty list when every document is author-owned', async () => {
    for (const t of [
      'synopsis',
      'characters',
      'world',
      'timeline',
      'relationships',
      'rejected_patterns',
      'style_guide'
    ]) {
      rows.push({ projectId: 1, docType: t, content: 'mine', source: 'user' })
    }
    expect(await docs.regenerateAllDocuments(1, { force: true })).toEqual([])
  })

  it('is a no-op without a project id', async () => {
    expect(await docs.regenerateAllDocuments(null, { force: true })).toEqual([])
  })
})
