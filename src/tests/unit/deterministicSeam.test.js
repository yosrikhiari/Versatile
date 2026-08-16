import { describe, it, expect } from 'vitest'
import {
  checkSeamContinuity,
  runDeterministicContradictionChecks
} from '@/services/generation/deterministicContradictions'

// Rule 7 (seam continuity): a scene with no carried cast is a discontinuity;
// a carried cast (even when it travels) is not.

let seq = 0
const mk = (over = {}) => ({
  projectId: 'p1',
  entityType: 'character',
  entityId: over.entityId ?? '1',
  entityName: over.entityName ?? 'Kael',
  sceneId: over.sceneId ?? `s${++seq}`,
  sceneNumber: over.sceneNumber ?? 1,
  chapterNumber: over.chapterNumber ?? 1,
  sourceFacts: over.sourceFacts ?? [],
  stateHash: 'h',
  version: 1,
  updatedAt: 'T',
  state: {
    present: true,
    status: 'alive',
    condition: 'unknown',
    location: null,
    knows: [],
    attributes: {},
    ...(over.state || {})
  }
})

describe('checkSeamContinuity', () => {
  it('flags a seam with no carried cast as seam_disconnect', () => {
    const states = [
      mk({
        sceneId: 's1',
        chapterNumber: 1,
        entityName: 'Elias',
        state: { present: true, location: 'the Gate' }
      }),
      mk({
        sceneId: 's2',
        chapterNumber: 2,
        entityName: 'Mara',
        state: { present: true, location: 'the Reach' }
      })
    ]
    const out = checkSeamContinuity(states)
    expect(out.some((d) => d.type === 'seam_disconnect')).toBe(true)
  })

  it('does not flag when a character carries over between scenes', () => {
    const states = [
      mk({
        sceneId: 's1',
        chapterNumber: 1,
        entityName: 'Elias',
        state: { present: true, location: 'the Gate' }
      }),
      mk({
        sceneId: 's2',
        chapterNumber: 2,
        entityName: 'Elias',
        state: { present: true, location: 'the Reach' }
      })
    ]
    const out = checkSeamContinuity(states)
    expect(out.some((d) => d.type === 'seam_disconnect')).toBe(false)
  })

  it('does not flag when only one side has a cast', () => {
    const states = [
      mk({
        sceneId: 's1',
        chapterNumber: 1,
        entityName: 'Elias',
        state: { present: true, location: 'the Gate' }
      }),
      mk({
        sceneId: 's2',
        chapterNumber: 2,
        entityName: 'Mara',
        state: { present: false, location: 'the Reach' }
      })
    ]
    // Mara is not present in s2, Elias is not in s2 -> no overlap, but s2 has no
    // present cast, so the rule stays silent (avoids noise on cold opens).
    const out = checkSeamContinuity(states)
    expect(out.some((d) => d.type === 'seam_disconnect')).toBe(false)
  })

  it('is empty for a single scene', () => {
    expect(checkSeamContinuity([mk({ sceneId: 's1' })])).toEqual([])
  })

  it('runs inside runDeterministicContradictionChecks', async () => {
    const states = [
      mk({
        sceneId: 's1',
        chapterNumber: 1,
        entityName: 'Elias',
        state: { present: true, location: 'the Gate' }
      }),
      mk({
        sceneId: 's2',
        chapterNumber: 2,
        entityName: 'Mara',
        state: { present: true, location: 'the Reach' }
      })
    ]
    const out = await runDeterministicContradictionChecks([], [], states)
    expect(out.some((d) => d.type === 'seam_disconnect')).toBe(true)
  })
})
