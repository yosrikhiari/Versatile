import { PROVIDERS } from '../config/ai'

interface BudgetLimits {
  dailyTokens?: number
  dailyCost?: number
  monthlyTokens?: number
  monthlyCost?: number
}

interface PeriodState {
  periodKey: string
  providers: Record<string, { tokens: number; cost: number }>
}

interface BudgetState {
  daily: PeriodState
  monthly: PeriodState
}

type BudgetMap = Record<string, BudgetLimits | null>

export class BudgetExceededError extends Error {
  provider: string
  reason: string

  constructor(provider: string, reason: string) {
    super(`Budget exceeded for ${provider}: ${reason}`)
    this.name = 'BudgetExceededError'
    this.provider = provider
    this.reason = reason
  }
}

export const DEFAULT_PROVIDER_BUDGETS: Record<string, BudgetLimits | null> = {
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

function periodKeys(): { daily: string; monthly: string } {
  const now = new Date()
  return {
    daily: `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`,
    monthly: `${now.getFullYear()}-${now.getMonth() + 1}`
  }
}

function msUntilMidnight(): number {
  const now = Date.now()
  const midnight = new Date(now + msToESTOffsetCorrection())
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now
}

function msUntilMonthEnd(): number {
  const now = new Date()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return endOfMonth.getTime() - now.getTime()
}

function msToESTOffsetCorrection(): number {
  return 0
}

function loadState(): BudgetState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveState(state: BudgetState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
  }
}

function freshPeriod(): BudgetState {
  const keys = periodKeys()
  return {
    daily: { periodKey: keys.daily, providers: {} },
    monthly: { periodKey: keys.monthly, providers: {} }
  }
}

function initProvider(period: PeriodState): void {
  if (!period.providers) period.providers = {}
}

