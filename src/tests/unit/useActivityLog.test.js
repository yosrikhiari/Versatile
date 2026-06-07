import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('useActivityLog', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function createLog() {
    const mod = await import('../../composables/useActivityLog')
    return mod.useActivityLog()
  }

  it('starts with empty tasks', async () => {
    const log = await createLog()
    expect(log.tasks.value).toEqual([])
  })

  it('addTask creates a running task and returns id', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    expect(log.tasks.value).toHaveLength(1)
    expect(log.tasks.value[0].name).toBe('Test')
    expect(log.tasks.value[0].type).toBe('generate')
    expect(log.tasks.value[0].status).toBe('running')
    expect(id).toBe('act-1')
  })

  it('updateTask updates task properties', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.updateTask(id, { progress: { current: 5, total: 10, label: 'half' } })
    expect(log.tasks.value[0].progress.current).toBe(5)
  })

  it('updateTask does nothing for unknown id', async () => {
    const log = await createLog()
    log.addTask({ name: 'Test', type: 'generate' })
    log.updateTask('unknown', { name: 'Changed' })
    expect(log.tasks.value[0].name).toBe('Test')
  })

  it('completeTask marks task as done', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.addPhase(id, 'phase 1')
    log.completeTask(id)
    expect(log.tasks.value[0].status).toBe('done')
    expect(log.tasks.value[0].completedAt).not.toBeNull()
    expect(log.tasks.value[0].phases[0].status).toBe('done')
  })

  it('failTask marks task as failed', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.failTask(id, 'Something went wrong')
    expect(log.tasks.value[0].status).toBe('failed')
    expect(log.tasks.value[0].error).toBe('Something went wrong')
  })

  it('addPhase adds phase to task', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    const index = log.addPhase(id, 'thinking')
    expect(index).toBe(0)
    expect(log.tasks.value[0].phases[0].name).toBe('thinking')
  })

  it('addPhase returns -1 for unknown task', async () => {
    const log = await createLog()
    expect(log.addPhase('unknown', 'test')).toBe(-1)
  })

  it('updatePhase modifies phase by index', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.addPhase(id, 'thinking')
    log.updatePhase(id, 0, { status: 'done' })
    expect(log.tasks.value[0].phases[0].status).toBe('done')
  })

  it('updatePhase does nothing for out-of-range index', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.addPhase(id, 'thinking')
    log.updatePhase(id, 5, { status: 'done' })
    expect(log.tasks.value[0].phases[0].status).toBe('running')
  })

  it('appendThought adds text to a phase', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.addPhase(id, 'thinking')
    log.appendThought(id, 0, 'Hello ')
    log.appendThought(id, 0, 'World')
    expect(log.tasks.value[0].phases[0].thought).toBe('Hello World')
  })

  it('appendThought does nothing for invalid phase', async () => {
    const log = await createLog()
    const id = log.addTask({ name: 'Test', type: 'generate' })
    log.appendThought(id, 0, 'Should not appear')
    expect(log.tasks.value[0].phases).toHaveLength(0)
  })

  it('activeTasks returns only running tasks', async () => {
    const log = await createLog()
    log.addTask({ name: 'Running', type: 'generate' })
    const id2 = log.addTask({ name: 'Done', type: 'generate' })
    log.completeTask(id2)
    expect(log.activeTasks.value).toHaveLength(1)
    expect(log.activeTasks.value[0].name).toBe('Running')
  })

  it('completedTasks returns done and failed tasks', async () => {
    const log = await createLog()
    log.addTask({ name: 'Running', type: 'generate' })
    const id2 = log.addTask({ name: 'Failed', type: 'generate' })
    log.failTask(id2, 'err')
    expect(log.completedTasks.value).toHaveLength(1)
    expect(log.completedTasks.value[0].name).toBe('Failed')
  })

  it('clearCompleted removes all non-running tasks', async () => {
    const log = await createLog()
    log.addTask({ name: 'Running', type: 'generate' })
    const id2 = log.addTask({ name: 'Done', type: 'generate' })
    log.completeTask(id2)
    log.clearCompleted()
    expect(log.tasks.value).toHaveLength(1)
    expect(log.tasks.value[0].name).toBe('Running')
  })

  it('removeTask removes task by id', async () => {
    const log = await createLog()
    const id1 = log.addTask({ name: 'A', type: 'generate' })
    log.addTask({ name: 'B', type: 'generate' })
    log.removeTask(id1)
    expect(log.tasks.value).toHaveLength(1)
    expect(log.tasks.value[0].name).toBe('B')
  })
})
