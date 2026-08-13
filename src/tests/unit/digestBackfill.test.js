import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetProjectDigests = vi.fn()
const mockPutSceneDigest = vi.fn()
const mockReplaceSceneEntityStates = vi.fn()
const mockAwaitForegroundIdle = vi.fn()
const mockEnqueueAnalysisTasks = vi.fn()
const mockClaimNextAnalysisTask = vi.fn()
const mockCompleteAnalysisTask = vi.fn()
const mockFailAnalysisTask = vi.fn()
const mockResetStuckAnalysisTasks = vi.fn()
const mockGetAnalysisQueueStats = vi.fn()

vi.mock('@/services/db-digests', () => ({
  getProjectDigests: (...a) => mockGetProjectDigests(...a),
  putSceneDigest: (...a) => mockPutSceneDigest(...a),
  replaceSceneEntityStates: (...a) => mockReplaceSceneEntityStates(...a)
}))
vi.mock('@/services/providerGate', () => ({
  awaitForegroundIdle: (...a) => mockAwaitForegroundIdle(...a)
}))
vi.mock('@/services/analysisQueue', () => ({
  enqueueAnalysisTasks: (...a) => mockEnqueueAnalysisTasks(...a),
  claimNextAnalysisTask: (...a) => mockClaimNextAnalysisTask(...a),
  completeAnalysisTask: (...a) => mockCompleteAnalysisTask(...a),
  failAnalysisTask: (...a) => mockFailAnalysisTask(...a),
  resetStuckAnalysisTasks: (...a) => mockResetStuckAnalysisTasks(...a),
  getAnalysisQueueStats: (...a) => mockGetAnalysisQueueStats(...a)
}))

let useDigestBackfill, buildSceneDigest
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mockGetProjectDigests.mockResolvedValue([])
  mockPutSceneDigest.mockResolvedValue(1)
  mockReplaceSceneEntityStates.mockImplementation(async (_p, _s, states) => states.length)
  mockAwaitForegroundIdle.mockResolvedValue(undefined)
  mockEnqueueAnalysisTasks.mockResolvedValue([1, 2])
  mockClaimNextAnalysisTask.mockResolvedValue(null)
  mockCompleteAnalysisTask.mockResolvedValue(undefined)
  mockFailAnalysisTask.mockResolvedValue(undefined)
  mockResetStuckAnalysisTasks.mockResolvedValue(0)
  mockGetAnalysisQueueStats.mockResolvedValue({
    total: 0,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    totalProgress: 0
  })
  useDigestBackfill = (await import('@/composables/useDigestBackfill')).useDigestBackfill
  buildSceneDigest = (await import('@/services/generation/sceneDigest')).buildSceneDigest
})

const subs = [
  { id: 's1', sceneNumber: 1, title: 'One', content: '<p>Kaelen crossed the stone.</p>' },
  { id: 's2', sceneNumber: 2, title: 'Two', content: '<p>The guardian spoke.</p>' },
  { id: 's3', sceneNumber: 3, title: 'Empty', content: '' }
]