function touchPeriod(state: BudgetState | null): BudgetState {
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

interface BudgetStatus {
  enabled: boolean
  daily?: {
    used: { tokens: number; cost: number }
    limits: { tokens?: number; cost?: number }
    resetsInMs: number
  }
  monthly?: {
    used: { tokens: number; cost: number }
    limits: { tokens?: number; cost?: number }
    resetsInMs: number
  }
}

interface CheckResult {
  allowed: boolean
}

export class ProviderBudget {
  budgets: BudgetMap
  _state: BudgetState | null

  constructor(budgets?: BudgetMap) {
    this.budgets = budgets ?? DEFAULT_PROVIDER_BUDGETS
    this._state = null
  }

  get state(): BudgetState {
    if (!this._state) {
      this._state = touchPeriod(loadState())
    }
    return this._state
  }

  check(provider: string): CheckResult {
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

  record(provider: string, tokens: number, cost: number): void {
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

  getStatus(provider: string): BudgetStatus {
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

  resetAll(): void {
    this._state = null
    localStorage.removeItem(STORAGE_KEY)
  }

  __setState(raw: BudgetState | null): void {
    this._state = touchPeriod(raw)
  }
}

export const providerBudget = new ProviderBudget()

export function __resetProviderBudget(): void {
  providerBudget.resetAll()
}

export interface SessionBudgetConfig {
  softCapTokens?: number
  softCapCost?: number
  softCapCalls?: number
  hardCapTokens?: number
  hardCapCost?: number
  hardCapCalls?: number
}

export interface SessionCheckResult {
  allowed: boolean
  warn?: true
  reason: string
}

export interface SessionState {
  tokens: number
  cost: number
  callCount: number
  downgradeRequested: boolean
}

export class SessionBudgetExceededError extends Error {
  reason: string

  constructor(reason: string) {
    super(`Session budget exceeded: ${reason}`)
    this.name = 'SessionBudgetExceededError'
    this.reason = reason
  }
}

const DEFAULT_SESSION_CONFIG: Required<SessionBudgetConfig> = {
  softCapTokens: 50_000,
  softCapCost: 0.50,
  softCapCalls: 50,
  hardCapTokens: 100_000,
  hardCapCost: 1.00,
  hardCapCalls: 100
}

/**
 * What one run actually costs, per unit of requested work.
 *
 * The defaults above describe a single chat exchange, not a book. A generation
 * run spends, per planned chapter, one share of a skeleton batch call plus a
 * scene-plan call plus a spine call; and per scene, a writer call, a metadata
 * extraction, and a critique — each repeated up to SCENE_MAX_ATTEMPTS by the
 * quality gate, plus repair and consistency passes at the end.
 *
 * A 10-volume x 10-chapter x 3-scene request is therefore ~300 planning/spine
 * calls and ~1,800 prose-side calls. Against a flat 100-call ceiling the budget
 * was exhausted partway through PLANNING — every call after that threw
 * `SessionBudgetExceededError` before reaching a model, planning degraded those
 * chapters to empty stubs, and the run reported success having written nothing.
 *
 * These multipliers are deliberately generous. The cap's job is to stop a
 * runaway loop, not to predict the work — under-guessing here silently truncates
 * a book, which is far worse than letting a legitimate run finish.
 */
const CALLS_PER_CHAPTER = 4
const CALLS_PER_SCENE = 8
const TOKENS_PER_CHAPTER = 6_000
const TOKENS_PER_SCENE = 40_000
/** Headroom over the estimate before the ceiling bites. */
const RUNAWAY_FACTOR = 3

export interface RunSize {
  /** Total chapters to plan across every volume. */
  chapters: number
  /** Total scenes to write across every chapter. */
  scenes: number
  /**
   * Whether inference is local and has no marginal cost. A dollar ceiling is
   * meaningless against Ollama, and enforcing one there only ends runs early.
   */
  localProvider?: boolean
}

/**
 * Derive session caps from the run the user actually asked for.
 *
 * Soft caps sit at the estimate (they only warn, and are the honest signal that
 * a run is costing more than its shape predicted); hard caps sit at
 * RUNAWAY_FACTOR times the estimate.
 */
export function sessionConfigForRun({ chapters, scenes, localProvider }: RunSize): Required<SessionBudgetConfig> {
  const safeChapters = Math.max(1, Math.ceil(chapters || 0))
  const safeScenes = Math.max(1, Math.ceil(scenes || 0))

  const estCalls = safeChapters * CALLS_PER_CHAPTER + safeScenes * CALLS_PER_SCENE
  const estTokens = safeChapters * TOKENS_PER_CHAPTER + safeScenes * TOKENS_PER_SCENE
  // Rough per-token blended rate; only ever consulted for paid providers.
  const estCost = (estTokens / 1_000_000) * 3

  return {
    softCapCalls: estCalls,
    softCapTokens: estTokens,
    // `null` is how check() is told to skip a dimension, and local inference has
    // no spend to cap. Infinity keeps the type Required<> without ever tripping.
    softCapCost: localProvider ? Infinity : estCost,
    hardCapCalls: estCalls * RUNAWAY_FACTOR,
    hardCapTokens: estTokens * RUNAWAY_FACTOR,
    hardCapCost: localProvider ? Infinity : estCost * RUNAWAY_FACTOR
  }
}

export class SessionBudget {
  config: SessionBudgetConfig
  tokens = 0
  cost = 0
  callCount = 0
  downgradeRequested = false

  constructor(config?: SessionBudgetConfig) {
    this.config = config ?? DEFAULT_SESSION_CONFIG
  }

  /**
   * Resize in place and clear the counters.
   *
   * The instance is handed to the director, writer and critic by reference when
   * the generator is created — long before the run's shape is known — so the
   * budget has to be re-pointed at the real workload here rather than replaced.
   */
  configureForRun(size: RunSize): this {
    this.config = sessionConfigForRun(size)
    this.reset()
    return this
  }

  check(): SessionCheckResult {
    const c = this.config

    if (c.hardCapTokens != null && this.tokens >= c.hardCapTokens) {
      return { allowed: false, reason: `Hard token cap (${c.hardCapTokens.toLocaleString()}) reached` }
    }
    if (c.hardCapCost != null && this.cost >= c.hardCapCost) {
      return { allowed: false, reason: `Hard cost cap ($${c.hardCapCost}) reached` }
    }
    if (c.hardCapCalls != null && this.callCount >= c.hardCapCalls) {
      return { allowed: false, reason: `Hard call cap (${c.hardCapCalls}) reached` }
    }

    if (c.softCapTokens != null && this.tokens >= c.softCapTokens) {
      return { allowed: true, warn: true, reason: `Soft token cap (${c.softCapTokens.toLocaleString()}) reached` }
    }
    if (c.softCapCost != null && this.cost >= c.softCapCost) {
      return { allowed: true, warn: true, reason: `Soft cost cap ($${c.softCapCost}) reached` }
    }
    if (c.softCapCalls != null && this.callCount >= c.softCapCalls) {
      return { allowed: true, warn: true, reason: `Soft call cap (${c.softCapCalls}) reached` }
    }

    return { allowed: true, reason: '' }
  }

  record(provider: string, tokens: number, cost: number): void {
    this.tokens += tokens || 0
    this.cost += cost || 0
    this.callCount++
  }

  reset(): void {
    this.tokens = 0
    this.cost = 0
    this.callCount = 0
    this.downgradeRequested = false
  }

  asState(): SessionState {
    return {
      tokens: this.tokens,
      cost: this.cost,
      callCount: this.callCount,
      downgradeRequested: this.downgradeRequested
    }
  }
}
