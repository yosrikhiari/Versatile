import { PROVIDERS } from '../config/ai'

export class BudgetExceededError extends Error {
  constructor(provider, reason) {
    super(`Budget exceeded for ${provider}: ${reason}`)
    this.name = 'BudgetExceededError'
    this.provider = provider
    this.reason = reason
  }
}

export const DEFAULT_PROVIDER_BUDGETS = {
  [PROVIDERS.OLLAMA]: null,
  [PROVIDERS.OPENAI]: {
    dailyTokens: 500_000,
    dailyCost: 10.0,
    monthlyTokens: 10_000_000,
    monthlyCost: 200.0
  },
  [PROVIDERS.ANTHROPIC]: {
    dailyTokens: 400_000,
    dailyCost: 15.0,
    monthlyTokens: 8_000_000,
    monthlyCost: 300.0
  },
  [PROVIDERS.GEMINI]: {
    dailyTokens: 1_000_000,
    dailyCost: 5.0,
    monthlyTokens: 20_000_000,
    monthlyCost: 100.0
  },
  [PROVIDERS.GROQ]: {
    dailyTokens: 600_000,
    dailyCost: 8.0,
    monthlyTokens: 12_000_000,
    monthlyCost: 160.0
  }
}

const STORAGE_KEY = 'versatile-ai-budget'

function periodKeys() {
  const now = new Date()
  return {
    daily: `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`,
    monthly: `${now.getFullYear()}-${now.getMonth() + 1}`
  }
}

function msUntilMidnight() {
  const now = Date.now()
  const midnight = new Date(now + msToESTOffsetCorrection())
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now
}

function msUntilMonthEnd() {
  const now = new Date()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return endOfMonth.getTime() - now.getTime()
}

function msToESTOffsetCorrection() {
  return 0
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
  }
}

function freshPeriod() {
  const keys = periodKeys()
  return {
    daily: { periodKey: keys.daily, providers: {} },
    monthly: { periodKey: keys.monthly, providers: {} }
  }
}

function initProvider(period) {
  if (!period.providers) period.providers = {}
}

function touchPeriod(state) {
  const keys = periodKeys()
  if (!state) return freshPeriod()
  let dirty = false
  if (state.daily?.periodKey !== keys.daily) {
    state.daily = { periodKey: keys.daily, providers: {} }
    dirty = true
  }
  if (state.monthly?.periodKey !== keys.monthly) {
    state.monthly = { periodKey: keys.monthly, providers: {} }
    dirty = true
  }
  if (dirty) saveState(state)
  return state
}

export class ProviderBudget {
  constructor(budgets) {
    this.budgets = budgets ?? DEFAULT_PROVIDER_BUDGETS
    this._state = null
  }

  get state() {
    if (!this._state) {
      this._state = touchPeriod(loadState())
    }
    return this._state
  }

  check(provider) {
    const limits = this.budgets[provider]
    if (!limits) return { allowed: true }

    const s = this.state
    const dailyP = s.daily.providers[provider] || { tokens: 0, cost: 0 }
    const monthlyP = s.monthly.providers[provider] || { tokens: 0, cost: 0 }

    if (limits.dailyTokens && dailyP.tokens >= limits.dailyTokens) {
      throw new BudgetExceededError(provider, `Daily token limit (${limits.dailyTokens.toLocaleString()}) reached`)
    }
    if (limits.dailyCost && dailyP.cost >= limits.dailyCost) {
      throw new BudgetExceededError(provider, `Daily cost limit ($${limits.dailyCost}) reached`)
    }
    if (limits.monthlyTokens && monthlyP.tokens >= limits.monthlyTokens) {
      throw new BudgetExceededError(provider, `Monthly token limit (${limits.monthlyTokens.toLocaleString()}) reached — resets at month end`)
    }
    if (limits.monthlyCost && monthlyP.cost >= limits.monthlyCost) {
      throw new BudgetExceededError(provider, `Monthly cost limit ($${limits.monthlyCost}) reached — resets at month end`)
    }

    return { allowed: true }
  }

  record(provider, tokens, cost) {
    const limits = this.budgets[provider]
    if (!limits) return

    const s = this.state
    initProvider(s.daily)
    initProvider(s.monthly)

    const dailyP = s.daily.providers[provider] = s.daily.providers[provider] || { tokens: 0, cost: 0 }
    const monthlyP = s.monthly.providers[provider] = s.monthly.providers[provider] || { tokens: 0, cost: 0 }

    dailyP.tokens += tokens || 0
    dailyP.cost += cost || 0
    monthlyP.tokens += tokens || 0
    monthlyP.cost += cost || 0

    saveState(s)
  }

  getStatus(provider) {
    const limits = this.budgets[provider]
    if (!limits) return { enabled: false }

    const s = this.state
    const dailyP = s.daily.providers[provider] || { tokens: 0, cost: 0 }
    const monthlyP = s.monthly.providers[provider] || { tokens: 0, cost: 0 }

    return {
      enabled: true,
      daily: {
        used: { tokens: dailyP.tokens, cost: dailyP.cost },
        limits: { tokens: limits.dailyTokens, cost: limits.dailyCost },
        resetsInMs: msUntilMidnight()
      },
      monthly: {
        used: { tokens: monthlyP.tokens, cost: monthlyP.cost },
        limits: { tokens: limits.monthlyTokens, cost: limits.monthlyCost },
        resetsInMs: msUntilMonthEnd()
      }
    }
  }

  resetAll() {
    this._state = null
    localStorage.removeItem(STORAGE_KEY)
  }

  __setState(raw) {
    this._state = touchPeriod(raw)
  }
}

export const providerBudget = new ProviderBudget()

export function __resetProviderBudget() {
  providerBudget.resetAll()
}
