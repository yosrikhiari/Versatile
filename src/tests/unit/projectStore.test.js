import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/projectStore'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useAuthStore } from '@/stores/authStore'
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
  getTotalBefore: vi.fn(),
  getTodayDateString: vi.fn(() => '2026-10-02'),
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
    // The owner id is part of the call. Omitting it wrote the project with a
    // null userId, and `getAllProjects(userId)` filters on that — so projects
    // created this way disappeared from the workspace and the switcher.
    expect(dbService.createProject).toHaveBeenCalledWith(
      'Test Project',
      '',
      'A test',
      null,
      'Fantasy'
    )
  })

  it('stamps the signed-in local user as the project owner', async () => {
    const auth = useAuthStore()
    auth.localUser = { id: 42, username: 'writer', displayName: 'Writer' }

    const store = useProjectStore()
    dbService.createProject.mockResolvedValue('p-42')
    dbService.getProject.mockResolvedValue({
      id: 'p-42',
      name: 'Owned',
      category: '',
      description: ''
    })
    dbService.getManuscript.mockResolvedValue(null)
    dbService.getDailyGoal.mockResolvedValue(500)
    dbService.getStreakData.mockResolvedValue({ currentStreak: 0, longestStreak: 0 })
    dbService.getLastSessionData.mockResolvedValue(null)

    await store.createNewProject('Owned', '', '')

    expect(dbService.createProject).toHaveBeenCalledWith('Owned', '', '', 42, '')
  })

  it('stores the genre the New project dialog asks for (#67)', async () => {
    const store = useProjectStore()
    dbService.createProject.mockResolvedValue('p-7')
    dbService.getProject.mockResolvedValue({ id: 'p-7', name: 'Salt', category: 'novel' })
    dbService.getManuscript.mockResolvedValue(null)
    dbService.getDailyGoal.mockResolvedValue(500)
    dbService.getStreakData.mockResolvedValue({ currentStreak: 0, longestStreak: 0 })
    dbService.getLastSessionData.mockResolvedValue(null)

    await store.createNewProject('Salt', 'novel', 'A road.', null, 'Historical')

    expect(dbService.createProject).toHaveBeenCalledWith(
      'Salt',
      'Historical',
      'A road.',
      null,
      'novel'
    )
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
    // Session words are derived: manuscript total minus the baseline taken
    // when the session started.
    store.initialWordCount = 100
    store.wordCount = 350
    expect(store.sessionWordCount).toBe(250)

    const expectedProgress = Math.round((250 / 1000) * 100)
    expect(store.sessionProgress).toBe(expectedProgress)
  })

  it('manuscriptWordCount adds the structure to the root document', () => {
    const store = useProjectStore()
    const manuscript = useManuscriptStore()
    store.wordCount = 10
    manuscript.sections = [{ id: 'ch1', content: '<p>a b c</p>', wordCount: 3 }]
    manuscript.subsections = [{ id: 'sc1', sectionId: 'ch1', content: '<p>d e</p>' }]
    expect(store.manuscriptWordCount).toBe(15)
  })

  it('counts the open scene as it is on screen, not as last saved (#14)', () => {
    const store = useProjectStore()
    const manuscript = useManuscriptStore()
    manuscript.sections = [{ id: 1, content: '', wordCount: 0 }]
    manuscript.subsections = [{ id: 1, sectionId: 1, content: '<p>a b</p>', wordCount: 2 }]
    expect(store.manuscriptWordCount).toBe(2)
    manuscript.setLiveWordCount('subsection', 1, 9)
    expect(store.manuscriptWordCount).toBe(9)
    expect(store.dailyWordCount).toBe(9)
    // Keyed by kind: section 1 and scene 1 are different rows.
    manuscript.setLiveWordCount('section', 1, 4)
    expect(store.manuscriptWordCount).toBe(6)
    manuscript.setLiveWordCount(null)
    expect(store.manuscriptWordCount).toBe(2)
  })

  it('should calculate daily progress correctly', () => {
    const store = useProjectStore()
    store.dailyGoal = 500
    store.wordCount = 125

    const expectedProgress = Math.round((125 / 500) * 100)
    expect(store.dailyProgress).toBe(expectedProgress)
  })

  // UX-AUDIT #14: the goal bar was a copy of the whole manuscript's total,
  // written only by the 10 s save. It lagged the header, and a book over the
  // goal read as "goal reached" before a word was written today.
  describe('words written today (#14)', () => {
    async function open(project, { before = null, streak = {} } = {}) {
      const store = useProjectStore()
      dbService.getProject.mockResolvedValue({ id: 'p1', name: 'Salt', ...project })
      dbService.getManuscript.mockResolvedValue({ content: '', wordCount: 0 })
      dbService.getDailyGoal.mockResolvedValue({ goalWords: 500, wordCount: 1500 })
      dbService.getTotalBefore.mockResolvedValue(before)
      dbService.getStreakData.mockResolvedValue({
        currentStreak: 0,
        longestStreak: 0,
        lastWrittenDate: null,
        ...streak
      })
      dbService.getLastSessionData.mockResolvedValue(null)
      await store.loadProject('p1')
      return store
    }

    it('is the live total minus the last earlier day, with no save', async () => {
      const store = await open({}, { before: 1200 })
      store.wordCount = 1200
      expect(store.dailyWordCount).toBe(0)
      expect(store.dailyProgress).toBe(0)
      store.wordCount = 1320
      expect(store.dailyWordCount).toBe(120)
      expect(dbService.updateDailyWordCount).not.toHaveBeenCalled()
    })

    it('counts a whole new project, but not what an import arrived with', async () => {
      const fresh = await open({}, { before: null })
      fresh.wordCount = 300
      expect(fresh.dailyWordCount).toBe(300)

      setActivePinia(createPinia())
      const imported = await open({ source: 'import', importedWords: 40000 }, { before: null })
      imported.wordCount = 40050
      expect(imported.dailyWordCount).toBe(50)
    })

    it('never goes below zero on a day of cutting', async () => {
      const store = await open({}, { before: 1200 })
      store.wordCount = 1000
      expect(store.dailyWordCount).toBe(0)
    })

    it('counts today in the streak from the first word, not the first save', async () => {
      const store = await open(
        {},
        { before: 1200, streak: { currentStreak: 3, lastWrittenDate: '2026-10-01' } }
      )
      store.wordCount = 1200
      expect(store.displayStreak).toBe(3)
      store.wordCount = 1201
      expect(store.displayStreak).toBe(4)
    })

    it('does not count today twice once it is saved', async () => {
      const store = await open(
        {},
        { before: 1200, streak: { currentStreak: 4, lastWrittenDate: '2026-10-02' } }
      )
      store.wordCount = 1300
      expect(store.displayStreak).toBe(4)
    })
  })

  it('should save manuscript without debounce', async () => {
    const store = useProjectStore()
    store.currentProjectId = 'test-id'
    store.documentContent = '<p>Content</p>'
    store.wordCount = 2

    await store.saveDocumentNow()

    expect(dbService.saveManuscript).toHaveBeenCalledWith('test-id', '<p>Content</p>')
  })
})
