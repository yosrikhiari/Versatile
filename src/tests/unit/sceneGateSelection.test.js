import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { createSceneGate } from '@/composables/generation/writing/sceneGate'

// #104: on the #68 watched run, scene 3's first attempt failed for being short
// (841 of 1,200 words, critic 8), its on-target retry (1,187, critic 7.8) failed
// as "bloated" against it, and the short draft was committed. The gate fix is
// in evalGates; this is the other half: an accepted attempt is the scene.

/** `n` words in distinct ten-word sentences, so repetition checks stay quiet. */
function words(n, tag) {
  const out = []
  for (let i = 0; i < n; i++) out.push(`${tag}${i}${(i + 1) % 10 === 0 ? '.' : ''}`)
  return out.join(' ') + '.'
}

const verdict = (score, extra = {}) => ({
  score,
  pass: true,
  dimensionScores: { prose: 8, pacing: 8, continuity: 8 },
  issues: [{ text: 'minor' }],
  ...extra
})

function gate({ drafts, verdicts }) {
  const writeSceneStructured = vi.fn(async () => ({ prose: drafts.shift(), structured: {} }))
  const evaluateScene = vi.fn(async () => verdicts.shift())
  const record = vi.fn()
  const g = createSceneGate({
    currentTaskId: 't',
    abort: { signal: () => undefined },
    actLog: { appendThought: vi.fn(), addPhase: vi.fn(), updatePhase: vi.fn() },
    autoMode: ref(true),
    critic: { evaluateScene },
    evalUnavailableCount: ref(0),
    gate: async () => {},
    liveDraft: { begin: vi.fn(), push: vi.fn(), finish: vi.fn(), abandon: vi.fn(), reset: vi.fn() },
    promptAdjuster: { updateAdjustments: () => ({ focusInstructions: '' }) },
    rejectedPatterns: ref([]),
    runHealth: { record },
    scenePlan: ref([]),
    settings: {},
    spineContext: ref(''),
    storyBibleStore: { characters: [] },
    throwIfAborted: () => {},
    workspaceType: { value: 'novel' },
    writeParams: ref({}),
    writer: { writeSceneStructured },
    writtenScenes: ref([]),
    currentSceneResult: ref(null),
    persistCritiqueEval: () => {}
  })
  return { g, writeSceneStructured, record }
}

const args = {
  scene: { title: 'Tomas speaks', sceneNumber: 3, estimatedWords: 1200 },
  sceneIndex: 2,
  scenePhase: 0,
  storyArc: null,
  chapterLog: '',
  storyBible: '',
  storyContract: '',
  existingEntitiesJson: '{}',
  embeddingContext: ''
}

describe('writeSceneWithGate keeps the attempt the gate accepted (#104)', () => {
  it('commits the on-target retry over a short first attempt that scored higher', async () => {
    const short = words(841, 'a')
    const onTarget = words(1187, 'b')
    const { g, writeSceneStructured } = gate({
      drafts: [short, onTarget],
      verdicts: [verdict(8), verdict(7.8)]
    })
    const out = await g.writeSceneWithGate(args)
    expect(writeSceneStructured).toHaveBeenCalledTimes(2)
    expect(out.chosenProse).toBe(onTarget)
    expect(out.gateFailure).toBeFalsy()
  })

  it('still keeps the higher-scoring draft when the retry fails too', async () => {
    const short = words(841, 'a')
    const bloated = words(1800, 'c')
    const { g } = gate({ drafts: [short, bloated], verdicts: [verdict(8), verdict(7.8)] })
    const out = await g.writeSceneWithGate(args)
    expect(out.chosenProse).toBe(short)
  })

  it('does not let a retry the critic could not judge displace a judged draft', async () => {
    const short = words(841, 'a')
    const unjudged = words(1187, 'b')
    const { g } = gate({
      drafts: [short, unjudged],
      verdicts: [verdict(8), { evalUnavailable: true }]
    })
    const out = await g.writeSceneWithGate(args)
    expect(out.chosenProse).toBe(short)
  })
})
