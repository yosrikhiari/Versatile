import { toRaw } from 'vue'
import { db } from './db-core'

// Ordered list of pipeline stages. `currentStage` points at the first stage that
// is not yet `done`, so a resumed run re-enters here instead of restarting.
export const PIPELINE_STAGES = ['bible', 'network', 'structure', 'spine', 'prose', 'consistency']

/** Per-stage timeout in ms. If a stage exceeds its budget the run marks it
 *  `timeout` and continues to the next stage — partial results are preserved. */
export const STAGE_TIMEOUT_MS = {
  bible: 5 * 60 * 1000,
  network: 3 * 60 * 1000,
  structure: 10 * 60 * 1000,
  spine: 5 * 60 * 1000,
  prose: 30 * 60 * 1000,
  consistency: 5 * 60 * 1000
}

/**
 * Runs `fn` with a timeout. If the function does not settle within `timeoutMs`
 * the returned promise rejects with a descriptive error. Does NOT manage stage
 * status — that is left to the caller.
 */
export async function withTimeout(fn, timeoutMs, label = '') {
  const ms = timeoutMs || 5 * 60 * 1000
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    )
  ])
}

/**
 * Wraps a stage's work function with a timeout. The stage is marked `running`
 * before the work begins. On normal completion → status `done`. On timeout →
 * status `timeout` (partial results preserved). On other errors → status
 * `failed`. The error is always re-thrown so the caller can decide whether to
 * abort or continue.
 */
export async function runStageWithTimeout(projectId, stageName, workFn, timeoutMs) {
  const ms = timeoutMs || STAGE_TIMEOUT_MS[stageName] || 5 * 60 * 1000
  await updateGenRunStage(projectId, stageName, { status: 'running' })
  try {
    const result = await Promise.race([
      workFn(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Stage "${stageName}" timed out after ${ms / 1000}s`)),
          ms
        )
      )
    ])
    await updateGenRunStage(projectId, stageName, { status: 'done' })
    return result
  } catch (err) {
    const isTimeout = /timed out/i.test(err.message)
    await updateGenRunStage(projectId, stageName, {
      status: isTimeout ? 'timeout' : 'failed',
      error: err.message
    })
    throw err
  }
}

// Fresh stage-structured checkpoint (state.version 2). The generator merges its
// writing-resume fields (scenePlan, chapterPlan, writtenMeta, ...) into this.
export function makeInitialGenState(extra = {}) {
  const stages = {}
  for (const name of PIPELINE_STAGES) {
    stages[name] =
      name === 'prose'
        ? { status: 'pending', written: 0, total: 0 }
        : { status: 'pending', error: null }
  }
  return { version: 2, currentStage: PIPELINE_STAGES[0], stages, ...extra }
}

// Merge a patch into one stage and recompute `currentStage`. Best-effort — a
// checkpoint failure must never break the run.
export async function updateGenRunStage(projectId, stageName, patch = {}) {
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

// Persistence for one-click generation runs. Stores a lightweight, JSON-plain
// checkpoint (the plan + progress markers, NOT prose — prose already lives in
// subsections) so an interrupted unattended draft can be detected and resumed.
// One row per project (projectId is a unique index).

export async function saveGenRun(projectId, state) {
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
    // Checkpointing is best-effort — never let it break the generation run
    console.warn('Failed to save generation checkpoint:', error)
    return null
  }
}

export async function getGenRun(projectId) {
  if (!projectId) return null
  try {
    const run = await db.genRuns.where('projectId').equals(projectId).first()
    // Reject checkpoints from different schema versions — caller gets null and
    // treats it as "no checkpoint" instead of silently consuming incompatible data.
    if (run?.state?.version !== 2) return null
    return run
  } catch (error) {
    console.error('Failed to read generation checkpoint:', error)
    return null
  }
}

export async function clearGenRun(projectId) {
  if (!projectId) return
  try {
    const rows = await db.genRuns.where('projectId').equals(projectId).toArray()
    if (rows.length) await db.genRuns.bulkDelete(rows.map((r) => r.id))
  } catch (error) {
    console.warn('Failed to clear generation checkpoint:', error)
  }
}
