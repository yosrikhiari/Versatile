/**
 * Hierarchical digest rollup: scene → chapter → volume → book.
 *
 * This is the core of Phase 2: instead of a flat O(n²) scan over all scenes
 * for contradiction detection, we now have a tree structure that reduces
 * cross-chapter analysis to ~45K tokens (300 chapters × ~150 tokens each)
 * which fits a local model's context window.
 */

import type { SceneDigest } from './sceneDigest'
import type { ChapterDigest, VolumeDigest } from '../db-digests'

export interface BookDigest {
  projectId: string
  volumeCount: number
  totalWordCount: number
  charactersPresent: string[]
  locations: string[]
  summary: string
}

function hashContent(text: string): string {
  let h = 0x811c9dc5
  const s = String(text ?? '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(16)}-${s.length}`
}

/** Aggregate scene digests into a chapter digest. */
export function buildChapterDigest({
  projectId,
  chapterNumber,
  volumeId,
  sceneDigests
}: {
  projectId: string
  chapterNumber: number
  volumeId: string | null
  sceneDigests: SceneDigest[]
}): ChapterDigest {
  const validScenes = sceneDigests.filter((d) => d && d.contentHash)
  const allChars = new Set<string>()
  const allLocs = new Set<string>()
  let totalWords = 0

  for (const d of validScenes) {
    totalWords += d.wordCount ?? 0
    for (const c of d.charactersPresent ?? []) allChars.add(c)
    if (d.location) allLocs.add(d.location)
    for (const l of d.facts?.locations ?? []) allLocs.add(l)
  }

  // Build summary from scene summaries
  const summary = validScenes
    .map((d) => d.summary)
    .filter(Boolean)
    .join(' | ')

  const contentForHash = JSON.stringify({
    scenes: validScenes.map((d) => d.contentHash),
    summary
  })

  return {
    projectId,
    chapterNumber,
    volumeId,
    contentHash: hashContent(contentForHash),
    updatedAt: new Date().toISOString(),
    sceneCount: validScenes.length,
    totalWordCount: totalWords,
    charactersPresent: [...allChars],
    locations: [...allLocs],
    timelineStart: validScenes[0]?.summary ?? null,
    timelineEnd: validScenes[validScenes.length - 1]?.summary ?? null,
    summary
  }
}

/** Aggregate chapter digests into a volume digest. */
export function buildVolumeDigest({
  projectId,
  volumeId,
  chapterDigests
}: {
  projectId: string
  volumeId: string
  chapterDigests: ChapterDigest[]
}): VolumeDigest {
  const validChapters = chapterDigests.filter((d) => d && d.contentHash)
  const allChars = new Set<string>()
  const allLocs = new Set<string>()
  let totalWords = 0

  for (const d of validChapters) {
    totalWords += d.totalWordCount ?? 0
    for (const c of d.charactersPresent ?? []) allChars.add(c)
    for (const l of d.locations ?? []) allLocs.add(l)
  }

  const summary = validChapters
    .map((d) => d.summary)
    .filter(Boolean)
    .join(' | ')

  const contentForHash = JSON.stringify({
    chapters: validChapters.map((d) => d.contentHash),
    summary
  })

  return {
    projectId,
    volumeId,
    contentHash: hashContent(contentForHash),
    updatedAt: new Date().toISOString(),
    chapterCount: validChapters.length,
    totalWordCount: totalWords,
    charactersPresent: [...allChars],
    locations: [...allLocs],
    summary
  }
}

/** Aggregate volume digests into a book digest. */
export function buildBookDigest({
  projectId,
  volumeDigests
}: {
  projectId: string
  volumeDigests: VolumeDigest[]
}): BookDigest {
  const validVolumes = volumeDigests.filter((d) => d && d.contentHash)
  const allChars = new Set<string>()
  const allLocs = new Set<string>()
  let totalWords = 0

  for (const d of validVolumes) {
    totalWords += d.totalWordCount ?? 0
    for (const c of d.charactersPresent ?? []) allChars.add(c)
    for (const l of d.locations ?? []) allLocs.add(l)
  }

  const summary = validVolumes
    .map((d) => d.summary)
    .filter(Boolean)
    .join(' | ')

  return {
    projectId,
    volumeCount: validVolumes.length,
    totalWordCount: totalWords,
    charactersPresent: [...allChars],
    locations: [...allLocs],
    summary
  }
}

/**
 * Roll up all digests for a project: scene → chapter → volume → book.
 * Returns the book digest and also writes chapter/volume digests to DB.
 */
export async function rollupAllDigests(
  projectId: string,
  getSceneDigests: () => Promise<SceneDigest[]>,
  getChapters: () => Promise<Array<{ number: number; volumeId: string | null; sceneIds: string[] }>>,
  getVolumes: () => Promise<Array<{ id: string; chapterNumbers: number[] }>>,
  putChapterDigest: (d: ChapterDigest) => Promise<any>,
  putVolumeDigest: (d: VolumeDigest) => Promise<any>
): Promise<BookDigest> {
  const sceneDigests = await getSceneDigests()
  const chapters = await getChapters()
  const volumes = await getVolumes()

  // Group scenes by chapter
  const scenesByChapter = new Map<number, SceneDigest[]>()
  for (const d of sceneDigests) {
    if (d.chapterNumber != null) {
      if (!scenesByChapter.has(d.chapterNumber)) scenesByChapter.set(d.chapterNumber, [])
      scenesByChapter.get(d.chapterNumber)!.push(d)
    }
  }

  // Build chapter digests
  const chapterDigests: ChapterDigest[] = []
  for (const ch of chapters) {
    const scenes = scenesByChapter.get(ch.number) ?? []
    if (scenes.length === 0) continue
    const digest = buildChapterDigest({
      projectId,
      chapterNumber: ch.number,
      volumeId: ch.volumeId,
      sceneDigests: scenes
    })
    await putChapterDigest(digest)
    chapterDigests.push(digest)
  }

  // Build volume digests
  const volumeDigests: VolumeDigest[] = []
  for (const vol of volumes) {
    const chDigests = chapterDigests.filter((d) => vol.chapterNumbers.includes(d.chapterNumber))
    if (chDigests.length === 0) continue
    const digest = buildVolumeDigest({
      projectId,
      volumeId: vol.id,
      chapterDigests: chDigests
    })
    await putVolumeDigest(digest)
    volumeDigests.push(digest)
  }

  // Build book digest
  return buildBookDigest({ projectId, volumeDigests })
}