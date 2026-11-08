import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildOpenLibrarySearchUrl,
  mapOpenLibraryDoc,
  pickBestOpenLibraryDoc
} from '@/services/openLibraryService'

describe('openLibraryService (mapping, no network)', () => {
  it('builds a search URL with title/author and limit', () => {
    const url = buildOpenLibrarySearchUrl({ title: 'The Hobbit', author: 'Tolkien', limit: 5 })
    expect(url).toContain('openlibrary.org/search.json')
    expect(url).toContain('title=The+Hobbit')
    expect(url).toContain('author=Tolkien')
    expect(url).toContain('limit=5')
  })

  it('maps an Open Library doc to project metadata fields', () => {
    const meta = mapOpenLibraryDoc({
      title: 'Dune',
      subtitle: 'Deluxe Edition',
      author_name: ['Frank Herbert'],
      language: ['eng'],
      subject: ['Science fiction', 'Space opera'],
      first_publish_year: 1965,
      key: '/works/OL893415W',
      cover_i: 12345
    })
    expect(meta.name).toBe('Dune')
    expect(meta.subtitle).toBe('Deluxe Edition')
    expect(meta.authorName).toBe('Frank Herbert')
    expect(meta.language).toBe('eng')
    expect(meta.tags).toEqual(['Science fiction', 'Space opera'])
    expect(meta.firstPublishYear).toBe(1965)
    expect(meta.source).toBe('openlibrary')
    expect(meta.sourceKey).toBe('/works/OL893415W')
    expect(meta.coverUrl).toContain('12345')
  })

  it('picks the best doc preferring exact-ish title and cover', () => {
    const docs = [
      { title: 'Dune Messiah', author_name: ['Frank Herbert'] },
      { title: 'Dune', author_name: ['Frank Herbert'], cover_i: 9 }
    ]
    const best = pickBestOpenLibraryDoc(docs, { title: 'Dune' })
    expect(best.title).toBe('Dune')
  })

  it('returns null/empty safely for missing data', () => {
    expect(mapOpenLibraryDoc(null)).toBeNull()
    expect(mapOpenLibraryDoc({})).toMatchObject({ source: 'openlibrary' })
    expect(pickBestOpenLibraryDoc([], { title: 'x' })).toBeNull()
  })
})

describe('openLibraryService search (mocked fetch, cached)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not fetch when query is empty', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
    const { searchOpenLibraryMetadata } = await import('@/services/openLibraryService')
    const res = await searchOpenLibraryMetadata({ title: '', author: '' })
    expect(res.results).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
