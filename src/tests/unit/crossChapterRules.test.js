import { describe, it, expect } from 'vitest'
import { checkCrossChapterResurrection } from '@/services/generation/crossChapterRules'

// Pass-2 resurrection semantics: only the spanning case reports, as a
// warning. Same-chapter pairs belong to Pass 1's scene rule; both-unplaced
// pairs already ran together in Pass 1's null group; an explicit revival
// clears the death — all three must stay silent here.

let seq = 0
const st = (over = {}) => ({
  projectId: 'p1',
  entityType: 'character',
  entityId: '~kael',
  entityName: 'Kael',
  sceneId: `s${++seq}`,
  sceneNumber: 1,
  chapterNumber: 1,
  sourceFacts: [],
  stateHash: 'h',
  version: 1,
  updatedAt: 'T',
  ...over
})
const flags = (over = {}) => ({
  present: false,
  status: 'unknown',
  condition: 'intact',
  location: null,
  attributes: {},
  knows: [],
  ...over
})

describe('checkCrossChapterResurrection', () => {
  it('warns on death in one chapter and presence in a later one', () => {
    const out = checkCrossChapterResurrection([
      st({ sceneId: 's1', chapterNumber: 1, state: flags({ status: 'dead' }) }),
      st({ sceneId: 's2', chapterNumber: 3, state: flags({ present: true, status: 'healthy' }) })
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      type: 'dead_then_alive',
      severity: 'warning',
      sceneIds: ['s1', 's2']
    })
    expect(out[0].evidence).toEqual([])
  })

  it('stays silent on same-chapter pairs (Pass 1 owns those)', () => {
    expect(
      checkCrossChapterResurrection([
        st({ sceneId: 's1', chapterNumber: 2, state: flags({ status: 'dead' }) }),
        st({ sceneId: 's2', chapterNumber: 2, state: flags({ present: true, status: 'healthy' }) })
      ])
    ).toEqual([])
  })

  it('stays silent when both sides are unplaced (Pass 1 null group owns those)', () => {
    expect(
      checkCrossChapterResurrection([
        st({ sceneId: 's1', chapterNumber: null, state: flags({ status: 'dead' }) }),
        st({
          sceneId: 's2',
          chapterNumber: null,
          state: flags({ present: true, status: 'healthy' })
        })
      ])
    ).toEqual([])
  })

  it('reports a null-to-placed span rather than dropping it', () => {
    const out = checkCrossChapterResurrection([
      st({ sceneId: 'sx', chapterNumber: null, state: flags({ status: 'dead' }) }),
      st({ sceneId: 's1', chapterNumber: 1, state: flags({ present: true, status: 'healthy' }) })
    ])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('warning')
  })

  it('an explicit revival clears the death', () => {
    expect(
      checkCrossChapterResurrection([
        st({ sceneId: 's1', chapterNumber: 1, state: flags({ status: 'dead' }) }),
        st({
          sceneId: 's2',
          chapterNumber: 2,
          state: flags({ status: 'alive' }),
          sourceFacts: ['Kael is revived by the choir']
        }),
        st({ sceneId: 's3', chapterNumber: 3, state: flags({ present: true, status: 'healthy' }) })
      ])
    ).toEqual([])
  })
})
