import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The writer's story-so-far is the last N scene summaries. Everything older used
 * to vanish rather than be summarised. These tests pin the seam between the two
 * blocks: it must not overlap (wasted tokens) and must not leave a gap (a
 * chapter nobody can see).
 */

let sceneDigests
let chapterDigests
const putChapterDigest = vi.fn(async (d) => chapterDigests.push(d))
const putVolumeDigest = vi.fn(async () => {})

vi.mock('@/services/db-digests', () => ({
  getProjectDigests: async () => sceneDigests,
  getProjectChapterDigests: async () => chapterDigests,
  putChapterDigest: (...a) => putChapterDigest(...a),
  putVolumeDigest: (...a) => putVolumeDigest(...a)
}))

let buildEarlierChaptersBlock, rollupProjectDigests

/** 3 scenes per chapter, numbered continuously from 1. */
function makeScenes(chapters) {
  const out = []
  let sceneNumber = 1
  for (let ch = 1; ch <= chapters; ch++) {
    for (let s = 0; s < 3; s++) {
      out.push({
        projectId: 'p1',
        subsectionId: `sub-${sceneNumber}`,
        contentHash: `h${sceneNumber}`,
        chapterNumber: ch,
        sceneNumber: sceneNumber++,
        summary: `Chapter ${ch} scene ${s + 1} happens`,
        charactersPresent: [`Char${ch}`],
        location: `Place${ch}`,
        wordCount: 500,
        facts: { characters: [], locations: [], events: [], objects: [] }
      })
    }
  }
  return out
}

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  sceneDigests = []
  chapterDigests = []
  const mod = await import('@/services/generation/digestContext')
  buildEarlierChaptersBlock = mod.buildEarlierChaptersBlock
  rollupProjectDigests = mod.rollupProjectDigests
})

describe('rollupProjectDigests', () => {
  it('builds a chapter digest per chapter that has committed scenes', async () => {
    sceneDigests = makeScenes(4)
    await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })

    expect(chapterDigests.map((d) => d.chapterNumber)).toEqual([1, 2, 3, 4])
    expect(chapterDigests[0].sceneCount).toBe(3)
    expect(chapterDigests[0].volumeId).toBe('v1')
    expect(chapterDigests[0].summary).toContain('Chapter 1 scene 1 happens')
  })

  it('rolls chapters up into a volume digest', async () => {
    sceneDigests = makeScenes(3)
    await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })
    expect(putVolumeDigest).toHaveBeenCalledTimes(1)
    expect(putVolumeDigest.mock.calls[0][0].chapterCount).toBe(3)
  })

  it('does nothing when no scenes have been committed', async () => {
    sceneDigests = []
    const result = await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })
    expect(result).toBeNull()
    expect(putChapterDigest).not.toHaveBeenCalled()
  })

  it('never throws into the writing loop', async () => {
    sceneDigests = null // getProjectDigests returns null → .length throws
    await expect(rollupProjectDigests({ projectId: 'p1' })).resolves.toBeNull()
  })
})

describe('buildEarlierChaptersBlock', () => {
  // 10 chapters x 3 scenes = 30 scenes. A 20-scene window reaches back to scene
  // 11, which sits in chapter 4 — so chapters 1-3 are fully outside it.
  const setup10 = async () => {
    sceneDigests = makeScenes(10)
    await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })
  }

  it('covers exactly the chapters the recent window no longer reaches', async () => {
    await setup10()
    const block = await buildEarlierChaptersBlock({ projectId: 'p1', recentSceneCount: 20 })

    expect(block).toContain('Chapter 1:')
    expect(block).toContain('Chapter 2:')
    expect(block).toContain('Chapter 3:')
    // Chapter 4 straddles the boundary, so the recent log still carries it.
    expect(block).not.toContain('Chapter 4:')
  })

  it('is empty while the whole book still fits in the recent window', async () => {
    sceneDigests = makeScenes(5) // 15 scenes < 20
    await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })
    const block = await buildEarlierChaptersBlock({ projectId: 'p1', recentSceneCount: 20 })
    expect(block).toBe('')
  })

  it('only summarises a chapter once ALL of its scenes are outside the window', async () => {
    sceneDigests = makeScenes(7) // 21 scenes; window of 20 starts at scene 2
    await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })
    const block = await buildEarlierChaptersBlock({ projectId: 'p1', recentSceneCount: 20 })
    // Chapter 1 still has scenes 2 and 3 inside the window, so nothing qualifies.
    expect(block).toBe('')
  })

  // The point of the whole exercise: under pressure chapters lose detail, they
  // do not lose their place in the book.
  it('keeps every earlier chapter represented when the budget is tight', async () => {
    sceneDigests = makeScenes(30) // 90 scenes → chapters 1..23 fall outside
    await rollupProjectDigests({ projectId: 'p1', volumeId: 'v1' })

    const generous = await buildEarlierChaptersBlock({ projectId: 'p1', budgetTokens: 4000 })
    const tight = await buildEarlierChaptersBlock({ projectId: 'p1', budgetTokens: 200 })

    const chaptersIn = (s) => (s.match(/^Chapter \d+:/gm) || []).length
    expect(chaptersIn(tight)).toBe(chaptersIn(generous)) // same chapters…
    expect(tight.length).toBeLessThan(generous.length) // …less detail
    expect(chaptersIn(tight)).toBeGreaterThan(20)
    expect(tight).toContain('Chapter 1:') // the oldest chapter survives
  })

  it('returns empty rather than throwing when digests are unreadable', async () => {
    sceneDigests = null
    await expect(buildEarlierChaptersBlock({ projectId: 'p1' })).resolves.toBe('')
  })

  it('ignores scenes with no chapter or scene number', async () => {
    sceneDigests = [{ projectId: 'p1', subsectionId: 's', contentHash: 'h', summary: 'orphan' }]
    const block = await buildEarlierChaptersBlock({ projectId: 'p1' })
    expect(block).toBe('')
  })
})
