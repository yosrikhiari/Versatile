/**
 * Open Library metadata lookup (Phase C, opt-in).
 *
 * - User-initiated only (UI calls this on explicit action).
 * - Network-optional/failure-tolerant: returns empty/errors without throwing hard.
 * - Cached in-memory for the session; callers may persist if desired.
 * - Rate-limited with simple min-interval + backoff on 429/5xx.
 * - Attribution/privacy: Open Library data is used under their terms; do not send
 *   manuscript content. Browser fetch cannot set User-Agent; we identify the app
 *   via request behavior and keep requests minimal.
 */

export const OPEN_LIBRARY_SEARCH = 'https://openlibrary.org/search.json'
export const OPEN_LIBRARY_COVERS = 'https://covers.openlibrary.org/b/id'

const MIN_INTERVAL_MS = 1100
let lastRequestAt = 0

type SearchParams = { title?: string; author?: string; limit?: number; signal?: AbortSignal }

interface OpenLibraryDoc {
  key?: string
  title?: string
  subtitle?: string
  author_name?: string[]
  language?: string[]
  subject?: string[]
  first_publish_year?: number
  cover_i?: number
}

export interface OpenLibraryMetadata {
  source: 'openlibrary'
  sourceKey: string
  name: string
  subtitle: string
  authorName: string
  language: string
  tags: string[]
  firstPublishYear: number | null
  coverUrl: string
}

export interface OpenLibrarySearchResult {
  results: OpenLibraryMetadata[]
  fromCache: boolean
  error: string | null
  attribution?: string
}

type CacheEntry = { at: number; value: OpenLibrarySearchResult }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function rateLimit() {
  const now = Date.now()
  const wait = MIN_INTERVAL_MS - (now - lastRequestAt)
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()
}

export function buildOpenLibrarySearchUrl({ title = '', author = '', limit = 5 }: SearchParams) {
  const u = new URL(OPEN_LIBRARY_SEARCH)
  if (title.trim()) u.searchParams.set('title', title.trim())
  if (author.trim()) u.searchParams.set('author', author.trim())
  u.searchParams.set('limit', String(Math.max(1, Math.min(limit, 10))))
  u.searchParams.set(
    'fields',
    [
      'key',
      'title',
      'subtitle',
      'author_name',
      'language',
      'subject',
      'first_publish_year',
      'cover_i'
    ].join(',')
  )
  return u.toString()
}

export function mapOpenLibraryDoc(
  doc: OpenLibraryDoc | null | undefined
): OpenLibraryMetadata | null {
  if (doc == null) return null
  const authorName = Array.isArray(doc.author_name)
    ? doc.author_name.filter(Boolean).join(', ')
    : ''
  const language = Array.isArray(doc.language)
    ? String(doc.language[0] || '')
    : String(doc.language || '')
  const tags = Array.isArray(doc.subject)
    ? doc.subject.filter((s): s is string => typeof s === 'string').slice(0, 12)
    : []
  const coverUrl = doc.cover_i ? `${OPEN_LIBRARY_COVERS}/${doc.cover_i}-M.jpg` : ''
  return {
    source: 'openlibrary',
    sourceKey: doc.key || '',
    name: doc.title || '',
    subtitle: doc.subtitle || '',
    authorName,
    language,
    tags,
    firstPublishYear: doc.first_publish_year ?? null,
    coverUrl
  }
}

function norm(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function pickBestOpenLibraryDoc(
  docs: OpenLibraryDoc[] | null | undefined,
  { title = '' }: { title?: string } = {}
): OpenLibraryDoc | null {
  if (!Array.isArray(docs) || docs.length === 0) return null
  const want = norm(title)
  let best: OpenLibraryDoc | null = null
  let bestScore = -1
  for (const d of docs) {
    if (!d) continue
    const t = norm(d.title || '')
    let score = 0
    if (want && t === want) score += 5
    else if (want && t && (t.includes(want) || want.includes(t))) score += 2
    if (d.cover_i) score += 1
    if (Array.isArray(d.author_name) && d.author_name.length) score += 1
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best || docs[0] || null
}

async function fetchJsonWithBackoff(
  url: string,
  signal?: AbortSignal
): Promise<{ docs?: OpenLibraryDoc[] } | null> {
  let attempt = 0
  let delay = 800
  while (attempt < 3) {
    attempt++
    await rateLimit()
    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal
      })
    } catch (e: unknown) {
      if (signal?.aborted) throw e
      if (attempt >= 3) throw e
      await sleep(delay)
      delay *= 2
      continue
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 3) return null
      await sleep(delay)
      delay *= 2
      continue
    }
    if (!res.ok) return null
    try {
      return (await res.json()) as { docs?: OpenLibraryDoc[] }
    } catch {
      return null
    }
  }
  return null
}

export async function searchOpenLibraryMetadata({
  title = '',
  author = '',
  limit = 5,
  signal
}: SearchParams): Promise<OpenLibrarySearchResult> {
  const qTitle = String(title || '').trim()
  const qAuthor = String(author || '').trim()
  if (!qTitle && !qAuthor) return { results: [], fromCache: false, error: null }

  const cacheKey = `${qTitle.toLowerCase()}|${qAuthor.toLowerCase()}|${limit}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.value, fromCache: true }
  }

  try {
    const url = buildOpenLibrarySearchUrl({ title: qTitle, author: qAuthor, limit })
    const data = await fetchJsonWithBackoff(url, signal)
    const docs = Array.isArray(data?.docs) ? data.docs : []
    const results = docs
      .map((doc) => mapOpenLibraryDoc(doc))
      .filter((v): v is OpenLibraryMetadata => v != null)
    const value: OpenLibrarySearchResult = {
      results,
      fromCache: false,
      error: null,
      attribution: 'Data from Open Library (openlibrary.org)'
    }
    cache.set(cacheKey, { at: Date.now(), value })
    return value
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string } | null
    if (err?.name === 'AbortError') return { results: [], fromCache: false, error: 'aborted' }
    return { results: [], fromCache: false, error: err?.message || 'lookup failed' }
  }
}

export async function fetchOpenLibraryCoverBlob(
  coverUrl: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  if (!coverUrl || !/^https:\/\/covers\.openlibrary\.org\//.test(coverUrl)) return null
  try {
    await rateLimit()
    const res = await fetch(coverUrl, { method: 'GET', signal })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob || !blob.type?.startsWith('image/')) return null
    return blob
  } catch {
    return null
  }
}
