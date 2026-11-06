import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

/**
 * Cloud consent is a property of the project, not of the browser.
 *
 * These tests pin the two call sites that decide whether manuscript text may
 * leave the device: the beta reader's background passes and the scene gate's
 * audit-tier second opinion. Both must read the loaded project's consent, and
 * the transport must refuse a request that was not given one.
 */
const cloud = vi.hoisted(() => ({
  resolveBatchInjector: vi.fn(() => undefined),
  combineDisclosures: vi.fn(() => null),
  canUseCloudEscalation: vi.fn(() => true),
  getAnalysisTier: vi.fn(() => 'cloud-audit'),
  buildCloudDisclosure: vi.fn(async () => ({
    operation: 'Full manuscript quality audit',
    textLength: 0,
    estimatedTokens: 0,
    provider: 'openai',
    model: 'gpt-4o-mini',
    estimatedCostUsd: 0,
    warning: 'This sends text to a cloud provider.'
  })),
  maybeAutoEscalateScene: vi.fn(async () => ({ requested: true, note: '' })),
  saveRecord: vi.fn(async () => null)
}))

vi.mock('@/composables/betareader/cloudContradictions', () => ({
  resolveBatchInjector: cloud.resolveBatchInjector,
  combineDisclosures: cloud.combineDisclosures
}))
vi.mock('@/services/cloudEscalation', () => ({
  buildCloudDisclosure: cloud.buildCloudDisclosure,
  canUseCloudEscalation: cloud.canUseCloudEscalation,
  getAnalysisTier: cloud.getAnalysisTier,
  maybeAutoEscalateScene: cloud.maybeAutoEscalateScene
}))
vi.mock('@/composables/betareader/factLedger', () => ({
  extractAllFacts: vi.fn(async () => [])
}))
vi.mock('@/composables/betareader/contradictionDetector', () => ({
  detectContradictions: vi.fn(async () => [])
}))
vi.mock('@/composables/betareader/arcAnalyzer', () => ({
  analyzeArc: vi.fn(async () => ({ all: [], pacing: [], setupPayoffs: [], droppedThreads: [] }))
}))
vi.mock('@/composables/betareader/repetitionDetector', () => ({
  detectRepetitions: vi.fn(async () => [])
}))
vi.mock('@/composables/useEvalPersistence', () => ({
  useEvalPersistence: () => ({ saveRecord: cloud.saveRecord })
}))
vi.mock('@/guardrails/integration/composableGuardrails', () => ({
  guardAnalysis: vi.fn(async () => ({ ok: true }))
}))
vi.mock('@/composables/useAiService', () => ({ aiGenerateJson: vi.fn() }))

import { useBetaReader } from '@/composables/betareader/useBetaReader'
import { createSceneGate } from '@/composables/generation/writing/sceneGate'
import { useProjectStore } from '@/stores/projectStore'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useSettingsStore } from '@/stores/settingsStore'

function words(n, tag) {
  const out = []
  for (let i = 0; i < n; i++) out.push(`${tag}${i}${(i + 1) % 10 === 0 ? '.' : ''}`)
  return out.join(' ') + '.'
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  cloud.resolveBatchInjector.mockReturnValue(undefined)
})

describe('beta reader background audits', () => {
  function readerWith(consent) {
    const project = useProjectStore()
    project.currentProjectId = 'p1'
    project.cloudAuditOptIn = consent

    const manuscript = useManuscriptStore()
    manuscript.subsections = [{ id: 's1', content: '<p>The bell rang twice.</p>', sceneNumber: 1 }]

    const settings = useSettingsStore()
    settings.aiProvider = 'openai'
    settings.ollamaModel = 'gpt-4o-mini'
    settings.analysisTier = 'cloud-audit'

    return useBetaReader()
  }

  it('passes the project opt-in to every routed pass', async () => {
    await readerWith(true).scan()

    expect(cloud.resolveBatchInjector).toHaveBeenCalled()
    for (const [ctx] of cloud.resolveBatchInjector.mock.calls) {
      expect(ctx).toMatchObject({ tier: 'cloud-audit', projectOptIn: true })
    }
  })

  it('does not route when this project has not opted in', async () => {
    await readerWith(false).scan()

    expect(cloud.resolveBatchInjector).toHaveBeenCalled()
    for (const [ctx] of cloud.resolveBatchInjector.mock.calls) {
      expect(ctx).toMatchObject({ projectOptIn: false })
    }
  })
})

describe('scene gate audit-tier escalation', () => {
  function gate(consent) {
    const g = createSceneGate({
      currentTaskId: 't',
      abort: { signal: () => undefined },
      actLog: { appendThought: vi.fn(), addPhase: vi.fn(), updatePhase: vi.fn() },
      autoMode: ref(true),
      critic: {
        evaluateScene: vi.fn(async () => ({
          score: 9.5,
          pass: true,
          dimensionScores: { continuity: 8, voice: 8 },
          issues: []
        }))
      },
      evalUnavailableCount: ref(0),
      gate: async () => {},
      liveDraft: { begin: vi.fn(), push: vi.fn(), finish: vi.fn(), abandon: vi.fn() },
      promptAdjuster: { updateAdjustments: () => ({ focusInstructions: '' }) },
      projectOptIn: () => consent,
      rejectedPatterns: ref([]),
      runHealth: { record: vi.fn() },
      scenePlan: ref([]),
      settings: { aiProvider: 'openai', ollamaModel: 'gpt-4o-mini' },
      spineContext: ref(''),
      storyBibleStore: { characters: [] },
      throwIfAborted: () => {},
      workspaceType: { value: 'novel' },
      writeParams: ref({ projectId: 'p1' }),
      writer: {},
      writtenScenes: ref([]),
      currentSceneResult: ref(null),
      persistCritiqueEval: () => {}
    })
    return g
  }

  const args = {
    proseText: words(300, 'a'),
    structured: {},
    scene: { title: 'The bell', sceneNumber: 1, estimatedWords: 300 },
    sceneIndex: 0,
    scenePhase: 0,
    storyBible: '',
    chapterLog: '',
    sceneEntitiesJson: '{}',
    attemptFocusInstructions: undefined,
    baselineWordCount: 300
  }

  it('requests the second opinion with the project consent value', async () => {
    await gate(true).critiqueAttempt(args)

    expect(cloud.maybeAutoEscalateScene).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', projectOptIn: true })
    )
  })

  it('never requests it when the project callback says no', async () => {
    await gate(false).critiqueAttempt(args)

    expect(cloud.maybeAutoEscalateScene).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', projectOptIn: false })
    )
  })
})
