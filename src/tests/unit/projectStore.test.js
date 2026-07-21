import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/projectStore'
import * as dbService from '@/services/dbService'

// Mock dbService
vi.mock('@/services/dbService', () => ({
  getProject: vi.fn(),
  updateProject: vi.fn(),
  createProject: vi.fn(),
  getManuscript: vi.fn(),
  saveManuscript: vi.fn(),
  getDailyGoal: vi.fn(),
  setDailyGoal: vi.fn(),
  getStreakData: vi.fn(),
  getLastSessionData: vi.fn(),
  updateDailyWordCount: vi.fn(),
  countWords: vi.fn((text) => text.split(/\s+/).filter((w) => w.length > 0).length)
}))

describe('projectStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const store = useProjectStore()

    expect(store.currentProjectId).toBeNull()
    expect(store.documentContent).toBe('')
    expect(store.wordCount).toBe(0)
    expect(store.sessionWordCount).toBe(0)
    expect(store.dailyGoal).toBe(500)
    expect(store.sessionGoal).toBe(500)
    expect(store.currentStreak).toBe(0)
  })

  it('should create new project and load it', async () => {
    const store = useProjectStore()
    const mockProjectId = 'test-project-1'

    dbService.createProject.mockResolvedValue(mockProjectId)
    dbService.getProject.mockResolvedValue({
      id: mockProjectId,
      name: 'Test Project',
      category: 'Fantasy',
      description: 'A test'
    })
    dbService.getManuscript.mockResolvedValue({ content: '<p>Hello</p>', wordCount: 1 })
    dbService.getDailyGoal.mockResolvedValue(500)
    dbService.getStreakData.mockResolvedValue({ currentStreak: 0, longestStreak: 0 })
    dbService.getLastSessionData.mockResolvedValue(null)

    await store.createNewProject('Test Project', 'Fantasy', 'A test')

    expect(store.currentProjectId).toBe(mockProjectId)
    expect(store.currentProjectName).toBe('Test Project')
    expect(store.currentCategory).toBe('Fantasy')
    expect(dbService.createProject).toHaveBeenCalledWith('Test Project', 'Fantasy', 'A test')
  })

  it('should update content and recalculate word count', () => {
    vi.useFakeTimers()
    const store = useProjectStore()
    const content = '<p>Hello world this is a test</p>'

    store.updateContent(content)

    expect(store.documentContent).toBe(content)

    vi.advanceTimersByTime(300)
    expect(store.wordCount).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('should calculate session progress correctly', () => {
    const store = useProjectStore()
    store.sessionGoal = 1000
    store.sessionWordCount = 250

    const expectedProgress = Math.round((250 / 1000) * 100)
    expect(store.sessionProgress).toBe(expectedProgress)
  })

  it('should calculate daily progress correctly', () => {
    const store = useProjectStore()
    store.dailyGoal = 500
    store.dailyWordCount = 125

    const expectedProgress = Math.round((125 / 500) * 100)
    expect(store.dailyProgress).toBe(expectedProgress)
  })

  it('should save manuscript without debounce', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-id'
    store.documentContent = '<p>Content</p>'
    store.wordCount = 2

    await store.saveDocumentDebounced()

    expect(dbService.saveManuscript).toHaveBeenCalledWith('test-id', '<p>Content</p>')
  })
})
