import { describe, it, expect, vi } from 'vitest'
import { CommitService } from '@/composables/generation/commit/CommitService'

// buildManuscript's scope guard: only sections created in THIS run are
// touched, so hand-written chapters are never clobbered. These pin the guard in both directions. (The live defect was
// upstream — the generator never populated or passed the set — fixed
// alongside; the guard itself is pinned here so the fix stays fixed.)

function serviceWith(sections, subsectionsBySection, createdIds) {
  const updated = []
  return {
    // Ref-shaped like the generator's runCreatedSectionIds: a raw Set has
    // no .value, and the constructor normalizes that to empty (skip all).
    svc: new CommitService({
      manuscriptStore: {
        sections,
        subsectionsBySection,
        updateSectionData: vi.fn(async (id, data) => {
          updated.push([id, data])
        })
      },
      runCreatedSectionIds: { value: createdIds }
    }),
    updated
  }
}

const sections = [
  { id: 'run-ch1', title: 'Generated' },
  { id: 'hand-ch9', title: 'Hand-written' }
]
const bySection = {
  'run-ch1': [
    { content: '<p>First.</p>', wordCount: 1, order: 1 },
    { content: '<p>Second part here.</p>', wordCount: 3, order: 0 }
  ],
  'hand-ch9': [{ content: '<p>Mine.</p>', wordCount: 1, order: 0 }]
}

describe('CommitService.buildManuscript scope guard', () => {
  it('marks run-created sections generated without copying their scenes into the body', async () => {
    const { svc, updated } = serviceWith(sections, bySection, new Set(['run-ch1']))
    await svc.buildManuscript([], [])
    expect(updated).toHaveLength(1)
    expect(updated[0][0]).toBe('run-ch1')
    expect(updated[0][1]).toEqual({ status: 'generated' })
    // Prose lives in the scene rows only: a copy here made every counter
    // report the chapter at twice its length.
    expect(updated[0][1]).not.toHaveProperty('content')
    expect(updated[0][1]).not.toHaveProperty('wordCount')
  })

  it('leaves hand-written sections untouched', async () => {
    const { svc, updated } = serviceWith(sections, bySection, new Set(['run-ch1']))
    await svc.buildManuscript([], [])
    expect(updated.map(([id]) => id)).not.toContain('hand-ch9')
  })

  it('aggregates nothing when the run created no sections (empty set default)', async () => {
    const { svc, updated } = serviceWith(sections, bySection, new Set())
    await svc.buildManuscript([], [])
    expect(updated).toHaveLength(0)
  })
})

describe('CommitService.persistCheckpoint', () => {
  it('does not overwrite a stored checkpoint with an empty plan', async () => {
    // Stop clears the plan while the scene in flight is still finishing; its
    // commit used to write writtenCount 1 with scenePlan [], which nothing can
    // resume ("Continue" never appeared after a stop).
    const saveGenRun = vi.fn(async () => {})
    const svc = new CommitService({
      manuscriptStore: { sections: [], subsectionsBySection: {}, updateSectionData: vi.fn() },
      runCreatedSectionIds: { value: new Set() },
      scenePlan: { value: [] },
      writtenScenes: { value: [{ title: 'kept' }] },
      progress: { total: 2 },
      getGenRun: vi.fn(async () => ({ state: { version: 2, scenePlan: [{}, {}], stages: {} } })),
      saveGenRun
    })
    await svc.persistCheckpoint('p1')
    expect(saveGenRun).not.toHaveBeenCalled()
  })
})
