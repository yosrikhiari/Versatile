import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/dbService', () => ({
  restoreSubsection: vi.fn(async () => 'id'),
  deleteSubsection: vi.fn(async () => {}),
  // Unused by these state-focused tests, but imported by the store.
  getSections: vi.fn(async () => []),
  addSection: vi.fn(),
  updateSection: vi.fn(),
  deleteSection: vi.fn(),
  getSubsections: vi.fn(async () => []),
  addSubsection: vi.fn(),
  updateSubsection: vi.fn(),
  reorderSubsections: vi.fn(),
  reorderSections: vi.fn(),
  getStoryElements: vi.fn(async () => []),
  addStoryElement: vi.fn(),
  addStoryElementsBatch: vi.fn(),
  updateStoryElement: vi.fn(),
  deleteStoryElement: vi.fn(),
  getCharacterRelationships: vi.fn(async () => []),
  addCharacterRelationship: vi.fn(),
  updateCharacterRelationship: vi.fn(),
  deleteCharacterRelationship: vi.fn()
}))

import { useManuscriptStore } from '@/stores/manuscriptStore'
import { restoreSubsection } from '@/services/dbService'

describe('manuscriptStore', () => {
  let store

  beforeEach(() => {
    setActivePinia(createPinia())
    store = useManuscriptStore()
    vi.clearAllMocks()
  })

  it('should initialize with empty arrays', () => {
    expect(store.sections).toEqual([])
    expect(store.subsections).toEqual([])
    expect(store.storyElements).toEqual([])
    expect(store.relationships).toEqual([])
    expect(store.activeSectionId).toBeNull()
    expect(store.activeSubsectionId).toBeNull()
  })

  it('should compute sorted sections', () => {
    store.sections = [
      { id: 'ch2', order: 1 },
      { id: 'ch1', order: 0 }
    ]

    const sorted = store.sortedSections
    expect(sorted[0].id).toBe('ch1')
    expect(sorted[1].id).toBe('ch2')
  })

  it('keeps volumes together: order restarts per volume and must not interleave them', () => {
    // Three runs: volume 3 (one chapter), volume 5 (three), volume 6 (one).
    // Sorting on `order` alone put volume 6's chapter third, between volume 5's.
    store.sections = [
      { id: 1, order: 0, volumeId: 3 },
      { id: 5, order: 0, volumeId: 5 },
      { id: 6, order: 1, volumeId: 5 },
      { id: 7, order: 2, volumeId: 5 },
      { id: 8, order: 0, volumeId: 6 }
    ]
    expect(store.sortedSections.map((s) => s.id)).toEqual([1, 5, 6, 7, 8])
  })

  it('counts words across section bodies and subsections', () => {
    store.sections = [
      { id: 'ch1', content: '<p>one two</p>', wordCount: 2 },
      // No stored count: fall back to counting the plain text.
      { id: 'ch2', content: '<p>three</p><p>four five</p>' }
    ]
    store.subsections = [{ id: 'sc1', sectionId: 'ch1', content: '<p>six</p>', wordCount: 1 }]
    expect(store.structuredWordCount).toBe(6)
  })

  it('should compute subsections by section', () => {
    store.subsections = [
      { id: 'sc1', sectionId: 'ch1' },
      { id: 'sc2', sectionId: 'ch2' },
      { id: 'sc3', sectionId: 'ch1' }
    ]

    const subsectionsBySection = store.subsectionsBySection
    expect(subsectionsBySection['ch1']).toHaveLength(2)
    expect(subsectionsBySection['ch2']).toHaveLength(1)
  })

  it('should find active section', () => {
    store.sections = [
      { id: 'ch1', title: 'Section 1' },
      { id: 'ch2', title: 'Section 2' }
    ]
    store.activeSectionId = 'ch1'

    expect(store.activeSection).toBeDefined()
    expect(store.activeSection.id).toBe('ch1')
  })

  it('should find active subsection', () => {
    store.subsections = [
      { id: 'sc1', title: 'Subsection 1' },
      { id: 'sc2', title: 'Subsection 2' }
    ]
    store.activeSubsectionId = 'sc2'

    expect(store.activeSubsection).toBeDefined()
    expect(store.activeSubsection.id).toBe('sc2')
  })

  it('restores a deleted subsection (undo) preserving its record', async () => {
    const record = {
      id: 'sc9',
      sectionId: 'ch1',
      title: 'Lost scene',
      order: 2,
      content: '<p>x</p>'
    }
    store.subsections = [{ id: 'sc1', sectionId: 'ch1', order: 0 }]
    await store.restoreSubsectionData(record)
    expect(restoreSubsection).toHaveBeenCalledWith(record)
    expect(store.subsections.some((s) => s.id === 'sc9' && s.title === 'Lost scene')).toBe(true)
  })

  it('restoreSubsectionData is idempotent when the record is already present', async () => {
    const record = { id: 'sc1', sectionId: 'ch1', order: 0 }
    store.subsections = [record]
    await store.restoreSubsectionData(record)
    expect(store.subsections.filter((s) => s.id === 'sc1')).toHaveLength(1)
  })
})
