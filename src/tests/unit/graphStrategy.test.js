import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

// ── Module mocks ─────────────────────────────────────────────────────────
const editorModel = vi.fn()
vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => editorModel(...args),
  aiGenerateStructured: (...args) => editorModel(...args),
  aiStream: vi.fn(),
  resolveFeatureConfig: vi.fn()
}))
vi.mock('@/services/langfuseService', () => ({
  langfuseService: { span: vi.fn(), endSpan: vi.fn() }
}))
vi.mock('@/services/researchScope', () => ({ buildRagOptions: () => null }))
vi.mock('@/composables/generation/context/sceneContext', () => ({
  buildRetrievalContext: async () => ''
}))
vi.mock('@/composables/generation/utils', () => ({
  computeSummary: async (prose) => `summary of ${prose.slice(0, 10)}`
}))
const logAgentDecision = vi.fn(async () => {})
const updateGenRunStage = vi.fn(async () => {})
vi.mock('@/services/db-generation', () => ({
  logAgentDecision: (...a) => logAgentDecision(...a),
  updateGenRunStage: (...a) => updateGenRunStage(...a)
}))
const syncChapterToBible = vi.fn(async () => ({
  discovered: 0,
  entitiesCreated: 0,
  edgesWritten: 0,
  changes: []
}))
vi.mock('@/composables/generation/writing/bibleSync', () => ({
  syncChapterToBible: (...a) => syncChapterToBible(...a)
}))

const { createGraphStrategy } = await import('@/composables/generation/writing/graphStrategy')
const { db } = await import('@/services/db-core')
const { setOllamaModel, setOllamaUtilityModel } = await import('@/config/ollama')
const { resetRolePlacements, setRolePlacement } = await import('@/config/roles')

// ── Fixtures ─────────────────────────────────────────────────────────────
const scenes = [
  {
    title: 'Harbour',
    sceneNumber: 1,
    subsectionId: 'sub-1',
    characters: ['Mara'],
    location: 'quay',
    estimatedWords: 800
  },
  {
    title: 'Storm',
    sceneNumber: 2,
    subsectionId: 'sub-2',
    characters: ['Mara'],
    location: 'sea',
    estimatedWords: 800
  },
  {
    title: 'Landfall',
    sceneNumber: 3,
    subsectionId: 'sub-3',
    characters: ['Mara'],
    location: 'shore',
    estimatedWords: 800
  }
]
const chapters = [
  { chapterNumber: 1, scenes: [scenes[0], scenes[1]], hookEnding: 'the mast cracks' },
  { chapterNumber: 2, scenes: [scenes[2]], hookEnding: 'a light on the shore' }
]

function makeCtx() {
  const writtenScenes = ref([])
  const manuscriptStore = { updateSubsectionData: vi.fn(async () => {}) }
  const runHealth = {
    record: vi.fn(),
    recordSuccess: vi.fn(),
    resetStreak: vi.fn(),
    failedScenes: () => 0,
    streak: () => 0,
    shouldAbort: () => false,
    getAbortReason: () => null
  }
  const actLog = { addPhase: vi.fn(() => 1), updatePhase: vi.fn(), appendThought: vi.fn() }
  return {
    ctx: {
      currentTaskId: 'task',
      actLog,
      autoMode: ref(true),
      chapterPlan: ref(chapters),
      commitService: { persistCheckpoint: vi.fn(async () => {}) },
      completeGeneration: vi.fn(async () => {}),
      evalStore: { results: [], setResults: vi.fn() },
      gate: async () => {},
      generationSpanIds: {},
      generationTraceId: ref('trace'),
      haltRun: vi.fn(async () => {}),
      inlineEvalEnabled: ref(false),
      manuscriptStore,
      persistCritiqueEval: vi.fn(),
      progress: { total: 0, current: 0, statusText: '' },
      recordSceneDigest: vi.fn(),
      runFailedScenes: ref(0),
      runHealth,
      scenePlan: ref(scenes),
      scopedEntitiesBlob: async () => '{}',
      throwIfAborted: () => {},
      writtenScenes,
      spineArray: ref([{ emotionalStateAtEnd: 'dread' }]),
      volumeId: ref('vol-1'),
      writer: { sessionBudget: null },
      abort: { signal: () => undefined },
      delegatorApi: { dispatch: vi.fn(async () => {}) },
      syncPreview: ref(null),
      hasPendingBatches: ref(false),
      bibleChangesDiscovered: ref(0),
      scenesSynced: ref(0),
      structuredResults: [],
      sync: { discoverSync: () => [], commitSync: async () => true }
    },
    manuscriptStore,
    writtenScenes,
    runHealth,
    actLog
  }
}

