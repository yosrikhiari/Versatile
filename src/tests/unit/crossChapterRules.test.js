import { describe, it, expect } from 'vitest'
import {
  checkCrossChapterResurrection,
  checkVolumeDrift,
  checkVolumeInflux,
  orderVolumesByChapter,
  jaccardDistance
} from '@/services/generation/crossChapterRules'

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

describe('volume drift', () => {
  const vols = [
    {
      volumeId: 'v1',
      charactersPresent: ['Kael', 'Mira', 'Rin', 'Sable'],
      locations: ['Harbor', 'Attic']
    },
    {
      volumeId: 'v2',
      charactersPresent: ['Jax', 'Pell', 'Quill', 'Voss'],
      locations: ['Desert', 'Vault']
    }
  ]
  const chapters = new Map([
    ['v1', [1, 2]],
    ['v2', [3, 4]]
  ])

  it('warns on sharp cast and setting turnover between consecutive volumes', () => {
    const out = checkVolumeDrift(vols, chapters)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ type: 'volume_drift', severity: 'warning', entityId: 'v2' })
    expect(out[0].description).toContain('chapters 1–2')
    expect(out[0].description).toContain('chapters 3–4')
    expect(out[0].sceneIds).toEqual([])
  })

  it('stays silent on a stable cast with one newcomer', () => {
    const out = checkVolumeDrift(
      [
        { volumeId: 'v1', charactersPresent: ['Kael', 'Mira', 'Rin'], locations: ['Harbor'] },
        { volumeId: 'v2', charactersPresent: ['Kael', 'Mira', 'Rin', 'Jax'], locations: ['Harbor'] }
      ],
      chapters
    )
    expect(out).toEqual([])
  })

  it('stays silent on thin pairs that establish nothing', () => {
    expect(checkVolumeDrift([{ volumeId: 'v1' }, { volumeId: 'v2' }])).toEqual([])
  })

  it('flags a slow-bleed cast the pairwise check misses', () => {
    // v1→v2 Jaccard is 0.67 (under the 0.7 pairwise bar) yet half the
    // cast is new both times — influx catches what pairs miss.
    const out = checkVolumeInflux([
      { volumeId: 'v1', charactersPresent: ['Kael', 'Mira'] },
      { volumeId: 'v2', charactersPresent: ['Kael', 'Jax'] },
      { volumeId: 'v3', charactersPresent: ['Pell', 'Quill'] }
    ])
    expect(out.map((r) => r.entityId)).toEqual(['v2', 'v3'])
    expect(out[1]).toMatchObject({ severity: 'warning' })
  })

  it('orders volumes by lowest chapter and never drops unplaced ones', () => {
    const ordered = orderVolumesByChapter(
      [{ volumeId: 'vb' }, { volumeId: 'va' }, { volumeId: 'vx' }],
      [
        { volumeId: 'vb', chapterNumber: 5 },
        { volumeId: 'va', chapterNumber: 1 }
      ]
    )
    expect(ordered.map((v) => v.volumeId)).toEqual(['va', 'vb', 'vx'])
  })

  it('jaccardDistance is 0 for two empty sets', () => {
    expect(jaccardDistance(new Set(), new Set())).toBe(0)
  })
})
