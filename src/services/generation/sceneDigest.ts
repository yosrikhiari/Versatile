/**
 * The derived-artifact layer: one structured digest per scene.
 *
 * Whole-manuscript analysis currently re-reads raw prose every time. The beta
 * reader runs one sequential LLM call per scene to build a fact ledger — on a
 * 300-chapter manuscript, with local inference serialised to one in-flight
 * request, that is hours — and then concatenates the entire ledger into a single
 * prompt that no local context window can hold.
 *
 * A digest computed ONCE per scene, at commit time, from data the writer has
 * already produced turns every O(n) pass into O(dirty). `contentHash` is the
 * invalidation key: a scene whose prose has not changed does not recompute.
 *
 * Two properties this deliberately has:
 *
 *   1. **No LLM call.** Everything here is either extracted from the writer's
 *      existing structured output or computed statistically. The marginal cost
 *      of a digest is a hash and a few passes over the prose. A digest layer
 *      that cost a model call per scene would reintroduce the problem it exists
 *      to solve.
 *   2. **Separate from prose generation.** It is built AFTER prose, from
 *      finished text — never as a JSON envelope around generation, which is
 *      measured to suppress prose length ~44x on a 7B model.
 */

import { countProseWords } from '../../composables/generation/writing/liveDraft'

export const DIGEST_VERSION = 1

export interface SceneDigest {
  projectId: string
  subsectionId: string
  contentHash: string
  version: number
  updatedAt: string
  /** One sentence: what happens. From the writer's own metadata pass. */
  summary: string
  sceneNumber: number | null
  chapterNumber: number | null
  title: string
  charactersPresent: string[]
  location: string
  /** Durable canon this scene establishes — the cross-scene memory carrier. */
  keyFacts: string[]
  facts: {
    characters: string[]
    locations: string[]
    events: string[]
    objects: string[]
  }
  wordCount: number
  uniqueWordCount: number
  duplicateRatio: number
  /** Statistical voice fingerprint. No LLM — pure counting, so drift is free. */
  styleVector: StyleVector
  /** Whether the metadata this was built from was real. */
  metadataStatus: 'ok' | 'failed' | 'skipped'
}

export interface StyleVector {
  avgSentenceLength: number
  sentenceLengthVariance: number
  dialogueRatio: number
  /** Share of sentences opening with a pronoun — a strong AI-prose tell. */
  pronounOpenRatio: number
  commaDensity: number
  /** "felt", "knew", "realized", "seemed" — filter words that signal telling. */
  filterWordRatio: number
}

const FILTER_WORDS = [
  'felt', 'feel', 'knew', 'know', 'realized', 'realised', 'seemed', 'saw',
  'heard', 'noticed', 'thought', 'wondered', 'watched', 'decided'
]
const OPENING_PRONOUNS = ['he', 'she', 'they', 'it', 'his', 'her', 'their']

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) || []
}

/**
 * FNV-1a over the prose. Not cryptographic — this only has to answer "did this
 * change", and it must be synchronous (`crypto.subtle` is async, and a digest
 * write sits on the commit path).
 */
export function hashContent(text: string): string {
  let h = 0x811c9dc5
  const s = String(text ?? '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // Length guards against the rare short-string collision, cheaply.
  return `${(h >>> 0).toString(16)}-${s.length}`
}

export function computeStyleVector(prose: string): StyleVector {
  const text = String(prose ?? '')
  const sentences = sentencesOf(text)
  const allWords = words(text)

  if (sentences.length === 0 || allWords.length === 0) {
    return {
      avgSentenceLength: 0,
      sentenceLengthVariance: 0,
      dialogueRatio: 0,
      pronounOpenRatio: 0,
      commaDensity: 0,
      filterWordRatio: 0
    }
  }

  const lengths = sentences.map((s) => words(s).length)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length

  // Straight and curly quotes both — the writer's output uses curly.
  const quoted = text.match(/[""][^""]*[""]|"[^"]*"/g) || []
  const dialogueWords = quoted.reduce((sum, q) => sum + words(q).length, 0)

  const pronounOpens = sentences.filter((s) => {
    const first = words(s)[0]
    return first ? OPENING_PRONOUNS.includes(first) : false
  }).length

  const filterCount = allWords.filter((w) => FILTER_WORDS.includes(w)).length

  const round = (n: number) => Math.round(n * 1000) / 1000
  return {
    avgSentenceLength: round(mean),
    sentenceLengthVariance: round(variance),
    dialogueRatio: round(dialogueWords / allWords.length),
    pronounOpenRatio: round(pronounOpens / sentences.length),
    commaDensity: round((text.match(/,/g) || []).length / sentences.length),
    filterWordRatio: round(filterCount / allWords.length)
  }
}

/** Words remaining after duplicate sentences are removed. */
export function countUniqueProseWords(prose: string): number {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const s of sentencesOf(String(prose ?? ''))) {
    const key = s.toLowerCase().replace(/\s+/g, ' ')
    if (key.split(' ').length >= 5) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    kept.push(s)
  }
  return countProseWords(kept.join(' '))
}

function stringList(value: any): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of value) {
    const s = typeof v === 'string' ? v.trim() : String(v?.name || v?.title || '').trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}

/**
 * Build a digest from finished prose plus the writer's structured metadata.
 *
 * Pure and total: any shape of `structured` yields a valid digest, because this
 * runs on the commit path and must never be the thing that loses a scene.
 */
export function buildSceneDigest({
  projectId,
  subsectionId,
  prose,
  structured,
  scene
}: {
  projectId: string
  subsectionId: string
  prose: string
  structured?: any
  scene?: any
}): SceneDigest {
  const text = String(prose ?? '')
  const wordCount = countProseWords(text)
  const uniqueWordCount = countUniqueProseWords(text)
  const s = structured || {}

  return {
    projectId,
    subsectionId,
    contentHash: hashContent(text),
    version: DIGEST_VERSION,
    // Caller-supplied wall clock is avoided elsewhere for determinism, but a
    // digest is a stored record whose age matters for staleness reporting.
    updatedAt: new Date().toISOString(),
    summary: typeof s.summary === 'string' ? s.summary : '',
    sceneNumber: typeof scene?.sceneNumber === 'number' ? scene.sceneNumber : null,
    chapterNumber: typeof scene?.chapterNumber === 'number' ? scene.chapterNumber : null,
    title: String(scene?.title || ''),
    charactersPresent: stringList(
      s.usedEntities?.characterNames?.length
        ? s.usedEntities.characterNames
        : scene?.charactersPresent || scene?.characters
    ),
    location: String(scene?.location || s.usedEntities?.locationNames?.[0] || ''),
    keyFacts: stringList(s.keyFacts),
    facts: {
      characters: stringList(s.usedEntities?.characterNames),
      locations: stringList(s.usedEntities?.locationNames),
      events: stringList(s.keyFacts),
      objects: stringList(s.usedEntities?.objectNames)
    },
    wordCount,
    uniqueWordCount,
    duplicateRatio: wordCount ? Math.round((1 - uniqueWordCount / wordCount) * 1000) / 1000 : 0,
    styleVector: computeStyleVector(text),
    metadataStatus: s.metadataStatus || 'skipped'
  }
}

/** Has the prose changed since this digest was built? */
export function isDigestStale(digest: any, prose: string): boolean {
  if (!digest) return true
  if (digest.version !== DIGEST_VERSION) return true
  return digest.contentHash !== hashContent(prose)
}
