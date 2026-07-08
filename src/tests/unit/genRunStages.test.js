import { describe, it, expect, beforeEach } from 'vitest'
import {
  makeInitialGenState,
  updateGenRunStage,
  saveGenRun,
  getGenRun,
  clearGenRun,
  PIPELINE_STAGES
} from '@/services/db-generation'

const projectId = 987654

describe('generation stage checkpoint (resume-from-stage)', () => {
  beforeEach(async () => {
    await clearGenRun(projectId)
  })

  it('makeInitialGenState starts at the first stage with everything pending', () => {
    const s = makeInitialGenState()
    expect(s.version).toBe(2)
    expect(s.currentStage).toBe(PIPELINE_STAGES[0])
    for (const name of PIPELINE_STAGES) {
      expect(s.stages[name].status).toBe('pending')
    }
    expect(s.stages.prose).toMatchObject({ written: 0, total: 0 })
  })

  it('advances currentStage to the first unfinished stage', async () => {
    await updateGenRunStage(projectId, 'bible', { status: 'done' })
    let run = await getGenRun(projectId)
    expect(run.state.currentStage).toBe('network')

    await updateGenRunStage(projectId, 'network', { status: 'done' })
    await updateGenRunStage(projectId, 'structure', { status: 'done' })
    run = await getGenRun(projectId)
    expect(run.state.currentStage).toBe('spine')
  })

  it('reports "complete" once every stage is done', async () => {
    for (const name of PIPELINE_STAGES) {
      await updateGenRunStage(projectId, name, { status: 'done' })
    }
    const run = await getGenRun(projectId)
    expect(run.state.currentStage).toBe('complete')
  })

  it('records a failed stage as currentStage (so resume re-enters there)', async () => {
    await updateGenRunStage(projectId, 'bible', { status: 'done' })
    await updateGenRunStage(projectId, 'network', { status: 'failed', error: 'boom' })
    const run = await getGenRun(projectId)
    expect(run.state.currentStage).toBe('network')
    expect(run.state.stages.network.error).toBe('boom')
  })

  it('preserves writing-resume fields across stage updates', async () => {
    await saveGenRun(projectId, {
      ...makeInitialGenState(),
      scenePlan: [{ sceneNumber: 1 }],
      writtenCount: 3
    })
    await updateGenRunStage(projectId, 'bible', { status: 'done' })
    const run = await getGenRun(projectId)
    expect(run.state.scenePlan).toEqual([{ sceneNumber: 1 }])
    expect(run.state.writtenCount).toBe(3)
    expect(run.state.stages.bible.status).toBe('done')
  })
})
