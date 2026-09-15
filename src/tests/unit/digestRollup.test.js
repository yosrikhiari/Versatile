import { describe, it, expect } from 'vitest'
import { buildChapterDigest } from '@/services/generation/digestRollup'

describe('buildChapterDigest', () => {
  it('reads its scene summaries as sentences, once each, not as a pipe-separated line', () => {
    const digest = buildChapterDigest({
      projectId: 'p1',
      chapterNumber: 1,
      volumeId: 'v1',
      sceneDigests: [
        { subsectionId: 1, summary: 'Ilse counts the boats', contentHash: 'a', wordCount: 400 },
        { subsectionId: 2, summary: 'Ilse counts the boats', contentHash: 'b', wordCount: 300 },
        { subsectionId: 3, summary: 'Tomas lies to her.', contentHash: 'c', wordCount: 300 }
      ]
    })
    expect(digest.summary).toBe('Ilse counts the boats. Tomas lies to her.')
    expect(digest.summary).not.toContain(' | ')
  })
})
