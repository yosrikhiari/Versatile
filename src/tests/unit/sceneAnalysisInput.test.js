import { describe, it, expect } from 'vitest'
import { buildSceneAnalysisInput } from '@/services/generation/sceneAnalysisInput'

// What a committed scene hands the digest layer: writer metadata preferred,
// plan fields as fallback, never undefined. This mapping is the only thing
// standing between a run's output and the earlier-chapters context that
// reads digests back — an unnamed field here repeats the pov/threadIds
// transit-drop class.

describe('buildSceneAnalysisInput', () => {
  it('prefers writer metadata with plan fallbacks', () => {
    const out = buildSceneAnalysisInput({
      projectId: 'p1',
      subsectionId: 'u1',
      chapterNumber: 3,
      prose: 'Mara stood at the landing.',
      structured: { summary: 'Arrival', keyFacts: ['Mara waits'], metadataStatus: 'ok' },
      scene: { title: 'Arrival', charactersPresent: ['Mara'], location: 'Harbor', sceneNumber: 7 }
    })
    expect(out).toMatchObject({
      projectId: 'p1',
      subsectionId: 'u1',
      scene: { sceneNumber: 7, chapterNumber: 3, title: 'Arrival' }
    })
    expect(out.structured.summary).toBe('Arrival')
  })

  it('falls back cleanly when the writer returned no metadata', () => {
    const out = buildSceneAnalysisInput({
      projectId: 'p1',
      subsectionId: 'u2',
      chapterNumber: 1,
      prose: 'Some prose here.',
      structured: undefined,
      scene: {}
    })
    expect(out.scene.sceneNumber).toBeNull()
    expect(out.scene.title).toBe('')
    expect(out.structured).toEqual({})
  })
})
