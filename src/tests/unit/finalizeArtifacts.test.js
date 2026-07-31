import { describe, it, expect, vi } from 'vitest'
import {
  finalizeStoryArtifacts,
  describeFinalizeReport
} from '@/services/generation/finalizeArtifacts'

/**
 * The contract a finished generation run must satisfy: every derived editor
 * surface reflects what was just generated, and nothing the author owns is
 * overwritten.
 */
function makeStores({ storyElements = [], docsResult = ['characters', 'timeline'] } = {}) {
  const added = []
  const manuscriptStore = {
    sortedSections: [
      { id: 's1', title: 'The Arrival', order: 0 },
      { id: 's2', title: 'Cold Water', order: 1 }
    ],
    storyElements,
    addStoryElementsBatchData: vi.fn(async (_pid, rows) => {
      added.push(...rows)
      return rows.map((_, i) => `e${i}`)
    })
  }
  const storyBibleStore = {
    characters: [{ id: 'c1', name: 'Mara' }],
    locations: [{ id: 'l1', name: 'The Lighthouse' }],
    plotThreads: [{ id: 't1', title: 'Who moved the boat' }]
  }
  const storyDocs = {
    regenerateAllDocuments: vi.fn(async () => docsResult),
    rebuildStoryContextDoc: vi.fn(async () => 'doc')
  }
  return { manuscriptStore, storyBibleStore, storyDocs, added }
}

describe('finalizeStoryArtifacts', () => {
  it('populates the canvas from chapters, characters, locations and plot threads', async () => {
    const { manuscriptStore, storyBibleStore, storyDocs, added } = makeStores()
    const report = await finalizeStoryArtifacts({
      projectId: 1,
      manuscriptStore,
      storyBibleStore,
      storyDocs
    })

    expect(report.canvasElements).toBe(5)
    expect(added.map((e) => e.title)).toEqual([
      'The Arrival',
      'Cold Water',
      'Mara',
      'The Lighthouse',
      'Who moved the boat'
    ])
  })

  it('force-refreshes the story bible documents and rebuilds story context', async () => {
    const { manuscriptStore, storyBibleStore, storyDocs } = makeStores()
    const report = await finalizeStoryArtifacts({
      projectId: 1,
      manuscriptStore,
      storyBibleStore,
      storyDocs
    })

    // `force` is what makes this a refresh rather than a fill-in-the-blanks —
    // without it the docs keep describing the pre-run project.
    expect(storyDocs.regenerateAllDocuments).toHaveBeenCalledWith(1, { force: true })
    expect(storyDocs.rebuildStoryContextDoc).toHaveBeenCalledWith(1)
    expect(report.documents).toEqual(['characters', 'timeline'])
    expect(report.storyContextRebuilt).toBe(true)
  })

  it('adds nothing on a second run', async () => {
    const { manuscriptStore, storyBibleStore, storyDocs } = makeStores()
    await finalizeStoryArtifacts({ projectId: 1, manuscriptStore, storyBibleStore, storyDocs })
    // Feed the first run's output back in as existing canvas state.
    manuscriptStore.storyElements = manuscriptStore.addStoryElementsBatchData.mock.calls[0][1]
    const second = await finalizeStoryArtifacts({
      projectId: 1,
      manuscriptStore,
      storyBibleStore,
      storyDocs
    })
    expect(second.canvasElements).toBe(0)
  })

  it('still refreshes documents when the canvas write fails', async () => {
    // Independent failure domains: one derived artifact breaking must not take
    // the others down with it.
    const { manuscriptStore, storyBibleStore, storyDocs } = makeStores()
    manuscriptStore.addStoryElementsBatchData = vi.fn(async () => {
      throw new Error('canvas table locked')
    })

    const report = await finalizeStoryArtifacts({
      projectId: 1,
      manuscriptStore,
      storyBibleStore,
      storyDocs
    })

    expect(report.errors[0]).toMatch(/canvas/)
    expect(report.documents).toEqual(['characters', 'timeline'])
    expect(report.storyContextRebuilt).toBe(true)
  })

  it('still rebuilds story context when the document refresh fails', async () => {
    const { manuscriptStore, storyBibleStore, storyDocs } = makeStores()
    storyDocs.regenerateAllDocuments = vi.fn(async () => {
      throw new Error('docs exploded')
    })

    const report = await finalizeStoryArtifacts({
      projectId: 1,
      manuscriptStore,
      storyBibleStore,
      storyDocs
    })

    expect(report.errors[0]).toMatch(/documents/)
    expect(report.storyContextRebuilt).toBe(true)
  })

  it('never throws, so a derived-artifact failure cannot fail a written volume', async () => {
    await expect(
      finalizeStoryArtifacts({
        projectId: 1,
        manuscriptStore: null,
        storyBibleStore: null,
        storyDocs: { regenerateAllDocuments: null, rebuildStoryContextDoc: null }
      })
    ).resolves.toBeDefined()
  })

  it('is a no-op without a project id', async () => {
    const { manuscriptStore, storyBibleStore, storyDocs } = makeStores()
    const report = await finalizeStoryArtifacts({
      projectId: null,
      manuscriptStore,
      storyBibleStore,
      storyDocs
    })
    expect(report.canvasElements).toBe(0)
    expect(storyDocs.regenerateAllDocuments).not.toHaveBeenCalled()
  })
})

describe('describeFinalizeReport', () => {
  it('summarises a successful run', () => {
    const text = describeFinalizeReport({
      canvasElements: 5,
      documents: ['characters'],
      storyContextRebuilt: true,
      errors: []
    })
    expect(text).toContain('5 canvas elements')
    expect(text).toContain('characters')
    expect(text).toContain('story context rebuilt')
  })

  it('says plainly when nothing needed doing', () => {
    const text = describeFinalizeReport({
      canvasElements: 0,
      documents: [],
      storyContextRebuilt: false,
      errors: []
    })
    expect(text).toContain('already up to date')
    expect(text).toContain('no documents needed refreshing')
  })

  it('surfaces failures rather than hiding them', () => {
    const text = describeFinalizeReport({
      canvasElements: 0,
      documents: [],
      storyContextRebuilt: false,
      errors: ['canvas: boom']
    })
    expect(text).toContain('failed: canvas: boom')
  })
})
