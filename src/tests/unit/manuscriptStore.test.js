import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// Simple direct import without complex mocks
import { useManuscriptStore } from '@/stores/manuscriptStore'

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
})