const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * A scripted gate. `verdicts[index]` is the list of critic outcomes for that
 * scene, consumed in order; `holdDraft` lets a test keep a draft in flight
 * until it says otherwise, to prove overlap.
 */
function makeGate({ verdicts, holdDraft = {} }) {
  const events = []
  const gate = {
    makeSceneStream: () => ({ emitChunk: () => {}, done: () => {}, abandon: () => {} }),
    chapterLogBefore: () => '',
    sceneEntitiesFor: () => '{}',
    draftAttempt: vi.fn(async (args) => {
      events.push(`draft:start:${args.sceneIndex}:a${args.attempt}`)
      if (holdDraft[args.sceneIndex]) await holdDraft[args.sceneIndex].promise
      events.push(`draft:end:${args.sceneIndex}`)
      return {
        ok: true,
        prose:
          `prose ${args.sceneIndex} attempt ${args.attempt} ${args.attemptFocusInstructions || ''}`.trim(),
        structured: { metadataStatus: 'ok', keyFacts: [`fact ${args.sceneIndex}`] }
      }
    }),
    critiqueAttempt: vi.fn(async (args) => {
      events.push(`critique:start:${args.sceneIndex}`)
      const script = verdicts[args.sceneIndex] || []
      const v = script.shift() ?? { score: 8, pass: true }
      events.push(`critique:end:${args.sceneIndex}`)
      const criticResult = {
        score: v.score,
        pass: v.pass,
        dimensionScores: { continuity: v.continuity ?? 8 },
        issues: v.issues || []
      }
      return {
        criticResult,
        accept: v.pass,
        feedback: v.pass ? undefined : `scene ${args.sceneIndex} failed`,
        focusInstructions: v.pass ? undefined : 'fix pacing'
      }
    }),
    markGateOutcome: ({ chosenEval }) =>
      chosenEval && chosenEval.pass === false ? 'kept for review' : null
  }
  return { gate, events }
}

beforeEach(async () => {
  localStorage.clear()
  resetRolePlacements()
  setOllamaModel('qwen3:8b')
  setOllamaUtilityModel('qwen3:8b')
  editorModel.mockReset()
  logAgentDecision.mockClear()
  syncChapterToBible.mockClear()
  await db.graphCheckpoints.clear()
})

describe('graph strategy — workflow mode', () => {
  it('writes every scene, critiques while drafting, revises a failed scene, syncs each chapter, and logs every step', async () => {
    const { ctx, manuscriptStore, writtenScenes } = makeCtx()
    const hold = { 1: deferred() }
    const { gate, events } = makeGate({
      verdicts: {
        1: [
          { score: 5, pass: false, issues: [{ description: 'flat middle' }] },
          { score: 8, pass: true }
        ]
      },
      holdDraft: hold
    })
    // Scene 1's draft stays in flight until scene 0's critique has started —
    // the assertion below is the whole point of two lanes.
    const origCritique = gate.critiqueAttempt.getMockImplementation()
    gate.critiqueAttempt.mockImplementation(async (args) => {
      if (args.sceneIndex === 0) hold[1].resolve()
      return origCritique(args)
    })

    const { runGraphGeneration } = createGraphStrategy(ctx, gate)
    await runGraphGeneration(
      { projectId: 'p1', storyArc: null, storyBibleDocs: '', storyContract: '', onChunk: null },
      { mode: 'workflow', lookahead: 2 }
    )

    // Overlap: scene 0 was being judged while scene 1 was still being drafted.
    expect(events.indexOf('critique:start:0')).toBeLessThan(events.indexOf('draft:end:1'))

    // Scene 1 failed once and was revised with the critic's feedback.
    const drafts = gate.draftAttempt.mock.calls.map((c) => c[0])
    expect(drafts.filter((d) => d.sceneIndex === 1)).toHaveLength(2)
    const revise = drafts.find((d) => d.sceneIndex === 1 && d.attempt === 1)
    expect(revise.attemptFeedback).toBe('scene 1 failed')
    expect(revise.attemptFocusInstructions).toBe('fix pacing')

    // Every scene committed as generated (scene 1's second attempt passed).
    expect(writtenScenes.value.filter(Boolean)).toHaveLength(3)
    const statuses = manuscriptStore.updateSubsectionData.mock.calls.map((c) => [
      c[0],
      c[1].contentStatus
    ])
    expect(statuses).toEqual(
      expect.arrayContaining([
        ['sub-1', 'generated'],
        ['sub-2', 'generated'],
        ['sub-3', 'generated']
      ])
    )
    // One bible sync per chapter, when its last scene landed.
    expect(syncChapterToBible).toHaveBeenCalledTimes(2)
    expect(ctx.completeGeneration).toHaveBeenCalledWith('p1')
    expect(ctx.progress.current).toBe(3)

    // Every superstep logged, all from the workflow policy, none from a model.
    expect(logAgentDecision.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(logAgentDecision.mock.calls.every((c) => c[0].source === 'workflow')).toBe(true)
    expect(editorModel).not.toHaveBeenCalled()

    // The run checkpointed into Dexie under its thread.
    const rows = await db.graphCheckpoints.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].projectId).toBe('p1')
    expect(updateGenRunStage).toHaveBeenCalledWith(
      'p1',
      'prose',
      expect.objectContaining({ orchestrator: 'langgraph', mode: 'workflow' })
    )
  })

  it('refuses to start when the placement names two different GPU models', async () => {
    setRolePlacement('critic', { model: 'gemma3:4b', device: 'gpu' })
    const { ctx } = makeCtx()
    const { gate } = makeGate({ verdicts: {} })
    const { runGraphGeneration } = createGraphStrategy(ctx, gate)
    await expect(
      runGraphGeneration(
        { projectId: 'p1', storyArc: null, storyBibleDocs: '', storyContract: '', onChunk: null },
        { mode: 'workflow' }
      )
    ).rejects.toThrow(/evicts the first/)
    expect(gate.draftAttempt).not.toHaveBeenCalled()
  })
})

