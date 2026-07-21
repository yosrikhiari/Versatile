import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockFork = vi.fn()
const mockGetSections = vi.fn()
const mockGetSubsections = vi.fn()
const mockUpdateSubsection = vi.fn()
const mockAiGenerate = vi.fn()
const mockSetActiveBranch = vi.fn()

vi.mock('@/services/dbService', () => ({
  forkWithDivergence: (...args) => mockFork(...args),
  getSections: (...args) => mockGetSections(...args),
  getSubsections: (...args) => mockGetSubsections(...args),
  updateSubsection: (...args) => mockUpdateSubsection(...args)
}))

vi.mock('@/composables/useAiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' }
}))

vi.mock('@/stores/branchStore', () => ({
  useBranchStore: () => ({
    setActiveBranch: (...args) => mockSetActiveBranch(...args)
  })
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({})
}))

let useWhatIfGenerator
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useWhatIfGenerator')
  useWhatIfGenerator = mod.useWhatIfGenerator
})

const mockBranch = { id: 'branch-2', name: 'what-if-test', status: 'divergent' }
const mockSections = [
  { id: 'sec-1', title: 'Chapter 1', order: 1 },
  { id: 'sec-2', title: 'Chapter 2', order: 2 }
]
const mockSubsections = [
  { id: 'sub-1', title: 'Scene 1', contentStatus: 'divergent', summary: 'Opening scene' },
  { id: 'sub-2', title: 'Scene 2', contentStatus: 'divergent', summary: 'Rising action' }
]

describe('generate', () => {
  it('forks branch, generates content for each divergent sub, switches branch', async () => {
    mockFork.mockResolvedValue(mockBranch)
    mockGetSections.mockResolvedValue(mockSections)
    mockGetSubsections
      .mockResolvedValueOnce(mockSubsections)
      .mockResolvedValueOnce([])
    mockAiGenerate
      .mockResolvedValueOnce('Generated prose for Scene 1')
      .mockResolvedValueOnce('Generated prose for Scene 2')

    const { generate } = useWhatIfGenerator()
    const result = await generate('proj-1', 'branch-1', 'dark turn')

    expect(mockFork).toHaveBeenCalledWith('proj-1', 'branch-1', 'dark turn')
    expect(mockGetSections).toHaveBeenCalledWith('proj-1', mockBranch.id)
    expect(mockAiGenerate).toHaveBeenCalledTimes(2)
    expect(mockUpdateSubsection).toHaveBeenCalledTimes(2)
    expect(mockUpdateSubsection).toHaveBeenCalledWith('sub-1', { content: 'Generated prose for Scene 1', contentStatus: 'generated' })
    expect(mockUpdateSubsection).toHaveBeenCalledWith('sub-2', { content: 'Generated prose for Scene 2', contentStatus: 'generated' })
    expect(mockSetActiveBranch).toHaveBeenCalledWith(mockBranch.id)
    expect(result).toEqual(mockBranch)
  })

  it('sets isGenerating ref correctly', async () => {
    let resolve
    mockFork.mockReturnValue(new Promise((r) => (resolve = r)))
    mockGetSections.mockResolvedValue([])

    const { isGenerating, generate } = useWhatIfGenerator()
    const promise = generate('proj-1', 'branch-1', 'test')
    expect(isGenerating.value).toBe(true)
    resolve(mockBranch)
    await promise
    expect(isGenerating.value).toBe(false)
  })

  it('tracks progress during generation', async () => {
    mockFork.mockResolvedValue(mockBranch)
    mockGetSections.mockResolvedValue(mockSections)
    mockGetSubsections
      .mockResolvedValueOnce(mockSubsections)
      .mockResolvedValueOnce([])
    mockAiGenerate.mockResolvedValue('Generated prose')

    const { generate, progress } = useWhatIfGenerator()
    await generate('proj-1', 'branch-1', 'test')
    expect(progress.value.current).toBe(2)
    expect(progress.value.total).toBe(2)
  })

  it('throws and sets error on failure', async () => {
    mockFork.mockRejectedValue(new Error('Fork failed'))
    const { generate, error } = useWhatIfGenerator()
    await expect(generate('proj-1', 'branch-1', 'test')).rejects.toThrow()
    expect(error.value).toBe('Fork failed')
  })

  it('only generates for divergent subsections', async () => {
    mockFork.mockResolvedValue(mockBranch)
    mockGetSections.mockResolvedValue(mockSections)
    mockGetSubsections
      .mockResolvedValueOnce([
        { id: 'sub-1', title: 'Divergent scene', contentStatus: 'divergent' },
        { id: 'sub-2', title: 'Normal scene', contentStatus: 'generated' }
      ])
      .mockResolvedValueOnce([])
    mockAiGenerate.mockResolvedValue('Generated prose')

    const { generate } = useWhatIfGenerator()
    await generate('proj-1', 'branch-1', 'test')

    expect(mockAiGenerate).toHaveBeenCalledTimes(1)
    expect(mockUpdateSubsection).toHaveBeenCalledTimes(1)
    expect(mockUpdateSubsection).toHaveBeenCalledWith('sub-1', expect.any(Object))
  })
})

describe('reset', () => {
  it('clears all state', () => {
    const { isGenerating, progress, error, reset } = useWhatIfGenerator()
    isGenerating.value = true
    progress.value = { current: 5, total: 10, label: 'Writing...' }
    error.value = 'Something broke'
    reset()
    expect(isGenerating.value).toBe(false)
    expect(progress.value).toEqual({ current: 0, total: 0, label: '' })
    expect(error.value).toBeNull()
  })
})
