/**
 * Semantic index over the story's own content — bible entities and scenes —
 * for the Related panel and Story Lookup (Smart Connections analog, roadmap
 * Phase 3).
 *
 * Reuses the research stack rather than forking it: `getEmbedding` /
 * `getEmbeddings` for vectors, the worker IVF index (`buildVectorIndex` /
 * `searchVectorIndex`) for search, and the `researchChunks` row shape for
 * storage (`contentVectors`, schema v51). Every stored vector records the
 * `model` and `dim` it was built with, and a query whose dimension does not
 * match the corpus degrades loudly (one warning per project) and falls back to
 * brute-force ranking — never a silent empty result.
 */
import { db } from './db-core'
import { getEmbedding, getEmbeddings } from './embeddingService'
import { resolveEmbeddingConfig } from './embeddingConfig'
import { buildVectorIndex, searchVectorIndex } from './vectorIndexService'
import { getCharacters, getLocations, getPlotThreads } from './db-entities'
import { getSections, getSubsections } from './db-structure'
import { stripHtmlTags } from '../utils/textUtils'

export type ContentKind = 'character' | 'location' | 'thread' | 'section' | 'subsection'

export interface ContentVectorRow {
  id?: number
  projectId: string
  kind: ContentKind
  refId: string
  title: string
  /** The text that was embedded, kept for previews. */
  text: string
  model: string
  dim: number
  embedding: Float32Array
  embeddingStatus: 'READY' | 'FAILED'
  updatedAt: string
}

export interface StoryMatch {
  kind: ContentKind
  refId: string
  title: string
  text: string
  score: number
}

export interface RankOptions {
  limit?: number
  kinds?: ContentKind[]
  threshold?: number
  /** Rows to leave out — the anchor scene itself, typically. */
  exclude?: Array<{ kind: ContentKind; refId: string }>
}

const DEFAULT_THRESHOLD = 0.1
/** Text past this is not embedded; the opening carries the scene's identity. */
const MAX_INDEX_CHARS = 6000

// ── vector helpers (ported from researchDb.ts so both stores agree) ────────

export function toNormalizedF32(
  embedding: ArrayLike<number> | null | undefined
): Float32Array | null {
  if (!embedding || !embedding.length) return null
  const len = embedding.length
  let mag = 0
  for (let i = 0; i < len; i++) mag += embedding[i] * embedding[i]
  mag = Math.sqrt(mag)
  if (mag === 0) return null
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) out[i] = embedding[i] / mag
  return out
}

const warnedDimProjects = new Set<string>()
export function warnDimMismatch(
  projectId: string,
  mismatched: number,
  total: number,
  queryDim: number
): void {
  if (warnedDimProjects.has(projectId)) return
  warnedDimProjects.add(projectId)
  console.warn(
    `[storyVectorIndex] project ${projectId}: ${mismatched}/${total} content vectors were skipped because ` +
      `their dimension does not match the query's (${queryDim}). The story was embedded with a different ` +
      `model — re-index it (indexProject) or Related/Lookup will keep missing those rows.`
  )
}
/** Test seam: forget which projects have been warned. */
export function resetDimWarnings(): void {
  warnedDimProjects.clear()
}

/**
 * Pure ranking: normalize, cosine-score every stored row against the query,
 * drop dimension mismatches (counted, so the caller can warn), filter by
 * kind, exclude the anchor, sort, slice.
 */
export function rankVectors(
  query: ArrayLike<number> | null | undefined,
  stored: ContentVectorRow[],
  opts: RankOptions = {}
): { matches: StoryMatch[]; mismatched: number } {
  const q = toNormalizedF32(query)
  if (!q) return { matches: [], mismatched: 0 }
  const limit = opts.limit ?? 10
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const kinds = opts.kinds?.length ? new Set(opts.kinds) : null
  const excluded = new Set((opts.exclude || []).map((e) => `${e.kind}:${e.refId}`))

  let mismatched = 0
  const scored: StoryMatch[] = []
  for (const row of stored || []) {
    const v = row?.embedding
    if (!v || !v.length) continue
    if (v.length !== q.length) {
      mismatched++
      continue
    }
    if (kinds && !kinds.has(row.kind)) continue
    if (excluded.has(`${row.kind}:${row.refId}`)) continue
    let dot = 0
    for (let i = 0; i < v.length; i++) dot += v[i] * q[i]
    if (dot > threshold) {
      scored.push({
        kind: row.kind,
        refId: row.refId,
        title: row.title,
        text: row.text,
        score: dot
      })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return { matches: scored.slice(0, limit), mismatched }
}

// ── text derivation (one place, so indexProject and the scheduler agree) ───

export function buildIndexText(kind: ContentKind, data: any): string {
  const parts: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) parts.push(v.trim())
  }
  switch (kind) {
    case 'character':
      push(data?.name)
      push(data?.role)
      push(data?.goal)
      push(data?.description)
      push(data?.notes)
      if (Array.isArray(data?.traits)) push(data.traits.join(', '))
      break
    case 'location':
      push(data?.name)
      push(data?.type)
      push(data?.description)
      push(data?.notes)
      break
    case 'thread':
      push(data?.title)
      push(data?.status)
      push(data?.summary)
      push(data?.description)
      push(data?.notes)
      break
    case 'section':
      push(data?.title)
      push(data?.summary)
      push(stripHtmlTags(data?.content || ''))
      break
    case 'subsection':
      push(data?.title)
      push(data?.summary)
      push(stripHtmlTags(data?.content || ''))
      break
  }
  return parts.join('\n').slice(0, MAX_INDEX_CHARS)
}

