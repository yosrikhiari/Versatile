import { toRaw } from 'vue'
import { db as _db } from './db-core'
import { resolveTimeLimit } from '../config/timeLimits'

const db = _db as any

export const PIPELINE_STAGES = ['bible', 'network', 'structure', 'spine', 'prose', 'consistency']

/**
 * How long a stage may make NO progress before it is declared stuck.
 *
 * These were previously total-runtime budgets, and every one of them was smaller
 * than the work it was supposed to cover: `prose` allowed 30 minutes for a job
 * that takes ~6 hours on a local model (30 scenes x ~13 min at 5.85 tok/s), so a
 * healthy 10-chapter run was always killed around chapter 2.
 *
 * Bounding idle time instead means the budget no longer has to predict how long
 * the work takes — only how long silence is tolerable. That is a question with a
 * stable answer regardless of model speed, chapter count, or hardware.
 *
 * FLOOR: every budget here must exceed the provider's own first-token allowance
 * (`FIRST_TOKEN_TIMEOUT_MS`, 300s in `providers/ollama.ts`). Prompt evaluation is
 * the one phase where silence is expected, and the provider is the layer that
 * knows the difference between "still evaluating the prompt" and "wedged". A
 * stage budget below that floor always fires first and reports the useless
 * version of the story — which is exactly what `network` did at 180s: it could
 * not outlast a single legitimate structured call, so the Story Network stage
 * failed on every run that had to evaluate a real prompt.
 *
 * The bible, network, spine, and consistency stages now use 7 minutes (420s) to
 * provide a 120s buffer over the 300s first-token timeout. This ensures the
 * stage watchdog never fires before the provider's own timeout, and gives time
 * for the provider to surface a real stall (idle timeout 90s) rather than the
 * stage declaring "no progress" during expected prompt evaluation silence.
 */
export const STAGE_IDLE_TIMEOUT_MS: Record<string, number> = {
  bible: 7 * 60 * 1000,
  network: 7 * 60 * 1000,
  structure: 8 * 60 * 1000,
  // One scene on slow local hardware can legitimately take ~15 minutes, and a
  // scene is the unit of progress here.
  prose: 25 * 60 * 1000,
  spine: 7 * 60 * 1000,
  consistency: 7 * 60 * 1000
}

/** @deprecated Retained for callers still passing an absolute budget. */
export const STAGE_TIMEOUT_MS = STAGE_IDLE_TIMEOUT_MS

/**
 * `withTimeout` used to live here and is deliberately gone.
 *
 * It raced work against a wall clock and defaulted to five minutes when the
 * caller passed no budget — which both of its call sites did. That silently
 * capped the structure and prose stages at five minutes each, far below what
 * they cost on a local model, and because it was a `Promise.race` the abandoned
 * generation kept running invisibly after the timeout had already been reported
 * as a failure.
 *
 * Use `runStageWithHeartbeat`: it bounds lack of progress rather than elapsed
 * time, so slow-but-healthy work survives and a genuine hang is caught sooner.
 */

export interface StageHeartbeat {
  /** Report that a unit of work completed; resets the idle timer. */
  (detail?: string): void
}

/**
 * Run a stage under an idle watchdog.
 *
 * `workFn` receives a `heartbeat` it must call as each unit of work lands (a
 * planned chapter, a written scene). While heartbeats keep arriving the stage
 * runs for as long as it needs; when they stop for the stage's idle budget it
 * fails immediately. A stage that never calls heartbeat behaves exactly like the
 * old absolute-timeout version, so untouched call sites keep their old semantics.
 *
 * `workFn` also receives a signal that is aborted when the watchdog fires, and
 * it must be forwarded to whatever issues the provider call. Reporting the stage
 * failed does not stop the work: the race abandons the promise, but the request
 * behind it keeps streaming and keeps the single Ollama slot (`foregroundSlot`,
 * limit 1) that the *next* stage needs. That is how a Story Network stage
 * declared dead at 180s went on to hold the GPU while Planning sat in the queue
 * behind it, burning its own budget waiting for a call nobody was listening to.
 * `externalSignal` (the run-level stop) is chained into the same controller so
 * cancelling the run cancels the request too.
 */
