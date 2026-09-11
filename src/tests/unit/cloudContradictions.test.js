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

import { resolveBatchInjector } from '@/composables/betareader/cloudContradictions'

describe('resolveBatchInjector', () => {
  const ctx = { provider: 'openai', model: 'm', localGenerateJson: local, onFallback: () => {} }
  it('returns undefined for local tier', () => {
    expect(
      resolveBatchInjector({
        ...ctx,
        tier: 'local',
        cloudAvailable: true,
        runOptIn: true,
        projectOptIn: true
      })
    ).toBeUndefined()
  })
  it('returns undefined for on-demand without the run opt-in', () => {
    expect(
      resolveBatchInjector({
        ...ctx,
        tier: 'cloud-on-demand',
        cloudAvailable: true,
        runOptIn: false,
        projectOptIn: false
      })
    ).toBeUndefined()
  })
  it('returns an injector for on-demand with the run opt-in', () => {
    expect(
      typeof resolveBatchInjector({
        ...ctx,
        tier: 'cloud-on-demand',
        cloudAvailable: true,
        runOptIn: true,
        projectOptIn: false
      })
    ).toBe('function')
  })
  it('returns undefined for audit tier without the project opt-in', () => {
    expect(
      resolveBatchInjector({
        ...ctx,
        tier: 'cloud-audit',
        cloudAvailable: true,
        runOptIn: true,
        projectOptIn: false
      })
    ).toBeUndefined()
  })
  it('returns an injector for audit tier with the project opt-in (no run opt-in needed)', () => {
    expect(
      typeof resolveBatchInjector({
        ...ctx,
        tier: 'cloud-audit',
        cloudAvailable: true,
        runOptIn: false,
        projectOptIn: true
      })
    ).toBe('function')
  })
  it('returns undefined when no cloud provider is configured', () => {
    expect(
      resolveBatchInjector({
        ...ctx,
        tier: 'cloud-audit',
        cloudAvailable: false,
        runOptIn: true,
        projectOptIn: true
      })
    ).toBeUndefined()
  })
})

it('labels structural-arc disclosures distinctly from contradiction sweeps', async () => {
  const { buildCloudDisclosure } = await import('@/services/cloudEscalation')
  const arc = await buildCloudDisclosure({
    projectId: 'p1',
    operation: 'structural-arc',
    text: 'x'.repeat(1000),
    systemPrompt: 'y',
    provider: 'openai',
    model: 'gpt-4o-mini'
  })
  expect(arc.operation).toBe('Structural arc analysis')
})
