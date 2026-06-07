import { describe, it, expect, beforeEach, vi } from 'vitest'

let useActivityLog
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/useActivityLog')
  useActivityLog = mod.useActivityLog
})

describe('useActivityLog', () => {
  it('adds a task and returns its id', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'Test task', type: 'generation' })
    expect(id).toMatch(/^act-\d+$/)
    expect(log.tasks.value).toHaveLength(1)
    expect(log.tasks.value[0].name).toBe('Test task')
    expect(log.tasks.value[0].status).toBe('running')
  })

  it('updates a task', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    log.updateTask(id, { status: 'paused' })
    expect(log.tasks.value[0].status).toBe('paused')
  })

  it('completes a task and sets running phases to done', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    log.addPhase(id, 'Phase 1')
    log.completeTask(id)
    const task = log.tasks.value[0]
    expect(task.status).toBe('done')
    expect(task.completedAt).toBeTruthy()
    expect(task.phases[0].status).toBe('done')
  })

  it('fails a task and sets running phases to failed', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    log.addPhase(id, 'Phase 1')
    log.failTask(id, 'Something broke')
    const task = log.tasks.value[0]
    expect(task.status).toBe('failed')
    expect(task.error).toBe('Something broke')
    expect(task.phases[0].status).toBe('failed')
  })

  it('adds and updates a phase', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    const idx = log.addPhase(id, 'Planning')
    expect(idx).toBe(0)
    const phase = log.tasks.value[0].phases[0]
    expect(phase.name).toBe('Planning')
    expect(phase.status).toBe('running')
    log.updatePhase(id, 0, { status: 'done', elapsedMs: 100 })
    expect(phase.status).toBe('done')
  })

  it('appends thought to a phase', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    const idx = log.addPhase(id, 'Writing')
    log.appendThought(id, idx, 'Hello ')
    log.appendThought(id, idx, 'World')
    expect(log.tasks.value[0].phases[0].thought).toBe('Hello World')
  })

  it('crops thought when exceeding THOUGHT_CAP', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    const idx = log.addPhase(id, 'Writing')
    const long = 'x'.repeat(60000)
    log.appendThought(id, idx, long)
    log.appendThought(id, idx, long)
    expect(log.tasks.value[0].phases[0].thought.length).toBe(100000)
  })

  it('removes a task', () => {
    const log = useActivityLog()
    const id = log.addTask({ name: 'T', type: 'test' })
    log.removeTask(id)
    expect(log.tasks.value).toHaveLength(0)
  })

  it('clearCompleted removes non-running tasks', () => {
    const log = useActivityLog()
    const id1 = log.addTask({ name: 'Running', type: 'test' })
    const id2 = log.addTask({ name: 'Done', type: 'test' })
    log.completeTask(id2)
    log.clearCompleted()
    expect(log.tasks.value).toHaveLength(1)
    expect(log.tasks.value[0].name).toBe('Running')
  })

  it('activeTasks returns only running tasks', () => {
    const log = useActivityLog()
    log.addTask({ name: 'Running', type: 'test' })
    const id2 = log.addTask({ name: 'Done', type: 'test' })
    log.completeTask(id2)
    expect(log.activeTasks.value).toHaveLength(1)
    expect(log.activeTasks.value[0].name).toBe('Running')
  })

  it('completedTasks returns done and failed tasks', () => {
    const log = useActivityLog()
    log.addTask({ name: 'Running', type: 'test' })
    const id2 = log.addTask({ name: 'Done', type: 'test' })
    const id3 = log.addTask({ name: 'Failed', type: 'test' })
    log.completeTask(id2)
    log.failTask(id3, 'err')
    expect(log.completedTasks.value).toHaveLength(2)
  })

  it('returns -1 when adding phase to non-existent task', () => {
    const log = useActivityLog()
    const idx = log.addPhase('nonexistent', 'Phase')
    expect(idx).toBe(-1)
  })

  it('updatePhase does nothing for non-existent task or phase', () => {
    const log = useActivityLog()
    log.updatePhase('nonexistent', 0, { status: 'done' })
    const id = log.addTask({ name: 'T', type: 'test' })
    log.updatePhase(id, 99, { status: 'done' })
    expect(log.tasks.value[0].phases).toHaveLength(0)
  })

  it('appendThought does nothing for non-existent task or phase', () => {
    const log = useActivityLog()
    log.appendThought('nonexistent', 0, 'text')
    const id = log.addTask({ name: 'T', type: 'test' })
    log.appendThought(id, 99, 'text')
    expect(log.tasks.value[0].phases).toHaveLength(0)
  })
})
