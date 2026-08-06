/**
 * One switch for every time-based abort in the generation stack.
 *
 * The stack used to defend itself on two axes: elapsed time (provider ceiling,
 * latency block) and silence (provider idle/first-token timers, stage
 * heartbeats). On local hardware the first axis was always wrong — a 2,440-token
 * skeleton batch at ~4.9 tok/s is ~8 minutes of perfectly healthy work, and the
 * 900s ceiling sat close enough to that to fire on the slow half of the
 * distribution. The second axis was wrong more subtly: prompt evaluation on a
 * 26k-char prompt is legitimately silent for minutes, so "no progress" and "still
 * thinking" are indistinguishable from above.
 *
 * With `TIME_LIMITS_ENABLED = false` a generation runs until it finishes, fails
 * for a non-time reason, or the user presses Stop. That is the intended
 * behaviour, and it has a real cost: a genuinely wedged call (model never loads,
 * socket half-open, server dropped the request) now hangs forever instead of
 * being reaped. Stop is the only recovery. Flip this to `true` to re-arm every
 * timer at once — no call site changes.
 *
 * Convention: a resolved limit of 0 means "disabled". Every consumer checks
 * `> 0` before arming a timer, so nothing needs to invent a sentinel.
 */
export const TIME_LIMITS_ENABLED = false

let enabled = TIME_LIMITS_ENABLED

/**
 * Test hook. The timers are all still here and still correct — they are one
 * boolean away — so the suites that cover them (`ollamaProvider`,
 * `stageHeartbeat`, `latencyBudget`) turn them back on rather than deleting the
 * coverage. Production code must not call this; flip the constant instead.
 */
export function __setTimeLimitsEnabled(value: boolean) {
  enabled = value
}

export function __resetTimeLimits() {
  enabled = TIME_LIMITS_ENABLED
}

/**
 * Resolve a configured duration against the switch.
 *
 * Applied at the point a timer is armed rather than where the duration is
 * declared, so call sites that pass explicit budgets (`firstTokenTimeout: 480_000`,
 * `PLAN_IDLE_TIMEOUT_MS`, per-stage idle budgets) are neutralised too. Their
 * numbers stay in the source as documentation of the intended policy.
 */
export function resolveTimeLimit(ms: number | undefined | null): number {
  if (!enabled) return 0
  return typeof ms === 'number' && ms > 0 ? ms : 0
}

/**
 * Arm a timer only if its budget survives the switch.
 *
 * Returns `undefined` when disabled, which `clearTimeout` accepts, so callers
 * keep their existing `clearTimeout(timer)` cleanup unchanged.
 */
export function armTimeLimit(
  ms: number | undefined | null,
  onExpire: (resolvedMs: number) => void
): ReturnType<typeof setTimeout> | undefined {
  const resolved = resolveTimeLimit(ms)
  if (resolved <= 0) return undefined
  return setTimeout(() => onExpire(resolved), resolved)
}