export function deriveIndexTitle(kind: ContentKind, data: any): string {
  return String(data?.title || data?.name || `${kind} ${data?.id ?? ''}`).trim()
}

// ── storage ────────────────────────────────────────────────────────────────

function table() {
  return (db as any).contentVectors
}

export async function getStoredVectors(
  projectId: string,
  kinds?: ContentKind[]
): Promise<ContentVectorRow[]> {
  const rows: ContentVectorRow[] = await table().where({ projectId }).toArray()
  const ready = rows.filter((r) => r.embeddingStatus === 'READY' && r.embedding)
  if (!kinds?.length) return ready
  const set = new Set(kinds)
  return ready.filter((r) => set.has(r.kind))
}

async function upsert(row: ContentVectorRow): Promise<void> {
  const existing = await table()
    .where('[projectId+kind+refId]')
    .equals([row.projectId, row.kind, row.refId])
    .first()
  if (existing?.id != null) await table().update(existing.id, row)
  else await table().add(row)
}

/** Embed one item and upsert its row. Returns false when embedding is unavailable. */
export async function indexStoryContent(
  projectId: string,
  kind: ContentKind,
  refId: string,
  text: string,
  title = ''
): Promise<boolean> {
  const clean = (text || '').trim()
  if (!projectId || !refId || !clean) return false
  const cfg = resolveEmbeddingConfig()
  const vec = await getEmbedding(clean.slice(0, MAX_INDEX_CHARS))
  const normalized = toNormalizedF32(vec)
  if (!normalized) return false
  await upsert({
    projectId,
    kind,
    refId: String(refId),
    title,
    text: clean.slice(0, 400),
    model: cfg.model || 'unknown',
    dim: normalized.length,
    embedding: normalized,
    embeddingStatus: 'READY',
    updatedAt: new Date().toISOString()
  })
  invalidateIndex(projectId)
  return true
}

/** Embed many items in one call and upsert each. Returns how many landed. */
export async function indexStoryContentBatch(
  projectId: string,
  items: Array<{ kind: ContentKind; refId: string; text: string; title?: string }>
): Promise<number> {
  const usable = items.filter((i) => i && i.refId && (i.text || '').trim())
  if (!projectId || usable.length === 0) return 0
  const cfg = resolveEmbeddingConfig()
  const { vectors } = await getEmbeddings(
    usable.map((i) => i.text.trim().slice(0, MAX_INDEX_CHARS))
  )
  let landed = 0
  const now = new Date().toISOString()
  for (let i = 0; i < usable.length; i++) {
    const normalized = toNormalizedF32(vectors?.[i])
    if (!normalized) continue
    await upsert({
      projectId,
      kind: usable[i].kind,
      refId: String(usable[i].refId),
      title: usable[i].title || '',
      text: usable[i].text.trim().slice(0, 400),
      model: cfg.model || 'unknown',
      dim: normalized.length,
      embedding: normalized,
      embeddingStatus: 'READY',
      updatedAt: now
    })
    landed++
  }
  if (landed) invalidateIndex(projectId)
  return landed
}

/** Index the whole bible + manuscript. Returns how many rows landed. */
export async function indexProject(projectId: string): Promise<number> {
  const [chars, locs, threads, sections, subsections] = await Promise.all([
    getCharacters(projectId),
    getLocations(projectId),
    getPlotThreads(projectId),
    getSections(projectId),
    getSubsections(projectId)
  ])
  const items: Array<{ kind: ContentKind; refId: string; text: string; title?: string }> = []
  const add = (kind: ContentKind, rows: any[]) => {
    for (const r of rows || []) {
      const text = buildIndexText(kind, r)
      if (text) items.push({ kind, refId: String(r.id), text, title: deriveIndexTitle(kind, r) })
    }
  }
  add('character', chars)
  add('location', locs)
  add('thread', threads)
  add('section', sections)
  add('subsection', subsections)
  return indexStoryContentBatch(projectId, items)
}

