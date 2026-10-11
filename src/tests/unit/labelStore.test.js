import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLabelStore } from '@/stores/labelStore'
import * as dbLabels from '@/services/db-labels'

vi.mock('@/services/db-labels', () => ({
  saveSceneLabel: vi.fn((input) =>
    Promise.resolve({ ...input, id: 'test-id-1', createdAt: '2026-01-01T00:00:00Z' })
  ),
  getSceneLabelsByStory: vi.fn(() => Promise.resolve([])),
  getSceneLabelsByReviewer: vi.fn(() => Promise.resolve([])),
  deleteSceneLabel: vi.fn(() => Promise.resolve()),
  clearSceneLabels: vi.fn(() => Promise.resolve())
}))

describe('labelStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useLabelStore()
  })

  it('starts with no labels', () => {
    expect(store.labels).toHaveLength(0)
    expect(store.loading).toBe(false)
  })

  it('upserts a label', async () => {
    await store.upsert({
      storyId: 'story-1',
      sceneTitle: 'Scene 1',
      reviewerName: 'reviewer-a',
      overallLabel: 'pass',
      dimensionLabels: { continuity: 'fine' },
      dimensionScores: { continuity: 8 },
      notes: 'Good scene',
      wordCount: 500,
      sceneExcerpt: 'It was a dark night...'
    })
    expect(store.labels).toHaveLength(1)
    expect(store.labels[0].overallLabel).toBe('pass')
    expect(dbLabels.saveSceneLabel).toHaveBeenCalledOnce()
  })

  it('removes a label', async () => {
    await store.upsert({
      storyId: 'story-1',
      sceneTitle: 'Scene 1',
      reviewerName: 'reviewer-a',
      overallLabel: 'pass',
      dimensionLabels: {},
      dimensionScores: {},
      notes: '',
      wordCount: 100,
      sceneExcerpt: ''
    })
    await store.remove('test-id-1')
    expect(store.labels).toHaveLength(0)
    expect(dbLabels.deleteSceneLabel).toHaveBeenCalledWith('test-id-1')
  })

  it('clears all labels', async () => {
    await store.upsert({
      storyId: 'story-1',
      sceneTitle: 'Scene 1',
      reviewerName: 'reviewer-a',
      overallLabel: 'rewrite',
      dimensionLabels: {},
      dimensionScores: {},
      notes: '',
      wordCount: 100,
      sceneExcerpt: ''
    })
    await store.clear()
    expect(store.labels).toHaveLength(0)
    expect(dbLabels.clearSceneLabels).toHaveBeenCalledOnce()
  })
})
