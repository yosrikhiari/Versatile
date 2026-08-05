import {
  getProjectDigests,
  getProjectChapterDigests,
  putChapterDigest,
  putVolumeDigest
} from '../db-digests'
import { rollupAllDigests, type BookDigest } from './digestRollup'

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
    const sceneDigests = await getProjectDigests(projectId)
    if (!sceneDigests.length) return null

    const chapterNumbers = [
      ...new Set(
        sceneDigests
          .map((d: any) => d.chapterNumber)
          .filter((n: any) => n != null)
          .map(Number)
      )
    ].sort((a, b) => a - b)
    if (!chapterNumbers.length) return null

    return await rollupAllDigests(
      projectId,
      async () => sceneDigests,
      async () => chapterNumbers.map((number) => ({ number, volumeId, sceneIds: [] })),
      async () => (volumeId ? [{ id: volumeId, chapterNumbers }] : []),
      putChapterDigest,
      putVolumeDigest
    )
  } catch (err) {
    console.warn('[digestContext] digest rollup failed:', err)
    return null
  }
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
