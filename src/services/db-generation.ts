import { toRaw } from 'vue'
import { db as _db } from './db-core'

const db = _db as any

export const PIPELINE_STAGES = ['bible', 'network', 'structure', 'spine', 'prose', 'consistency']

export const STAGE_TIMEOUT_MS: Record<string, number> = {
  bible: 5 * 60 * 1000,
  network: 3 * 60 * 1000,
  structure: 10 * 60 * 1000,
  spine: 5 * 60 * 1000,
  prose: 30 * 60 * 1000,
  consistency: 5 * 60 * 1000
}

export async function withTimeout(fn: () => Promise<any>, timeoutMs?: number, label = '') {
  const ms = timeoutMs || 5 * 60 * 1000
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    )
  ])
}

export async function runStageWithTimeout(
  projectId: string,
  stageName: string,
  workFn: () => Promise<any>,
  timeoutMs?: number
) {
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
  } catch (err: any) {
    const isTimeout = /timed out/i.test(err.message)
    await updateGenRunStage(projectId, stageName, {
      status: isTimeout ? 'timeout' : 'failed',
      error: err.message
    })
    throw err
  }
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
