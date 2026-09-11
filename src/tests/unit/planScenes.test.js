import { describe, it, expect } from 'vitest'
import { mapPlanScene } from '@/services/generation/planScenes'

// The generator rebuilds director scenes field-by-field into its plan, so
// any unnamed field dies in transit (the documented `pov` lesson, repeated
// with `threadIds`: emitted by the director, normalized by its mapper, then
// dropped here — the blob fell back to whole-dump and nobody noticed).
// A shared pure mapper makes the transit testable.

const ctx = { singleChapter: false, structureSpec: null, effectiveWordTarget: 7000, sceneCount: 4 }

describe('mapPlanScene', () => {
  it('preserves the director-emitted threadIds', () => {
    const out = mapPlanScene(
      { title: 'S1', charactersPresent: ['Kael'], threadIds: ['t1', 't2'] },
      0,
      ctx
    )
    expect(out.threadIds).toEqual(['t1', 't2'])
  })

  it('defaults threadIds to [] when the director named none', () => {
    expect(mapPlanScene({ title: 'S1' }, 0, ctx).threadIds).toEqual([])
  })

  it('keeps the established normalizations (numbering, pov fallback, payoff)', () => {
    const out = mapPlanScene(
      { title: '', charactersPresent: ['Kael', 'Mira'], tension: 'high' },
      2,
      ctx
    )
    expect(out).toMatchObject({
      sceneNumber: 3,
      sceneIndex: 3,
      title: 'Scene 3',
      pov: 'Kael',
      payoff: 'none',
      tension: 'high',
      characters: ['Kael', 'Mira']
    })
  })

  it('sizes single-chapter mode at the full word target', () => {
    const out = mapPlanScene({ title: 'S1' }, 0, {
      ...ctx,
      singleChapter: true,
      effectiveWordTarget: 4000
    })
    expect(out.estimatedWords).toBe(4000)
  })
})
