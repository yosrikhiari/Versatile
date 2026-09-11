import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/backendAiService', () => ({
  backendStream: vi.fn(),
  backendTestConnection: vi.fn(async () => ({ success: true, model: 'm', error: null }))
}))
vi.mock('@/services/aiProviderBudget', () => ({
  providerBudget: { check: vi.fn(), record: vi.fn() },
  BudgetExceededError: class BudgetExceededError extends Error {}
}))

import { maybeAutoEscalateScene } from '@/services/cloudEscalation'
import { providerBudget, BudgetExceededError } from '@/services/aiProviderBudget'

const base = {
  projectId: 'p1',
  provider: 'openai',
  model: 'gpt-4o-mini',
  operation: 'escalation-on-failure',
  text: 'Some prose.',
  systemPrompt: 'You are an expert fiction editor.'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('maybeAutoEscalateScene', () => {
  it('requests cloud under audit tier with the project opt-in', async () => {
    const request = vi.fn(async () => ({
      success: true,
      result: 'Second opinion: fine.',
      costEstimate: { inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.001 }
    }))
    const out = await maybeAutoEscalateScene({
      ...base,
      tier: 'cloud-audit',
      cloudAvailable: true,
      projectOptIn: true,
      request
    })
    expect(request).toHaveBeenCalledOnce()
    expect(out.requested).toBe(true)
    expect(out.note).toContain('Second opinion: fine.')
    expect(providerBudget.record).toHaveBeenCalledWith('openai', 120, 0.001)
  })

  it('does not request under on-demand (offer path owns that)', async () => {
    const request = vi.fn()
    const out = await maybeAutoEscalateScene({
      ...base,
      tier: 'cloud-on-demand',
      cloudAvailable: true,
      projectOptIn: false,
      request
    })
    expect(request).not.toHaveBeenCalled()
    expect(out.requested).toBe(false)
  })

  it('does not request without the project opt-in, provider, or budget', async () => {
    const request = vi.fn()
    for (const ctx of [
      { tier: 'cloud-audit', cloudAvailable: true, projectOptIn: false },
      { tier: 'cloud-audit', cloudAvailable: false, projectOptIn: true },
      { tier: 'local', cloudAvailable: true, projectOptIn: true }
    ]) {
      const out = await maybeAutoEscalateScene({ ...base, ...ctx, request })
      expect(out.requested).toBe(false)
    }
    expect(request).not.toHaveBeenCalled()

    providerBudget.check.mockImplementationOnce(() => {
      throw new BudgetExceededError('openai', 'broke')
    })
    const out = await maybeAutoEscalateScene({
      ...base,
      tier: 'cloud-audit',
      cloudAvailable: true,
      projectOptIn: true,
      request
    })
    expect(request).not.toHaveBeenCalled()
    expect(out.requested).toBe(false)
    expect(out.note).toMatch(/budget/i)
  })

  it('never throws — a failed auto-request degrades to a note', async () => {
    const request = vi.fn(async () => {
      throw new Error('cloud is down')
    })
    const out = await maybeAutoEscalateScene({
      ...base,
      tier: 'cloud-audit',
      cloudAvailable: true,
      projectOptIn: true,
      request
    })
    expect(out.requested).toBe(false)
    expect(out.note).toContain('cloud is down')
  })
})
