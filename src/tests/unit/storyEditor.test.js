import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Editor calls aiGenerateJson with a schema, which routes to
// aiGenerateStructured — mocked at the service like the critic tests do.
const aiGenerateJson = vi.fn()
vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => aiGenerateJson(...args),
  aiGenerateStructured: (...args) => aiGenerateJson(...args),
  aiStream: vi.fn(),
  resolveFeatureConfig: vi.fn()
}))

const { legalMoves, workflowDecision, validateEditorAnswer, buildEditorPrompt, useStoryEditor } =
  await import('@/composables/useStoryEditor')

const scene = (index, over = {}) => ({
  index,
  title: `S${index}`,
  status: 'planned',
  attempts: 0,
  score: null,
  pass: null,
  continuity: null,
  topIssues: [],
  gateFailure: null,
  ...over
})

const state = (scenes, over = {}) => ({
  scenes,
  budget: { maxAttempts: 2, lookahead: 2, budgetNote: null },
  gpuBusy: false,
  cpuBusy: false,
  recent: [],
  ...over
})

// Braces matter: a hook that *returns* the spy hands Vitest a teardown function,
// which then calls the mock after the test — and a rejecting mock becomes an
// unhandled rejection attributed to the test.
beforeEach(() => {
  aiGenerateJson.mockReset()
})

describe('legalMoves — the fence', () => {
  it('fresh run: draft the first scene, nothing to critique', () => {
    const legal = legalMoves(state([scene(0), scene(1), scene(2)]))
    expect(legal.gpu).toEqual([{ action: 'draft', target: 0 }])
    expect(legal.cpu).toEqual([{ action: 'wait', target: null }])
  })

  it('one draft waiting: critique it while drafting the next (the overlap)', () => {
    const legal = legalMoves(
      state([scene(0, { status: 'drafted', attempts: 1 }), scene(1), scene(2)])
    )
    expect(legal.gpu).toEqual([{ action: 'draft', target: 1 }])
    expect(legal.cpu).toEqual([{ action: 'critique', target: 0 }])
  })

  it('the lookahead caps how far the writer runs ahead of the critic', () => {
    const legal = legalMoves(
      state([
        scene(0, { status: 'drafted', attempts: 1 }),
        scene(1, { status: 'drafted', attempts: 1 }),
        scene(2)
      ])
    )
    expect(legal.gpu).toEqual([{ action: 'wait', target: null }])
    expect(legal.cpu).toEqual([{ action: 'critique', target: 0 }])
  })

  it('a failed verdict with attempts left offers revise (gpu) and accept-for-review (cpu)', () => {
    const legal = legalMoves(
      state([scene(0, { status: 'critiqued', attempts: 1, score: 6, pass: false }), scene(1)])
    )
    expect(legal.gpu[0]).toEqual({ action: 'revise', target: 0 })
    expect(legal.gpu).toContainEqual({ action: 'draft', target: 1 })
    expect(legal.cpu).toContainEqual({ action: 'commit', target: 0 })
  })

  it('a failed verdict with no attempts left is not a choice (the graph commits it)', () => {
    const legal = legalMoves(
      state([scene(0, { status: 'critiqued', attempts: 2, score: 6, pass: false }), scene(1)])
    )
    expect(legal.gpu).toEqual([{ action: 'draft', target: 1 }])
    expect(legal.cpu).toEqual([{ action: 'wait', target: null }])
  })

  it('everything committed: stop', () => {
    const legal = legalMoves(
      state([scene(0, { status: 'committed' }), scene(1, { status: 'failed' })])
    )
    expect(legal.gpu).toEqual([{ action: 'stop', target: null }])
  })
})

describe('workflowDecision — the legacy order as a function', () => {
  it('revises before drafting and never accepts a failed scene early', () => {
    const d = workflowDecision(
      state([
        scene(0, { status: 'critiqued', attempts: 1, score: 6, pass: false }),
        scene(1, { status: 'drafted', attempts: 1 }),
        scene(2)
      ])
    )
    expect(d.source).toBe('workflow')
    expect(d.gpu).toEqual({ action: 'revise', target: 0 })
    expect(d.cpu).toEqual({ action: 'critique', target: 1 })
  })
})