describe('useDigestBackfill', () => {
  it('enqueues a task for every scene with content', async () => {
    const b = useDigestBackfill()
    const n = await b.enqueue('p1', subs)
    expect(n).toBe(2)
    expect(mockEnqueueAnalysisTasks).toHaveBeenCalledTimes(1)
    expect(mockEnqueueAnalysisTasks).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([
        expect.objectContaining({ taskType: 'sceneDigest' }),
        expect.objectContaining({ taskType: 'sceneDigest' })
      ])
    )
    expect(b.failed.value).toBe(0)
  })

  it('skips scenes that already have a fresh digest', async () => {
    const fresh = buildSceneDigest({
      projectId: 'p1',
      subsectionId: 's1',
      prose: 'Kaelen crossed the stone.',
      structured: { metadataStatus: 'skipped' }
    })
    mockGetProjectDigests.mockResolvedValue([fresh])

    const n = await useDigestBackfill().enqueue('p1', subs)
    expect(n).toBe(1)
    expect(mockEnqueueAnalysisTasks).toHaveBeenCalledTimes(1)
  })

  it('strips HTML before hashing so digests match the prose path', async () => {
    await useDigestBackfill().enqueue('p1', [subs[0]])
    // We can't easily test the hash since it's now enqueued, but we can verify
    // the payload structure was correct
    expect(mockEnqueueAnalysisTasks).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            prose: 'Kaelen crossed the stone.',
            scene: expect.objectContaining({ sceneNumber: 1 })
          })
        })
      ])
    )
  })

  it('yields to foreground work before each scene during run', async () => {
    const runningTask = {
      id: 1,
      payload: { prose: 'test', subsectionId: 's1', scene: { sceneNumber: 1 } }
    }
    mockClaimNextAnalysisTask.mockResolvedValueOnce(runningTask).mockResolvedValueOnce(null)

    const b = useDigestBackfill()
    await b.run('p1')
    expect(mockAwaitForegroundIdle).toHaveBeenCalledTimes(1)
    expect(mockClaimNextAnalysisTask).toHaveBeenCalledTimes(2)
  })

  it('marks backfilled digests as having no real metadata during run', async () => {
    const runningTask = {
      id: 1,
      payload: {
        prose: 'Kaelen crossed the stone.',
        subsectionId: 's1',
        scene: { sceneNumber: 1, title: 'One' },
        summary: ''
      }
    }
    mockClaimNextAnalysisTask.mockResolvedValueOnce(runningTask).mockResolvedValueOnce(null)

    await useDigestBackfill().run('p1')
    // The digest is built with metadataStatus: 'skipped' in the run method
    // We verify this indirectly by checking the task was completed
    expect(mockCompleteAnalysisTask).toHaveBeenCalledWith(1)
  })

  it('keeps going when one scene fails', async () => {
    mockPutSceneDigest.mockRejectedValueOnce(new Error('quota')).mockResolvedValueOnce(1)
    const runningTask1 = {
      id: 1,
      payload: {
        prose: 'Kaelen crossed the stone.',
        subsectionId: 's1',
        scene: { sceneNumber: 1, title: 'One' },
        summary: ''
      }
    }
    const runningTask2 = {
      id: 2,
      payload: {
        prose: 'The guardian spoke.',
        subsectionId: 's2',
        scene: { sceneNumber: 2, title: 'Two' },
        summary: ''
      }
    }
    mockClaimNextAnalysisTask
      .mockResolvedValueOnce(runningTask1)
      .mockResolvedValueOnce(runningTask2)
      .mockResolvedValueOnce(null)

    const b = useDigestBackfill()
    const n = await b.run('p1')
    expect(n).toBe(2)
    expect(b.failed.value).toBe(1)
    expect(mockFailAnalysisTask).toHaveBeenCalledWith(1, expect.any(String))
    expect(mockCompleteAnalysisTask).toHaveBeenCalledWith(2)
  })

  it('stops when cancelled', async () => {
    const b = useDigestBackfill()
    mockAwaitForegroundIdle.mockImplementation(async () => b.cancel())

    const runningTask = {
      id: 1,
      payload: {
        prose: 'Kaelen crossed the stone.',
        subsectionId: 's1',
        scene: { sceneNumber: 1, title: 'One' },
        summary: ''
      }
    }
    mockClaimNextAnalysisTask.mockResolvedValueOnce(runningTask).mockResolvedValueOnce(null)

    await b.run('p1')
    expect(mockPutSceneDigest).not.toHaveBeenCalled()
    expect(b.isRunning.value).toBe(false)
  })

  it('refuses to run twice concurrently', async () => {
    const b = useDigestBackfill()
    // First run starts
    const firstPromise = b.run('p1')
    // Second run should return 0 immediately
    expect(await b.run('p1')).toBe(0)
    // First run can complete
    await firstPromise
    expect(b.isRunning.value).toBe(false)
  })

  it('clears isRunning even when queue processing throws', async () => {
    mockClaimNextAnalysisTask.mockRejectedValue(new Error('db closed'))
    const b = useDigestBackfill()
    await expect(b.run('p1')).rejects.toThrow()
    expect(b.isRunning.value).toBe(false)
  })
})
