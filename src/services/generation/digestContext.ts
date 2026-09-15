import {
  getProjectDigests,
  getProjectChapterDigests,
  putChapterDigest,
  putVolumeDigest
} from '../db-digests'
import { rollupAllDigests, type BookDigest } from './digestRollup'
import { getSections, getSubsections } from '../db-structure'
import { orderSections } from '../../utils/sectionOrder'

/**
 * Wiring for the scene → chapter → volume → book digest hierarchy.
 *
 * The hierarchy was fully built and completely unreferenced: `rollupAllDigests`,
 * `buildChapterDigest` and `buildBookDigest` had no callers anywhere, and
 * nothing ever read a chapter or volume digest back. Meanwhile the writer's
 * story-so-far is `runningChapterLog.slice(-20)` — the last twenty scene
 * summaries — so on any book longer than that, everything older did not get
 * summarised, it disappeared.
 *
 * This module closes both ends: it runs the rollup, and it turns the resulting
 * chapter digests into the block that covers what the recent-scene window no
 * longer reaches.
 */

/** How many characters of summary an earlier chapter gets before trimming. */
const MIN_CHAPTER_CHARS = 80
const CHARS_PER_TOKEN = 4

function trimTo(text: string, maxChars: number): string {
  const s = String(text || '').trim()
  if (s.length <= maxChars) return s
  return s.slice(0, Math.max(1, maxChars - 1)).replace(/\s+\S*$/, '') + '…'
}

/**
 * Rebuild chapter and volume digests from the scene digests already on disk.
 *
 * Pure aggregation — no model call — so this is cheap enough to run per batch.
 * Chapters are derived from the scene digests themselves rather than from the
 * manuscript, so a chapter is represented exactly when it has committed scenes.
 */
export async function rollupProjectDigests({
  projectId,
  volumeId = null
}: {
  projectId: string
  volumeId?: string | null
}): Promise<BookDigest | null> {
  if (!projectId) return null
  try {
    const rawDigests = await getProjectDigests(projectId)
    if (!rawDigests.length) return null

    // A scene digest carries the chapter number its run gave it, which starts
    // at 1 for every run: three volumes' first chapters all rolled up into
    // "chapter 1" and the timeline showed one chapter made of three. The
    // manuscript's own order is the number that means something — the same
    // one TimelineView titles chapters by — so each digest is placed by the
    // section its scene sits in. A digest whose scene is not in a section
    // keeps its run number.
    const placement = await sectionPlacement(projectId)
    const sceneDigests = rawDigests.map((d: any) => {
      const n = placement.chapterOfScene.get(String(d.subsectionId))
      return n != null ? { ...d, chapterNumber: n } : d
    })

    const chapterNumbers = [
      ...new Set(
        sceneDigests
          .map((d: any) => d.chapterNumber)
          .filter((n: any) => n != null)
          .map(Number)
      )
    ].sort((a, b) => a - b)
    if (!chapterNumbers.length) return null

    const chapters = chapterNumbers.map((number) => ({
      number,
      volumeId: placement.volumeOfChapter.get(number) ?? volumeId,
      sceneIds: []
    }))
    const byVolume = new Map<string, number[]>()
    for (const ch of chapters) {
      if (ch.volumeId == null) continue
      const key = String(ch.volumeId)
      if (!byVolume.has(key)) byVolume.set(key, [])
      byVolume.get(key)!.push(ch.number)
    }
    const volumes = [...byVolume.entries()].map(([id, nums]) => ({ id, chapterNumbers: nums }))

    return await rollupAllDigests(
      projectId,
      async () => sceneDigests,
      async () => chapters,
      async () => volumes,
      putChapterDigest,
      putVolumeDigest
    )
  } catch (err) {
    console.warn('[digestContext] digest rollup failed:', err)
    return null
  }
}

/** sceneId → chapter number (1-based, in manuscript order) and chapter → volume. */
async function sectionPlacement(projectId: string) {
  const chapterOfScene = new Map<string, number>()
  const volumeOfChapter = new Map<number, string | null>()
  try {
    const [sections, subsections] = await Promise.all([
      getSections(projectId),
      getSubsections(projectId)
    ])
    const sorted = orderSections(sections as any[])
    const chapterOfSection = new Map<string, number>()
    sorted.forEach((s: any, i: number) => {
      chapterOfSection.set(String(s.id), i + 1)
      volumeOfChapter.set(i + 1, s.volumeId ?? null)
    })
    for (const sub of subsections as any[]) {
      const n = chapterOfSection.get(String(sub.sectionId))
      if (n != null) chapterOfScene.set(String(sub.id), n)
    }
  } catch {
    // No manuscript to place against (a test, or a project mid-load): the
    // digests' own numbers are used.
  }
  return { chapterOfScene, volumeOfChapter }
}

/**
 * The chapters the recent-scene window no longer covers, summarised.
 *
 * A chapter qualifies once every one of its scenes has fallen outside the last
 * `recentSceneCount` written scenes — so this block and the recent log never
 * overlap and never leave a gap between them.
 *
 * Under budget pressure every chapter keeps a line and the summaries get
 * shorter, rather than the oldest chapters being dropped. Losing resolution is
 * recoverable; losing chapter 1 entirely is what happens today.
 */
export async function buildEarlierChaptersBlock({
  projectId,
  recentSceneCount = 20,
  budgetTokens = 700
}: {
  projectId: string
  recentSceneCount?: number
  budgetTokens?: number
}): Promise<string> {
  if (!projectId) return ''
  try {
    const sceneDigests = await getProjectDigests(projectId)
    if (!sceneDigests.length) return ''

    const numbered = sceneDigests.filter(
      (d: any) => d?.sceneNumber != null && d?.chapterNumber != null
    )
    if (!numbered.length) return ''

    const sceneNumbers = numbered.map((d: any) => Number(d.sceneNumber)).sort((a, b) => a - b)
    const cutoff = sceneNumbers[Math.max(0, sceneNumbers.length - recentSceneCount)]

    // A chapter is "earlier" only when ALL of its scenes precede the window.
    const lastSceneOfChapter = new Map<number, number>()
    for (const d of numbered) {
      const ch = Number(d.chapterNumber)
      const sn = Number(d.sceneNumber)
      lastSceneOfChapter.set(ch, Math.max(lastSceneOfChapter.get(ch) ?? -Infinity, sn))
    }
    const earlierChapters = new Set(
      [...lastSceneOfChapter.entries()].filter(([, last]) => last < cutoff).map(([ch]) => ch)
    )
    if (!earlierChapters.size) return ''

    const chapterDigests = (await getProjectChapterDigests(projectId))
      .filter((d: any) => earlierChapters.has(Number(d.chapterNumber)))
      .sort((a: any, b: any) => Number(a.chapterNumber) - Number(b.chapterNumber))
    if (!chapterDigests.length) return ''

    const header = '# Earlier chapters (summarised)'
    const budgetChars = Math.max(0, budgetTokens * CHARS_PER_TOKEN - header.length)
    const perChapter = Math.max(
      MIN_CHAPTER_CHARS,
      Math.floor(budgetChars / chapterDigests.length) - 20
    )

    const lines = chapterDigests.map((d: any) => {
      const summary = trimTo(d.summary || '(no summary)', perChapter)
      return `Chapter ${d.chapterNumber}: ${summary}`
    })

    return [header, ...lines].join('\n')
  } catch (err) {
    console.warn('[digestContext] could not build earlier-chapters block:', err)
    return ''
  }
}
