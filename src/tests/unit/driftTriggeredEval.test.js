import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDriftTriggeredEval } from '@/composables/useDriftTriggeredEval'

const mockAnalyze = vi.fn()
let mockDriftReport = null
let mockFlaggedRegressions = []
let mockHasDrift = false

vi.mock('@/composables/useDriftMonitor', () => ({
  useDriftMonitor: vi.fn(() => ({
    analyze: mockAnalyze,
    driftReport: { value: mockDriftReport },
    flaggedRegressions: { value: mockFlaggedRegressions },
    hasDrift: { value: mockHasDrift },
    clear: vi.fn()
  }))
}))

function createMockSceneEval() {
  return { evaluate: vi.fn().mockResolvedValue({ score: 8 }) }
}

function setupDriftState({ regressions, hasDrift, report }) {
  mockFlaggedRegressions.length = 0
  mockFlaggedRegressions.push(...(regressions || []))
  mockHasDrift = hasDrift ?? regressions?.length > 0
  mockDriftReport = report ?? { generatedAt: new Date().toISOString() }
}

const mockScenes = [
  { prose: 'Scene one text.', title: 'Scene 1' },
  { prose: 'Scene two text.', title: 'Scene 2' }
]

describe('useDriftTriggeredEval', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFlaggedRegressions.length = 0
    mockDriftReport = null
    mockHasDrift = false
  })

  it('returns not triggered when projectId is missing', async () => {
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({ scenes: mockScenes, workspaceType: 'creative' })
    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('missing params')
    expect(sceneEval.evaluate).not.toHaveBeenCalled()
  })

  it('returns not triggered when scenes is empty', async () => {
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: [],
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('missing params')
    expect(sceneEval.evaluate).not.toHaveBeenCalled()
  })

  it('returns not triggered when sceneEval is falsy', async () => {
    const monitor = useDriftTriggeredEval(null)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('missing params')
  })

  it('returns not triggered when analyze returns null', async () => {
    mockAnalyze.mockResolvedValue(null)
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('no drift')
    expect(sceneEval.evaluate).not.toHaveBeenCalled()
  })

  it('returns not triggered when hasDrift is false despite report', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [],
      hasDrift: false,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('no drift')
    expect(sceneEval.evaluate).not.toHaveBeenCalled()
  })

  it('returns not triggered when no regressions match workspaceType', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'technical', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(false)
    expect(result.reason).toContain('no regressions for workspace')
    expect(sceneEval.evaluate).not.toHaveBeenCalled()
  })

  it('triggers re-evaluation when regressions match workspaceType', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(true)
    expect(result.action).toBeDefined()
    expect(result.action.regressedDims).toEqual(['pacing'])
    expect(result.action.reEvaluatedScenes).toBe(2)
    expect(sceneEval.evaluate).toHaveBeenCalledTimes(2)
  })

  it('passes extraFocusInstructions with regressed dimension names', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [
        { dimension: 'pacing', workspaceType: 'creative', severity: 'medium' },
        { dimension: 'emotional_goal', workspaceType: 'creative', severity: 'high' }
      ],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    await monitor.check({ projectId: 'proj-1', scenes: mockScenes, workspaceType: 'creative' })
    const focusArg = sceneEval.evaluate.mock.calls[0][7]
    expect(focusArg).toContain('pacing')
    expect(focusArg).toContain('emotional_goal')
    expect(focusArg).toContain('regressed')
  })

  it('includes scenePlanItem param when provided', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const scenePlanItems = [{ goal: 'test goal 1' }, { goal: 'test goal 2' }]
    await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative',
      scenePlanItems
    })
    expect(sceneEval.evaluate).toHaveBeenCalledTimes(2)
    expect(sceneEval.evaluate.mock.calls[0][2]).toEqual({ goal: 'test goal 1' })
    expect(sceneEval.evaluate.mock.calls[1][2]).toEqual({ goal: 'test goal 2' })
  })

  it('filters only regressions matching workspaceType when mixed', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [
        { dimension: 'pacing', workspaceType: 'creative', severity: 'medium' },
        { dimension: 'clarity', workspaceType: 'technical', severity: 'high' },
        { dimension: 'voice', severity: 'low' },
        { dimension: 'emotional_goal', workspaceType: 'creative', severity: 'low' }
      ],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(true)
    expect(result.action.regressedDims).toEqual(
      expect.arrayContaining(['pacing', 'voice', 'emotional_goal'])
    )
    expect(result.action.regressedDims).not.toContain('clarity')
  })

  it('deduplicates repeated regression dimensions', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [
        { dimension: 'pacing', workspaceType: 'creative', severity: 'medium' },
        { dimension: 'pacing', workspaceType: 'creative', severity: 'high' }
      ],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.action.regressedDims).toEqual(['pacing'])
  })

  it('tracks triggered actions in reactive array', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    expect(monitor.triggeredActions.value.length).toBe(0)
    expect(monitor.hasRecentTriggers.value).toBe(false)

    await monitor.check({ projectId: 'proj-1', scenes: mockScenes, workspaceType: 'creative' })

    expect(monitor.triggeredActions.value.length).toBe(1)
    expect(monitor.hasRecentTriggers.value).toBe(true)
    expect(monitor.recentTriggers.value.length).toBe(1)
    expect(monitor.lastCheckResult.value.triggered).toBe(true)
  })

  it('clearTriggers resets all state', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    await monitor.check({ projectId: 'proj-1', scenes: mockScenes, workspaceType: 'creative' })
    expect(monitor.triggeredActions.value.length).toBe(1)

    monitor.clearTriggers()
    expect(monitor.triggeredActions.value.length).toBe(0)
    expect(monitor.hasRecentTriggers.value).toBe(false)
    expect(monitor.lastCheckResult.value).toBeNull()
  })

  it('handles analyze throwing an error gracefully', async () => {
    mockAnalyze.mockRejectedValue(new Error('network error'))
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    const result = await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('network error')
    expect(sceneEval.evaluate).not.toHaveBeenCalled()
  })

  it('sets isChecking during execution', async () => {
    mockAnalyze.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { generatedAt: new Date().toISOString() }
    })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)

    expect(monitor.isChecking.value).toBe(false)
    const promise = monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    await promise
    expect(monitor.isChecking.value).toBe(false)
  })

  it('passes storyBible and chapterLog through to evaluate', async () => {
    mockAnalyze.mockResolvedValue({ generatedAt: new Date().toISOString() })
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)
    await monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative',
      storyBible: 'my bible',
      chapterLog: 'my log'
    })
    expect(sceneEval.evaluate.mock.calls[0][5]).toBe('my bible')
    expect(sceneEval.evaluate.mock.calls[0][6]).toBe('my log')
  })

  it('isChecking toggles correctly', async () => {
    let resolveAnalyze
    mockAnalyze.mockReturnValue(
      new Promise((r) => {
        resolveAnalyze = r
      })
    )
    setupDriftState({
      regressions: [{ dimension: 'pacing', workspaceType: 'creative', severity: 'medium' }],
      hasDrift: true,
      report: { generatedAt: new Date().toISOString() }
    })
    const sceneEval = createMockSceneEval()
    const monitor = useDriftTriggeredEval(sceneEval)

    const checkPromise = monitor.check({
      projectId: 'proj-1',
      scenes: mockScenes,
      workspaceType: 'creative'
    })
    expect(monitor.isChecking.value).toBe(true)

    resolveAnalyze({ generatedAt: new Date().toISOString() })
    await checkPromise
    expect(monitor.isChecking.value).toBe(false)
  })
})