// ── search ─────────────────────────────────────────────────────────────────

const builtIndexes = new Map<string, { count: number; dim: number }>()

function indexKey(projectId: string) {
  return `story:${projectId}`
}

function invalidateIndex(projectId: string) {
  builtIndexes.delete(indexKey(projectId))
}

async function ensureWorkerIndex(
  projectId: string,
  rows: ContentVectorRow[],
  dim: number
): Promise<boolean> {
  const key = indexKey(projectId)
  const usable = rows.filter((r) => r.embedding?.length === dim)
  if (usable.length === 0) return false
  const known = builtIndexes.get(key)
  if (known && known.count === usable.length && known.dim === dim) return true
  await buildVectorIndex(
    key,
    usable.map((r) => ({
      id: `${r.kind}:${r.refId}`,
      vector: r.embedding,
      metadata: { kind: r.kind, refId: r.refId, title: r.title, text: r.text }
    })),
    { dim }
  )
  builtIndexes.set(key, { count: usable.length, dim })
  return true
}

/**
 * Natural-language (or scene-text) query → ranked story content. Embeds the
 * query, checks dimension provenance, tries the worker index, and falls back
 * to pure ranking on any failure so the caller always gets an answer.
 */
export async function searchStorySemantic(
  projectId: string,
  queryText: string,
  opts: RankOptions = {}
): Promise<StoryMatch[]> {
  const clean = (queryText || '').trim()
  if (!projectId || !clean) return []
  const vec = await getEmbedding(clean.slice(0, MAX_INDEX_CHARS))
  const q = toNormalizedF32(vec)
  if (!q) return []
  const rows = await getStoredVectors(projectId)
  if (rows.length === 0) return []

  const mismatched = rows.filter((r) => r.embedding?.length !== q.length).length
  if (mismatched > 0) warnDimMismatch(projectId, mismatched, rows.length, q.length)

  const limit = opts.limit ?? 10
  const kinds = opts.kinds?.length ? new Set(opts.kinds) : null
  const excluded = new Set((opts.exclude || []).map((e) => `${e.kind}:${e.refId}`))
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD

  try {
    const ok = await ensureWorkerIndex(projectId, rows, q.length)
    if (ok) {
      // Over-fetch so kind/exclude filtering still yields `limit` rows.
      const raw = await searchVectorIndex(indexKey(projectId), q, limit * 3 + 5)
      const out: StoryMatch[] = []
      for (const r of raw || []) {
        const m = (r.metadata || {}) as any
        const kind = m.kind as ContentKind
        if (kinds && !kinds.has(kind)) continue
        if (excluded.has(`${kind}:${m.refId}`)) continue
        if (r.score <= threshold) continue
        out.push({
          kind,
          refId: String(m.refId),
          title: m.title || '',
          text: m.text || '',
          score: r.score
        })
        if (out.length >= limit) break
      }
      if (out.length > 0) return out
    }
  } catch (e) {
    console.warn('[storyVectorIndex] worker search failed, falling back to brute-force:', e)
  }
  return rankVectors(q, rows, opts).matches
}

// ── incremental index on save ──────────────────────────────────────────────

const SCHEDULE_DEBOUNCE_MS = 500
const pending = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Re-embed one entity or scene shortly after it is saved. Per-key debounce
 * (rapid edits coalesce), fire-and-forget, every error swallowed, no-op when
 * there is nothing to embed — the save path must never wait on or fail for
 * the index.
 */
export function scheduleStoryIndex(
  projectId: string,
  kind: ContentKind,
  refId: string,
  data: any
): void {
  if (!projectId || !refId) return
  const key = `${projectId}:${kind}:${refId}`
  const prev = pending.get(key)
  if (prev) clearTimeout(prev)
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key)
      const text = buildIndexText(kind, data)
      if (!text) return
      indexStoryContent(projectId, kind, String(refId), text, deriveIndexTitle(kind, data)).catch(
        (e) => console.warn('[storyVectorIndex] incremental index failed:', e?.message || e)
      )
    }, SCHEDULE_DEBOUNCE_MS)
  )
}

/** Cancel every pending incremental index (tests, project switch). */
export function flushStoryIndexScheduler(): void {
  for (const t of pending.values()) clearTimeout(t)
  pending.clear()
}

export const STORY_INDEX_DEBOUNCE_MS = SCHEDULE_DEBOUNCE_MS