describe('graph strategy — agentic mode', () => {
  it('lets the Editor model accept a failed scene for review instead of revising it', async () => {
    const { ctx, manuscriptStore } = makeCtx()
    const { gate } = makeGate({
      verdicts: { 1: [{ score: 6.5, pass: false, issues: [{ description: 'slightly rushed' }] }] }
    })
    // The model chooses: keep drafting, and commit scene 1 for review.
    editorModel.mockImplementation(async (prompt) => {
      const lineAfter = (label) =>
        String(prompt)
          .split('\n')
          .find((l) => l.includes(label)) ?? ''
      const gpuLine = lineAfter('gpu lane:')
      const cpuLine = lineAfter('cpu lane:')
      if (/commit #1/.test(cpuLine)) {
        const nextDraft = gpuLine.match(/draft #(\d+)/)
        return {
          gpu: nextDraft
            ? { action: 'draft', target: Number(nextDraft[1]) }
            : { action: 'wait', target: null },
          cpu: { action: 'commit', target: 1 },
          why: 'near miss, keep moving'
        }
      }
      // Anything else: an illegal answer (the fallback path has its own unit tests).
      return {
        gpu: { action: 'stop', target: null },
        cpu: { action: 'wait', target: null },
        why: 'lazy'
      }
    })

    const { runGraphGeneration } = createGraphStrategy(ctx, gate)
    await runGraphGeneration(
      { projectId: 'p2', storyArc: null, storyBibleDocs: '', storyContract: '', onChunk: null },
      { mode: 'agentic', lookahead: 2 }
    )

    // Scene 1 was drafted once and committed for review — no revise.
    const drafts = gate.draftAttempt.mock.calls.map((c) => c[0].sceneIndex)
    expect(drafts.filter((i) => i === 1)).toHaveLength(1)
    const sub2 = manuscriptStore.updateSubsectionData.mock.calls.find((c) => c[0] === 'sub-2')
    expect(sub2[1].contentStatus).toBe('review')

    const sources = logAgentDecision.mock.calls.map((c) => c[0].source)
    expect(sources).toContain('model')
    const modelRow = logAgentDecision.mock.calls.find((c) => c[0].source === 'model')[0]
    expect(modelRow.cpu).toEqual({ action: 'commit', target: 1 })
    expect(modelRow.mode).toBe('agentic')
    // The Editor was called with its own role.
    expect(editorModel.mock.calls.some((c) => c[2]?.role === 'editor')).toBe(true)
    expect(ctx.completeGeneration).toHaveBeenCalledWith('p2')
  })
})
