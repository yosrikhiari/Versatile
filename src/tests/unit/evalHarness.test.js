import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerateJson = vi.fn()

vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: (...args) => mockAiGenerateJson(...args)
}))

let runEvalHarness
let useEvalStore
let useCostTrackingStore

const variant1 = { id: 'v1', provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' }
const variant2 = {
  id: 'v2',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  label: 'Claude Sonnet'
}

beforeEach(async () => {
  localStorage.removeItem('versatile-cost-logs')
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const harnessMod = await import('@/composables/useEvalHarness')
  runEvalHarness = harnessMod.runEvalHarness
  const evalMod = await import('@/stores/evalStore')
  useEvalStore = evalMod.useEvalStore
  const costMod = await import('@/stores/costTrackingStore')
  useCostTrackingStore = costMod.useCostTrackingStore
})

describe('runEvalHarness', () => {
  it('returns one result per variant', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({ score: 8, dimensionScores: { clarity: 8 } })
      .mockResolvedValueOnce({ score: 6, dimensionScores: { clarity: 6 } })
    const results = await runEvalHarness('Test prompt', [variant1, variant2])
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.variantId)).toEqual(['v1', 'v2'])
  })

  it('results sorted by score descending', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({ score: 6, dimensionScores: { clarity: 6 } })
      .mockResolvedValueOnce({ score: 9, dimensionScores: { clarity: 9 } })
    const results = await runEvalHarness('Test prompt', [variant1, variant2])
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
    expect(results[0].variantId).toBe('v2')
  })

  it('each result has required metrics', async () => {
    mockAiGenerateJson.mockResolvedValue({ score: 7, dimensionScores: { clarity: 7 } })
    const results = await runEvalHarness('Test prompt', [variant1])
    expect(results[0]).toMatchObject({
      variantId: 'v1',
      provider: 'openai',
      model: 'gpt-4o',
      score: 7,
      dimensionScores: { clarity: 7 }
    })
    expect(typeof results[0].latencyMs).toBe('number')
    expect(results[0].latencyMs).toBeGreaterThanOrEqual(0)
    expect(typeof results[0].cost).toBe('number')
    expect(results[0].tokenCount).toMatchObject({
      input: expect.any(Number),
      output: expect.any(Number)
    })
  })

  it('stores results in evalStore tagged with harnessRunId', async () => {
    mockAiGenerateJson.mockResolvedValue({ score: 7, dimensionScores: {} })
    await runEvalHarness('Test prompt', [variant1])
    const store = useEvalStore()
    expect(store.results).toHaveLength(1)
    expect(store.results[0]).toMatchObject({ variantId: 'v1', score: 7 })
    expect(store.results[0].harnessRunId).toBeDefined()
    expect(store.results[0].harnessRunId).toMatch(/^harness-/)
  })

  it('logs costs to costTrackingStore with feature eval-harness', async () => {
    mockAiGenerateJson.mockResolvedValue({ score: 7, dimensionScores: {} })
    await runEvalHarness('Test prompt', [variant1])
    const store = useCostTrackingStore()
    const harnessCosts = store.sessionLog.filter((e) => e.feature === 'eval-harness')
    expect(harnessCosts).toHaveLength(1)
    expect(harnessCosts[0].model).toBe('gpt-4o')
    expect(harnessCosts[0].provider).toBe('openai')
    expect(harnessCosts[0].cost).toBeGreaterThan(0)
  })

  it('handles variant errors gracefully without aborting the run', async () => {
    mockAiGenerateJson
      .mockResolvedValueOnce({ score: 8, dimensionScores: { coherence: 8 } })
      .mockRejectedValueOnce(new Error('API unavailable'))
    const results = await runEvalHarness('Test prompt', [variant1, variant2])
    expect(results).toHaveLength(2)
    expect(results[0].error).toBeUndefined()
    expect(results[1].error).toBe('API unavailable')
    expect(results[1].score).toBe(0)
  })
})
