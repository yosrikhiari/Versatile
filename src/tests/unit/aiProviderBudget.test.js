import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLocalStorage = {}
beforeEach(() => {
  Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k])
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((k) => mockLocalStorage[k] ?? null),
    setItem: vi.fn((k, v) => { mockLocalStorage[k] = v }),
    removeItem: vi.fn((k) => { delete mockLocalStorage[k] })
  })
})

vi.mock('@/config/ai', () => ({
  PROVIDERS: {
    OLLAMA: 'ollama',
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GEMINI: 'gemini',
    GROQ: 'groq'
  }
}))

const MS_DAY = 24 * 60 * 60 * 1000

describe('aiProviderBudget', () => {
  describe('constructor and defaults', () => {
    it('uses DEFAULT_PROVIDER_BUDGETS when no custom budgets given', async () => {
      const { ProviderBudget, DEFAULT_PROVIDER_BUDGETS } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget()
      expect(pb.budgets.ollama).toBeNull()
      expect(pb.budgets.openai).toBeDefined()
      expect(pb.budgets.openai.dailyTokens).toBe(500_000)
      expect(pb.budgets.openai.dailyCost).toBe(10.0)
      expect(pb.budgets.anthropic.monthlyTokens).toBe(8_000_000)
    })

    it('accepts custom budgets overriding defaults', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      expect(pb.budgets.openai.dailyTokens).toBe(1000)
      expect(pb.budgets.openai.monthlyTokens).toBeUndefined()
    })
  })

  describe('check - budget enforcement', () => {
    it('allows calls when no budget is set (null)', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ ollama: null })
      expect(pb.check('ollama')).toEqual({ allowed: true })
    })

    it('allows calls within daily token limit', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      pb.__setState({
        daily: { periodKey: mockPeriodKey('daily'), providers: { openai: { tokens: 500, cost: 0 } } },
        monthly: { periodKey: mockPeriodKey('monthly'), providers: {} }
      })
      expect(pb.check('openai')).toEqual({ allowed: true })
    })

    it('blocks calls exceeding daily token limit', async () => {
      const { ProviderBudget, BudgetExceededError } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      pb.__setState({
        daily: { periodKey: mockPeriodKey('daily'), providers: { openai: { tokens: 1000, cost: 0 } } },
        monthly: { periodKey: mockPeriodKey('monthly'), providers: {} }
      })
      expect(() => pb.check('openai')).toThrow(BudgetExceededError)
      expect(() => pb.check('openai')).toThrow(/Daily token limit/)
    })

    it('blocks calls exceeding daily cost limit', async () => {
      const { ProviderBudget, BudgetExceededError } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyCost: 5.0 } })
      pb.__setState({
        daily: { periodKey: mockPeriodKey('daily'), providers: { openai: { tokens: 0, cost: 5.0 } } },
        monthly: { periodKey: mockPeriodKey('monthly'), providers: {} }
      })
      expect(() => pb.check('openai')).toThrow(BudgetExceededError)
      expect(() => pb.check('openai')).toThrow(/Daily cost limit/)
    })

    it('blocks calls exceeding monthly token limit', async () => {
      const { ProviderBudget, BudgetExceededError } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { monthlyTokens: 5000 } })
      pb.__setState({
        daily: { periodKey: mockPeriodKey('daily'), providers: {} },
        monthly: { periodKey: mockPeriodKey('monthly'), providers: { openai: { tokens: 5000, cost: 0 } } }
      })
      expect(() => pb.check('openai')).toThrow(BudgetExceededError)
      expect(() => pb.check('openai')).toThrow(/Monthly token limit/)
    })

    it('blocks calls exceeding monthly cost limit', async () => {
      const { ProviderBudget, BudgetExceededError } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { monthlyCost: 50.0 } })
      pb.__setState({
        daily: { periodKey: mockPeriodKey('daily'), providers: {} },
        monthly: { periodKey: mockPeriodKey('monthly'), providers: { openai: { tokens: 0, cost: 50.0 } } }
      })
      expect(() => pb.check('openai')).toThrow(BudgetExceededError)
      expect(() => pb.check('openai')).toThrow(/Monthly cost limit/)
    })
  })

  describe('record - tracking usage', () => {
    it('records token and cost usage', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      pb.record('openai', 500, 0.01)
      pb.record('openai', 300, 0.005)
      const s = pb.state
      expect(s.daily.providers.openai.tokens).toBe(800)
      expect(s.daily.providers.openai.cost).toBe(0.015)
      expect(s.monthly.providers.openai.tokens).toBe(800)
    })

    it('is no-op for providers with null budget', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ ollama: null })
      pb.record('ollama', 100, 0)
      expect(pb.state.daily.providers.ollama).toBeUndefined()
    })

    it('persists to localStorage', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      pb.record('openai', 500, 0.01)
      expect(localStorage.setItem).toHaveBeenCalled()
      const saved = JSON.parse(mockLocalStorage['versatile-ai-budget'])
      expect(saved.daily.providers.openai.tokens).toBe(500)
    })
  })

  describe('getStatus', () => {
    it('returns disabled for null-budget providers', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ ollama: null })
      expect(pb.getStatus('ollama')).toEqual({ enabled: false })
    })

    it('returns usage and limits for budgeted providers', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000, dailyCost: 5.0 } })
      pb.record('openai', 300, 1.25)
      const s = pb.getStatus('openai')
      expect(s.enabled).toBe(true)
      expect(s.daily.used.tokens).toBe(300)
      expect(s.daily.used.cost).toBe(1.25)
      expect(s.daily.limits.tokens).toBe(1000)
      expect(s.daily.limits.cost).toBe(5.0)
      expect(s.daily.resetsInMs).toBeGreaterThan(0)
      expect(s.daily.resetsInMs).toBeLessThanOrEqual(MS_DAY)
    })
  })

  describe('period auto-reset', () => {
    it('resets daily when period key changes', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      pb.__setState({
        daily: { periodKey: '2020-1-1', providers: { openai: { tokens: 999, cost: 0 } } },
        monthly: { periodKey: mockPeriodKey('monthly'), providers: {} }
      })
      expect(pb.check('openai')).toEqual({ allowed: true })
      expect(pb.state.daily.providers.openai).toBeUndefined()
    })

    it('resets monthly when period key changes', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { monthlyCost: 50.0 } })
      pb.__setState({
        daily: { periodKey: mockPeriodKey('daily'), providers: {} },
        monthly: { periodKey: '2020-1', providers: { openai: { tokens: 0, cost: 50.0 } } }
      })
      expect(pb.check('openai')).toEqual({ allowed: true })
      expect(pb.state.monthly.providers.openai).toBeUndefined()
    })
  })

  describe('resetAll', () => {
    it('clears all state', async () => {
      const { ProviderBudget } = await import('@/services/aiProviderBudget')
      const pb = new ProviderBudget({ openai: { dailyTokens: 1000 } })
      pb.record('openai', 500, 0)
      pb.resetAll()
      expect(pb.state.daily.providers.openai).toBeUndefined()
      expect(localStorage.removeItem).toHaveBeenCalled()
    })
  })

  describe('BudgetExceededError', () => {
    it('sets name, provider, and reason', async () => {
      const { BudgetExceededError } = await import('@/services/aiProviderBudget')
      const err = new BudgetExceededError('openai', 'Daily cost limit reached')
      expect(err.name).toBe('BudgetExceededError')
      expect(err.provider).toBe('openai')
      expect(err.reason).toBe('Daily cost limit reached')
      expect(err.message).toContain('Daily cost limit')
    })
  })

  describe('singleton', () => {
    it('exports a default providerBudget instance', async () => {
      const mod = await import('@/services/aiProviderBudget')
      expect(mod.providerBudget).toBeDefined()
      expect(typeof mod.providerBudget.check).toBe('function')
      expect(typeof mod.providerBudget.record).toBe('function')
    })

    it('__resetProviderBudget clears the singleton', async () => {
      const mod = await import('@/services/aiProviderBudget')
      mod.providerBudget.record('openai', 100, 0)
      mod.__resetProviderBudget()
      const s = mod.providerBudget.state
      expect(s.daily.periodKey).toBeDefined()
      expect(s.monthly.periodKey).toBeDefined()
    })
  })
})

function mockPeriodKey(period) {
  const now = new Date()
  if (period === 'daily') return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  return `${now.getFullYear()}-${now.getMonth() + 1}`
}
