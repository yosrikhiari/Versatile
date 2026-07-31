import { SessionBudgetExceededError, BudgetExceededError } from '../../../services/aiProviderBudget'
import { isAbortError } from '../../../utils/abortScope'

/**
 * Errors a generation run must never degrade around.
 *
 * The pipeline is deliberately forgiving: a chapter that fails to plan is padded
 * into a stub, a scene that fails to write is recorded as `{ success: false }`
 * and the run carries on. That is right for a flaky model call — one bad chapter
 * should not cost a book.
 *
 * It is exactly wrong for a budget ceiling. Once the session budget is spent,
 * every remaining call fails the same way, instantly, before reaching a model —
 * so "carry on" turns into hundreds of silent no-ops and a run that reports
 * success having written nothing. Same for a user-requested stop: continuing to
 * churn through work the user asked to cancel is not resilience.
 *
 * These are conditions about the RUN, not about one unit of work, so they have
 * to travel up to whoever can report them.
 */
export function isFatalRunError(err: unknown): boolean {
  return (
    err instanceof SessionBudgetExceededError ||
    err instanceof BudgetExceededError ||
    isAbortError(err) ||
    isConfigurationError(err)
  )
}

/**
 * A misconfiguration, not a bad roll of the dice.
 *
 * "anthropic API key not configured" fails identically for every scene in the
 * book, and no amount of retrying changes it — the user has to go and fix a
 * setting. Treated as an ordinary scene failure it produced a run that walked
 * through three hundred scenes, failed all of them the same way, and buried the
 * one sentence that would have told the author what to do.
 */
export function isConfigurationError(err: unknown): boolean {
  const message = (err as { message?: string } | null)?.message || ''
  return /API key not configured|Unknown provider|not configured\. Please add it/i.test(message)
}

/**
 * Rethrow if fatal, otherwise hand the error back for local degradation.
 *
 * Written as a guard so call sites keep reading as `.catch(err => { rethrowIfFatal(err); return null })`
 * rather than growing a nested try/catch around every optional step.
 */
export function rethrowIfFatal(err: unknown): void {
  if (isFatalRunError(err)) throw err
}
