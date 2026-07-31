import { toRaw } from 'vue'
import { db as _db } from './db-core'

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
 */
export const STAGE_IDLE_TIMEOUT_MS: Record<string, number> = {
  bible: 5 * 60 * 1000,
  network: 3 * 60 * 1000,
  structure: 8 * 60 * 1000,
  // One scene on slow local hardware can legitimately take ~15 minutes, and a
  // scene is the unit of progress here.
  prose: 25 * 60 * 1000,
  spine: 5 * 60 * 1000,
  consistency: 5 * 60 * 1000
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
 */
export async function runStageWithHeartbeat(
  projectId: string,
  stageName: string,
  workFn: (heartbeat: StageHeartbeat) => Promise<any>,
  idleTimeoutMs?: number
) {
  const ms = idleTimeoutMs || STAGE_IDLE_TIMEOUT_MS[stageName] || 5 * 60 * 1000
  await updateGenRunStage(projectId, stageName, { status: 'running' })

  let timer: ReturnType<typeof setTimeout> | undefined
  let settled = false
  let rejectIdle: ((err: Error) => void) | null = null
  let lastDetail = ''

  const arm = () => {
    clearTimeout(timer)
    if (settled) return
    timer = setTimeout(() => {
      rejectIdle?.(
        new Error(
          `Stage "${stageName}" made no progress for ${Math.round(ms / 1000)}s` +
            (lastDetail ? ` (last: ${lastDetail})` : '')
        )
      )
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
    const result = await Promise.race([workFn(heartbeat), idleGuard])
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
  workFn: () => Promise<any>,
  timeoutMs?: number
) {
  return runStageWithHeartbeat(projectId, stageName, () => workFn(), timeoutMs)
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
