import { describe, it, expect, beforeEach } from 'vitest'

/**
 * The reported symptom: the Activity drawer showed "Story Generator · Planning ·
 * RUNNING · 9h 56m" next to a panel that already said the run had failed.
 *
 * `failTask` was written to reconcile exactly that — it marks the task and every
 * still-running phase failed — and it had no callers anywhere in the codebase.
 * Nothing closed the task on a failure path, so the drawer kept counting.
 */

let actLog

beforeEach(async () => {
  const mod = await import('@/composables/useActivityLog')
  actLog = mod.useActivityLog()
  // The log is module-level state shared across the app; drop anything a
  // previous test left behind so counts below mean what they say.
  for (const t of [...actLog.tasks.value]) actLog.removeTask(t.id)
})

function startRun() {
  const taskId = actLog.addTask({ name: 'Story Generator', type: 'generation' })
  const bootstrap = actLog.addPhase(taskId, 'Bootstrapping')
  actLog.updatePhase(taskId, bootstrap, { status: 'done' })
  const planning = actLog.addPhase(taskId, 'Planning')
  return { taskId, planning }
}

describe('failTask closes a run that died mid-phase', () => {
  it('marks the task and every still-running phase failed', () => {
    const { taskId, planning } = startRun()

    actLog.failTask(taskId, 'Stage "structure" made no progress for 480s')

    const task = actLog.tasks.value.find((t) => t.id === taskId)
    expect(task.status).toBe('failed')
    expect(task.error).toContain('no progress for 480s')
    expect(task.phases[planning].status).toBe('failed')
  })

  it('leaves already-finished phases alone', () => {
    const { taskId } = startRun()
    actLog.failTask(taskId, 'boom')

    const task = actLog.tasks.value.find((t) => t.id === taskId)
    expect(task.phases[0].status).toBe('done') // Bootstrapping finished before the failure
    expect(task.phases[1].status).toBe('failed')
  })

  it('stamps elapsed time so the drawer stops counting', () => {
    const { taskId, planning } = startRun()
    actLog.failTask(taskId, 'boom')

    const task = actLog.tasks.value.find((t) => t.id === taskId)
    expect(task.completedAt).toBeGreaterThan(0)
    expect(task.phases[planning].elapsedMs).toBeGreaterThanOrEqual(0)
  })

  // The condition the drawer's "1 active" badge reads.
  it('removes the run from the active list', () => {
    const { taskId } = startRun()
    expect(actLog.activeTasks.value.some((t) => t.id === taskId)).toBe(true)

    actLog.failTask(taskId, 'boom')

    expect(actLog.activeTasks.value.some((t) => t.id === taskId)).toBe(false)
    expect(actLog.completedTasks.value.some((t) => t.id === taskId)).toBe(true)
  })

  it('is a no-op for an unknown task id rather than throwing', () => {
    expect(() => actLog.failTask('does-not-exist', 'boom')).not.toThrow()
  })
})
