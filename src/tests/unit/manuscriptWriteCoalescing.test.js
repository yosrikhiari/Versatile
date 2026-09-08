import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import * as dbService from '@/services/dbService'

// Mock only the two writes under test; everything else is an inert stub.
vi.mock('@/services/dbService', () => ({
  getSections: vi.fn(),
  addSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  getSubsections: vi.fn(),
  addSubsection: vi.fn(),
  updateSubsection: vi.fn(),
  deleteSubsection: vi.fn(),
  reorderSubsections: vi.fn(),
  reorderSections: vi.fn(),
  getStoryElements: vi.fn(),
  addStoryElement: vi.fn(),
  addStoryElementsBatch: vi.fn(),
  updateStoryElement: vi.fn(),
  deleteStoryElement: vi.fn(),
  getCharacterRelationships: vi.fn(),
  addCharacterRelationship: vi.fn(),
  updateCharacterRelationship: vi.fn(),
  deleteCharacterRelationship: vi.fn()
}))

describe('manuscriptStore write coalescing', () => {
  let store

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    store = useManuscriptStore()
    vi.clearAllMocks()
  })

  afterEach(() => {
    // Drain pending coalescing/style-guide timers so none leak into later suites.
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('single section update writes through immediately', async () => {
    store.sections = [{ id: 's1', title: 'A' }]

    await store.updateSectionData('s1', { title: 'B' })

    expect(dbService.updateSection).toHaveBeenCalledTimes(1)
    expect(dbService.updateSection).toHaveBeenCalledWith('s1', { title: 'B' })
    expect(store.sections[0].title).toBe('B')
  })

  it('rapid burst to the same section coalesces into one trailing write', async () => {
    store.sections = [{ id: 's1', title: 'A' }]

    const p1 = store.updateSectionData('s1', { title: 'B' })
    const p2 = store.updateSectionData('s1', { title: 'C' })
    const p3 = store.updateSectionData('s1', { status: 'done' })
    await p1
    expect(dbService.updateSection).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    await p2
    await p3

    expect(dbService.updateSection).toHaveBeenCalledTimes(2)
    expect(dbService.updateSection).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({ title: 'C', status: 'done' })
    )
    expect(store.sections[0]).toMatchObject({ title: 'C', status: 'done' })
  })

  it('bursts to different subsections do not coalesce across ids', async () => {
    store.subsections = [
      { id: 'sc1', content: 'a' },
      { id: 'sc2', content: 'b' }
    ]

    await store.updateSubsectionData('sc1', { content: 'a2' })
    await store.updateSubsectionData('sc2', { content: 'b2' })

    expect(dbService.updateSubsection).toHaveBeenCalledTimes(2)
    expect(store.subsections[0].content).toBe('a2')
    expect(store.subsections[1].content).toBe('b2')
  })
})
