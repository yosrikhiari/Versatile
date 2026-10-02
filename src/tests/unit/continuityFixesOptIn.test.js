import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/composables/useStoryDocuments', () => ({
  useStoryDocuments: vi.fn(() => ({ getStoryDocumentContext: vi.fn(async () => '') }))
}))

const { ConsistencyService } =
  await import('@/composables/generation/consistency/ConsistencyService')

// UX-AUDIT #51 / #64: the fix rounds rewrite scenes the writer has seen land
// and cost more than the writing on a local model, so they are opt-in.

const ISSUE = {
  characterIssues: [
    {
      character: 'Ada',
      contradictions: [{ type: 'state', description: 'alive in Ch1, dead in Ch2', between: [] }]
    }
  ],
  locationIssues: []
}
const CLEAN = { characterIssues: [], locationIssues: [] }

function service({ autoMode, fixesEnabled, report = ISSUE }) {
  const actLog = {
    addPhase: vi.fn(() => 'phase'),
    updatePhase: vi.fn(),
    appendThought: vi.fn()
  }
  const critic = {
    checkContradictions: vi.fn().mockResolvedValueOnce(report).mockResolvedValue(CLEAN)
  }
  const svc = new ConsistencyService({
    writeParams: ref({ storyBibleDocs: 'bible' }),
    scenePlan: ref([{}, {}]),
    chapterPlan: ref([]),
    spineArray: ref([]),
    autoMode: ref(autoMode),
    ...(fixesEnabled === undefined ? {} : { fixesEnabled: ref(fixesEnabled) }),
    writtenScenes: ref([
      { prose: 'Ada walked in.', characters: ['Ada'] },
      { prose: 'They buried Ada.', characters: ['Ada'] }
    ]),
    consistencyReport: ref(null),
    phase: ref(''),
    progress: {},
    storyBibleStore: { characters: [{ name: 'Ada' }, { name: 'Ben' }], locations: [] },
    critic,
    writer: {},
    manuscriptStore: {},
    updateGenRunStage: vi.fn(),
    actLog
  })
  svc.rewriteSceneForConsistency = vi.fn(async () => {})
  return { svc, critic, actLog }
}

describe('continuity fixes are opt-in', () => {
  it('reports but rewrites nothing in a one-click run with fixes off', async () => {
    const { svc, critic, actLog } = service({ autoMode: true, fixesEnabled: false })
    const result = await svc.runTerminalConsistencyAudit('p', 't')
    expect(result).toEqual({ issueCount: 1, checked: true })
    expect(svc.rewriteSceneForConsistency).not.toHaveBeenCalled()
    expect(critic.checkContradictions).toHaveBeenCalledTimes(1)
    // The log says why nothing was rewritten.
    expect(actLog.appendThought).toHaveBeenCalledWith(
      't',
      'phase',
      expect.stringContaining('Fixing continuity is off')
    )
  })

  it('is off when the caller does not supply the setting', async () => {
    const { svc } = service({ autoMode: true })
    await svc.runTerminalConsistencyAudit('p', 't')
    expect(svc.rewriteSceneForConsistency).not.toHaveBeenCalled()
  })

  it('rewrites the flagged scene and rechecks when the writer opted in', async () => {
    const { svc, critic, actLog } = service({ autoMode: true, fixesEnabled: true })
    const result = await svc.runTerminalConsistencyAudit('p', 't')
    expect(svc.rewriteSceneForConsistency).toHaveBeenCalledTimes(1)
    expect(svc.rewriteSceneForConsistency.mock.calls[0][1]).toBe(1) // the later scene
    expect(critic.checkContradictions).toHaveBeenCalledTimes(2)
    expect(result.issueCount).toBe(0)
    expect(actLog.appendThought).not.toHaveBeenCalled()
  })

  it('never rewrites outside one-click mode, even when opted in', async () => {
    const { svc, actLog } = service({ autoMode: false, fixesEnabled: true })
    await svc.runTerminalConsistencyAudit('p', 't')
    expect(svc.rewriteSceneForConsistency).not.toHaveBeenCalled()
    expect(actLog.appendThought).not.toHaveBeenCalled()
  })

  it('says nothing about fixing when the audit found nothing', async () => {
    const { svc, actLog } = service({ autoMode: true, fixesEnabled: false, report: CLEAN })
    await svc.runTerminalConsistencyAudit('p', 't')
    expect(actLog.appendThought).not.toHaveBeenCalled()
  })
})