describe('validateEditorAnswer', () => {
  const legal = {
    gpu: [
      { action: 'revise', target: 0 },
      { action: 'draft', target: 1 }
    ],
    cpu: [
      { action: 'critique', target: 2 },
      { action: 'commit', target: 0 }
    ]
  }

  it('accepts a legal answer and keeps revise instructions', () => {
    const { decision, reason } = validateEditorAnswer(
      {
        gpu: { action: 'revise', target: 0, instructions: 'cut the flashback' },
        cpu: { action: 'critique', target: 2 },
        why: 'continuity failed'
      },
      legal
    )
    expect(reason).toBeNull()
    expect(decision.gpu).toEqual({ action: 'revise', target: 0, instructions: 'cut the flashback' })
    expect(decision.cpu).toEqual({ action: 'critique', target: 2 })
  })

  it('rejects an illegal move, a missing lane, and a scene on both lanes', () => {
    expect(
      validateEditorAnswer(
        { gpu: { action: 'draft', target: 5 }, cpu: { action: 'critique', target: 2 } },
        legal
      ).reason
    ).toMatch(/not a legal move/)
    expect(validateEditorAnswer({ gpu: { action: 'draft', target: 1 } }, legal).reason).toMatch(
      /cpu: missing/
    )
    expect(
      validateEditorAnswer(
        { gpu: { action: 'revise', target: 0 }, cpu: { action: 'commit', target: 0 } },
        legal
      ).reason
    ).toMatch(/both lanes/)
    expect(validateEditorAnswer('nope', legal).reason).toBe('not an object')
  })
})

describe('useStoryEditor.decideAgentic', () => {
  it('skips the model when only one move is legal per lane', async () => {
    const editor = useStoryEditor()
    const d = await editor.decideAgentic(state([scene(0), scene(1)]))
    expect(aiGenerateJson).not.toHaveBeenCalled()
    expect(d.source).toBe('workflow')
    expect(d.gpu).toEqual({ action: 'draft', target: 0 })
  })

  it('uses the model answer when it is legal, with the editor role and a schema', async () => {
    aiGenerateJson.mockResolvedValue({
      gpu: { action: 'draft', target: 1 },
      cpu: { action: 'commit', target: 0 },
      why: 'accept the near miss'
    })
    const editor = useStoryEditor()
    const s = state([
      scene(0, { status: 'critiqued', attempts: 1, score: 6.5, pass: false }),
      scene(1)
    ])
    const d = await editor.decideAgentic(s)
    expect(d.source).toBe('model')
    expect(d.cpu).toEqual({ action: 'commit', target: 0 })
    const opts = aiGenerateJson.mock.calls[0][2]
    expect(opts.role).toBe('editor')
    expect(opts.schemaName).toBe('editor_decision')
    expect(opts.temperature).toBe(0.2)
    expect(buildEditorPrompt(s, legalMoves(s))).toMatch(
      /LEGAL MOVES — gpu lane: revise #0 \| draft #1/
    )
  })

  it('falls back to the workflow order on an illegal answer and records why', async () => {
    aiGenerateJson.mockResolvedValue({
      gpu: { action: 'stop', target: null },
      cpu: { action: 'wait', target: null },
      why: ''
    })
    const editor = useStoryEditor()
    const s = state([
      scene(0, { status: 'critiqued', attempts: 1, score: 6, pass: false }),
      scene(1)
    ])
    const d = await editor.decideAgentic(s)
    expect(d.source).toBe('fallback')
    expect(d.rejected.reason).toMatch(/not a legal move/)
    expect(d.gpu).toEqual({ action: 'revise', target: 0 })
  })

  it('falls back when the call itself fails', async () => {
    aiGenerateJson.mockImplementation(() => Promise.reject(new Error('ollama down')))
    const editor = useStoryEditor()
    const s = state([
      scene(0, { status: 'critiqued', attempts: 1, score: 6, pass: false }),
      scene(1)
    ])
    const d = await editor.decideAgentic(s)
    expect(d.source).toBe('fallback')
    expect(d.rejected.reason).toMatch(/call failed: ollama down/)
  })
})
