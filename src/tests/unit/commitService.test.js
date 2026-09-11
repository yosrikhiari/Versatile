import { describe, it, expect, vi } from 'vitest'
import { CommitService } from '@/composables/generation/commit/CommitService'

// buildManuscript's scope guard: only sections created in THIS run get
// chapter-level content aggregation, so hand-written chapters are never
// clobbered. These pin the guard in both directions. (The live defect was
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
  it('aggregates run-created sections ordered with word sums', async () => {
    const { svc, updated } = serviceWith(sections, bySection, new Set(['run-ch1']))
    await svc.buildManuscript([], [])
    expect(updated).toHaveLength(1)
    expect(updated[0][0]).toBe('run-ch1')
    expect(updated[0][1]).toMatchObject({ wordCount: 4, status: 'generated' })
    expect(updated[0][1].content).toContain('<hr>')
    expect(updated[0][1].content.indexOf('Second part')).toBeLessThan(
      updated[0][1].content.indexOf('First.')
    )
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
