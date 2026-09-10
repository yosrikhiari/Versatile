import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/backendAiService', () => ({
  backendStream: vi.fn(),
  backendTestConnection: vi.fn()
}))
vi.mock('@/services/aiProviderBudget', () => ({
  providerBudget: { check: vi.fn(), record: vi.fn() },
  BudgetExceededError: class BudgetExceededError extends Error {}
}))

import { buildCloudBatchInjector } from '@/composables/betareader/cloudContradictions'
import { backendStream } from '@/services/backendAiService'
import { providerBudget, BudgetExceededError } from '@/services/aiProviderBudget'

const local = vi.fn(async () => null)
const base = { provider: 'openai', model: 'gpt-4o-mini', localGenerateJson: local }

describe('buildCloudBatchInjector', () => {
  it('streams cloud, parses, and records budget on success', async () => {
    backendStream.mockResolvedValue(JSON.stringify({ contradictions: [{ severity: 'warning' }] }))
    const inject = buildCloudBatchInjector(base)
    const out = await inject('prompt', 'system', { schema: {}, schemaName: 'x' })
    expect(backendStream).toHaveBeenCalledOnce()
    expect(out).toEqual({ contradictions: [{ severity: 'warning' }] })
    expect(providerBudget.record).toHaveBeenCalledWith(
      'openai',
      expect.any(Number),
      expect.any(Number)
    )
  })

  it('falls back to local when the budget check throws', async () => {
    providerBudget.check.mockImplementationOnce(() => {
      throw new BudgetExceededError('openai', 'x')
    })
    const onFallback = vi.fn()
    const inject = buildCloudBatchInjector({ ...base, onFallback })
    await inject('prompt', 'system', {})
    expect(backendStream).not.toHaveBeenCalled()
    expect(local).toHaveBeenCalledOnce()
    expect(onFallback).toHaveBeenCalledWith(expect.stringMatching(/budget/i))
  })

  it('falls back to local on unparseable cloud output', async () => {
    backendStream.mockResolvedValue('not json at all {{{')
    const inject = buildCloudBatchInjector(base)
    await inject('prompt', 'system', {})
    expect(local).toHaveBeenCalledOnce()
  })
})
