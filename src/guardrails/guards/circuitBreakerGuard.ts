import type { GuardrailContext, GuardrailResult, GuardFunction } from '../types'

interface CircuitBreakerState {
  failures: number
  lastFailure: number
  isOpen: boolean
  openedAt: number | null
}

const stateByProvider = new Map<string, CircuitBreakerState>()

export function createCircuitBreakerGuard(
  opts: {
    enabled?: boolean
    threshold?: number
    cooldownMs?: number
  } = {}
): GuardFunction {
  const { enabled = true, threshold = 3, cooldownMs = 60_000 } = opts

  const getState = (provider: string): CircuitBreakerState => {
    let s = stateByProvider.get(provider)
    if (!s) {
      s = { failures: 0, lastFailure: 0, isOpen: false, openedAt: null }
      stateByProvider.set(provider, s)
    }
    return s
  }

  return (context: GuardrailContext): GuardrailResult[] => {
    if (!enabled) return []

    const results: GuardrailResult[] = []
    const provider = context.provider
    if (!provider) return results

    const state = getState(provider)

    if (state.isOpen) {
      const elapsed = Date.now() - (state.openedAt ?? 0)
      if (elapsed >= cooldownMs) {
        state.isOpen = false
        state.failures = 0
        state.openedAt = null
        return results
      }

      results.push({
        kind: 'circuit_breaker',
        passed: false,
        severity: 'blocking',
        message: `Circuit breaker open for ${provider} (${Math.ceil((cooldownMs - elapsed) / 1000)}s remaining)`,
        details: { provider, failures: state.failures, cooldownRemainingMs: cooldownMs - elapsed },
        layer: context.layer,
        timestamp: Date.now(),
      })
    }

    const data = context.data as Record<string, unknown> | undefined
    if (data && (data.error || data.failed)) {
      state.failures++
      state.lastFailure = Date.now()
      if (state.failures >= threshold) {
        state.isOpen = true
        state.openedAt = Date.now()
        results.push({
          kind: 'circuit_breaker',
          passed: false,
          severity: 'blocking',
          message: `Circuit breaker tripped for ${provider} (${state.failures} failures)`,
          details: { provider, failures: state.failures, threshold },
          layer: context.layer,
          timestamp: Date.now(),
        })
      }
    }

    return results
  }
}

export function resetCircuitBreaker(provider: string): void {
  stateByProvider.delete(provider)
}

export function getCircuitBreakerState(provider: string): CircuitBreakerState | undefined {
  return stateByProvider.get(provider)
}