export async function runStageWithHeartbeat(
  projectId: string,
  stageName: string,
  workFn: (heartbeat: StageHeartbeat, signal: AbortSignal) => Promise<any>,
  idleTimeoutMs?: number,
  externalSignal?: AbortSignal
) {
  // 0 = watchdog disabled; the stage then runs until it finishes, fails, or the
  // run-level stop fires. See config/timeLimits.
  const ms = resolveTimeLimit(idleTimeoutMs || STAGE_IDLE_TIMEOUT_MS[stageName] || 5 * 60 * 1000)
  await updateGenRunStage(projectId, stageName, { status: 'running' })

  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false
  let rejectIdle: ((err: Error) => void) | null = null
  let lastDetail = ''

  const controller = new AbortController()
  const forwardAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal) {
    if (externalSignal.aborted) forwardAbort()
    else externalSignal.addEventListener('abort', forwardAbort, { once: true })
  }

  const arm = () => {
    clearTimeout(timer)
    if (settled || ms <= 0) return
    timer = setTimeout(() => {
      const err = new Error(
        `Stage "${stageName}" made no progress for ${Math.round(ms / 1000)}s` +
          (lastDetail ? ` (last: ${lastDetail})` : '')
      )
      // Cancel before rejecting, so the provider slot is released as the caller
      // learns the stage is dead rather than minutes later.
      controller.abort(err)
      rejectIdle?.(err)
    }, ms)
  }

  const heartbeat: StageHeartbeat = (detail?: string) => {
    if (detail) lastDetail = detail
    arm()
  }

  try {
    const idleGuard = new Promise((_, reject) => {
      rejectIdle = reject
      arm()
    })
    const result = await Promise.race([workFn(heartbeat, controller.signal), idleGuard])
    settled = true
    clearTimeout(timer)
    await updateGenRunStage(projectId, stageName, { status: 'done' })
    return result
  } catch (err: any) {
    settled = true
    clearTimeout(timer)
    const isTimeout = /timed out|no progress/i.test(err.message || '')
    await updateGenRunStage(projectId, stageName, {
      status: isTimeout ? 'timeout' : 'failed',
      error: err.message
    })
    throw err
  } finally {
    externalSignal?.removeEventListener('abort', forwardAbort)
  }
}

/**
 * Absolute-budget variant, kept for stages whose work is a single opaque call
 * with no intermediate progress to report. Prefer `runStageWithHeartbeat` for
 * anything that completes in units.
 */
export async function runStageWithTimeout(
  projectId: string,
  stageName: string,
  workFn: (signal: AbortSignal) => Promise<any>,
  timeoutMs?: number,
  externalSignal?: AbortSignal
) {
  return runStageWithHeartbeat(
    projectId,
    stageName,
    (_heartbeat, signal) => workFn(signal),
    timeoutMs,
    externalSignal
  )
}

export function makeInitialGenState(extra = {}) {
  const stages: Record<string, any> = {}
  for (const name of PIPELINE_STAGES) {
    stages[name] =
      name === 'prose'
        ? { status: 'pending', written: 0, total: 0 }
        : { status: 'pending', error: null }
  }
  return { version: 2, currentStage: PIPELINE_STAGES[0], stages, ...extra }
}

export async function updateGenRunStage(projectId: string, stageName: string, patch = {}) {
  if (!projectId) return null
  try {
    const run = await getGenRun(projectId)
    const state = run?.state && run.state.version === 2 ? run.state : makeInitialGenState()
    state.stages[stageName] = { ...(state.stages[stageName] || {}), ...patch }
    const firstUnfinished = PIPELINE_STAGES.find((s) => state.stages[s]?.status !== 'done')
    state.currentStage = firstUnfinished || 'complete'
    return await saveGenRun(projectId, state)
  } catch (error) {
    console.warn('Failed to update generation stage:', error)
    return null
  }
}

export async function saveGenRun(projectId: string, state: any) {
  if (!projectId) return null
  try {
    const plainState = JSON.parse(JSON.stringify(toRaw(state)))
    const existing = await db.genRuns.where('projectId').equals(projectId).first()
    if (existing) {
      await db.genRuns.update(existing.id, { updatedAt: Date.now(), state: plainState })
      return existing.id
    }
    return await db.genRuns.add({ projectId, updatedAt: Date.now(), state: plainState })
  } catch (error) {
    console.warn('Failed to save generation checkpoint:', error)
    return null
  }
}

export async function getGenRun(projectId: string) {
  if (!projectId) return null
  try {
    const run = await db.genRuns.where('projectId').equals(projectId).first()
    if (run?.state?.version !== 2) return null
    return run
  } catch (error) {
    console.error('Failed to read generation checkpoint:', error)
    return null
  }
}

export async function clearGenRun(projectId: string) {
  if (!projectId) return
  try {
    const rows = await db.genRuns.where('projectId').equals(projectId).toArray()
    if (rows.length) await db.genRuns.bulkDelete(rows.map((r: any) => r.id))
  } catch (error) {
    console.warn('Failed to clear generation checkpoint:', error)
  }
}
