import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/backendAiService', () => ({
  backendStream: vi.fn(),
  backendTestConnection: vi.fn(async () => ({ success: true, model: 'm', error: null }))
}))
vi.mock('@/services/aiProviderBudget', () => ({
  providerBudget: { check: vi.fn(), record: vi.fn() },
  BudgetExceededError: class BudgetExceededError extends Error {}
}))

import {
  canUseCloudEscalation,
  maybeAutoEscalateScene,
  requestCloudEscalation
} from '@/services/cloudEscalation'
import { providerBudget, BudgetExceededError } from '@/services/aiProviderBudget'
import { backendStream, backendTestConnection } from '@/services/backendAiService'
import { useSettingsStore } from '@/stores/settingsStore'

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

describe('canUseCloudEscalation', () => {
  function settings() {
    const s = useSettingsStore()
    s.analysisTier = 'cloud-audit'
    s.aiProvider = 'openai'
    return s
  }

  it('is off when the user chose local-only, whatever the tier says', () => {
    const s = settings()
    s.localOnly = true
    expect(canUseCloudEscalation()).toBe(false)
  })

  it('is on only for a hosted provider and a non-local tier', () => {
    const s = settings()
    s.localOnly = false
    expect(canUseCloudEscalation()).toBe(true)
    s.aiProvider = 'ollama'
    expect(canUseCloudEscalation()).toBe(false)
    s.aiProvider = 'openai'
    s.analysisTier = 'local'
    expect(canUseCloudEscalation()).toBe(false)
  })
})

describe('requestCloudEscalation consent', () => {
  beforeEach(() => {
    backendTestConnection.mockResolvedValue({ success: true, model: 'm', error: null })
    backendStream.mockResolvedValue('Second opinion.')
  })

  it('refuses to send manuscript text without explicit consent', async () => {
    const out = await requestCloudEscalation({ ...base, consent: false })

    expect(out.success).toBe(false)
    expect(out.error).toMatch(/consent/i)
    expect(backendTestConnection).not.toHaveBeenCalled()
    expect(backendStream).not.toHaveBeenCalled()
  })

  it('sends only after the caller confirms consent', async () => {
    useSettingsStore().localOnly = false
    const out = await requestCloudEscalation({ ...base, consent: true })

    expect(out.success).toBe(true)
    expect(out.result).toBe('Second opinion.')
    expect(backendStream).toHaveBeenCalledOnce()
  })

  it('refuses even with consent while local-only is on', async () => {
    useSettingsStore().localOnly = true
    const out = await requestCloudEscalation({ ...base, consent: true })

    expect(out.success).toBe(false)
    expect(out.error).toMatch(/local-only/i)
    expect(backendTestConnection).not.toHaveBeenCalled()
  })
})
