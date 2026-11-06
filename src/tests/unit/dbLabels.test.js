import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/services/db-core'
import { saveSceneLabel } from '@/services/db-labels'

const label = (overrides = {}) => ({
  storyId: 'story-1',
  sceneTitle: 'Chapter 1 / Scene 1',
  reviewerName: 'Reviewer A',
  overallLabel: 'pass',
  dimensionLabels: { continuity: 'fine' },
  dimensionScores: { continuity: 8 },
  notes: '',
  wordCount: 100,
  sceneExcerpt: 'Opening sentence.',
  ...overrides
})

describe('db-labels', () => {
  beforeEach(async () => {
    await db.sceneLabels.clear()
  })

  it('updates the same scene label instead of creating a duplicate', async () => {
    const first = await saveSceneLabel(label())
    const second = await saveSceneLabel(label({ overallLabel: 'revise', notes: 'Tighten this.' }))

    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe(first.createdAt)
    expect(await db.sceneLabels.count()).toBe(1)
    expect((await db.sceneLabels.get(first.id)).overallLabel).toBe('revise')
  })

  it('keeps labels for different scenes by the same reviewer separate', async () => {
    await saveSceneLabel(label())
    await saveSceneLabel(label({ sceneTitle: 'Chapter 1 / Scene 2' }))

    expect(await db.sceneLabels.count()).toBe(2)
  })

  it('keeps the same label when a scene is renamed but its sceneId is stable', async () => {
    const first = await saveSceneLabel(label({ sceneId: 'sub-1', sceneTitle: 'Old title' }))
    const second = await saveSceneLabel(
      label({ sceneId: 'sub-1', sceneTitle: 'Renamed title', overallLabel: 'revise' })
    )

    expect(second.id).toBe(first.id)
    expect(second.sceneTitle).toBe('Renamed title')
    expect(await db.sceneLabels.count()).toBe(1)
  })

  it('adopts a legacy title-labelled row when the stable sceneId arrives', async () => {
    const first = await saveSceneLabel(label({ sceneTitle: 'Old title' }))
    const second = await saveSceneLabel(
      label({ sceneId: 'sub-1', sceneTitle: 'Old title', overallLabel: 'revise' })
    )

    expect(second.id).toBe(first.id)
    expect(second.sceneId).toBe('sub-1')
    expect(await db.sceneLabels.count()).toBe(1)
  })

  it('does not move a label already bound to another scene that shares a title', async () => {
    const first = await saveSceneLabel(
      label({ sceneId: 'sub-1', sceneTitle: 'Prologue', overallLabel: 'pass' })
    )
    await saveSceneLabel(
      label({ sceneId: 'sub-2', sceneTitle: 'Prologue', overallLabel: 'revise' })
    )

    expect(await db.sceneLabels.count()).toBe(2)
    expect((await db.sceneLabels.get(first.id)).sceneId).toBe('sub-1')
    expect((await db.sceneLabels.get(first.id)).overallLabel).toBe('pass')
  })
})
