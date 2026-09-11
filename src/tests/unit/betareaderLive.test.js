// Live BetaReader contradictions pass: fixture multi-chapter data through
// the REAL detector + REAL Ollama LLM batches (qwen3:8b).
//
// Same opt-in contract as consistencyNovel: runs only with
// OLLAMA_LIVE_TESTS=1 (deliberate live-model check), skipped otherwise so
// the suite stays green in CI. Reachable never meant reliable — assertions
// pin structure and the deterministic findings, never the model's prose.
//
// What this covers that unit tests cannot: Pass-1 grouping + scoped
// execution + substitution ledger building + Pass-2 rules + real LLM
// batches composed in one run, against a real model backend.

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/db-digests', () => ({
  getProjectDigests: vi.fn(),
  getProjectChapterDigests: vi.fn(),
  getProjectVolumeDigests: vi.fn(),
  getEntityStateTimeline: vi.fn()
}))

import { detectContradictions } from '@/composables/betareader/contradictionDetector'
import {
  getProjectDigests,
  getProjectChapterDigests,
  getProjectVolumeDigests,
  getEntityStateTimeline
} from '@/services/db-digests'

const OLLAMA_LIVE_TESTS = process.env.OLLAMA_LIVE_TESTS === '1'

async function ollamaReachable() {
  if (!OLLAMA_LIVE_TESTS) return false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const r = await fetch('http://localhost:11434/api/tags', { signal: ctrl.signal })
    clearTimeout(t)
    return r.ok
  } catch {
    return false
  }
}

const st = (over = {}) => ({
  projectId: 'p1',
  entityType: 'character',
  entityId: '~kael',
  entityName: 'Kael',
  sceneNumber: 1,
  sourceFacts: [],
  stateHash: 'h',
  version: 1,
  updatedAt: 'T',
  ...over
})
const flags = (over = {}) => ({
  present: false,
  status: 'unknown',
  condition: 'intact',
  location: null,
  attributes: {},
  knows: [],
  ...over
})

const scenes = [
  { id: 's1', sceneNumber: 1, projectId: 'p1' },
  { id: 's2', sceneNumber: 2, projectId: 'p1' },
  { id: 's3', sceneNumber: 3, projectId: 'p1' },
  { id: 's4', sceneNumber: 4, projectId: 'p1' }
]
const ledgers = [
  {
    sceneId: 's1',
    sceneNumber: 1,
    sceneTitle: 'Arrival',
    facts: {
      characters: ['Kael'],
      locations: ['Harbor'],
      events: ['Kael docks'],
      objects: [],
      timeline: 'Day 1'
    }
  },
  {
    sceneId: 's2',
    sceneNumber: 2,
    sceneTitle: 'Storm',
    facts: {
      characters: ['Kael'],
      locations: ['Harbor'],
      events: ['Kael dies in the storm'],
      objects: [],
      timeline: 'Day 2'
    }
  },
  {
    sceneId: 's3',
    sceneNumber: 3,
    sceneTitle: 'Aftermath',
    facts: {
      characters: ['Mira'],
      locations: ['Harbor'],
      events: ['Mira mourns'],
      objects: ['compass'],
      timeline: 'Day 3'
    }
  },
  {
    sceneId: 's4',
    sceneNumber: 4,
    sceneTitle: 'Return',
    facts: {
      characters: ['Kael'],
      locations: ['Harbor'],
      events: ['Kael walks back in'],
      objects: [],
      timeline: 'Day 4'
    }
  }
]

describe('BetaReader contradictions pass (live Ollama)', () => {
  let ready = false

  beforeAll(async () => {
    ready = await ollamaReachable()
    if (!ready) return
    setActivePinia(createPinia())
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const settings = useSettingsStore()
    settings.localOnly = true
    settings.ollamaModel = 'qwen3:8b'
    // The provider defaults to the relative `/ollama` endpoint, which only
    // resolves behind the vite dev-server proxy. Without this line every
    // batch fails fast to null and the test passes vacuously — proven by
    // /api/ps showing no loaded model after a "green" run.
    const { setOllamaEndpoint } = await import('@/config/ollama')
    setOllamaEndpoint('http://localhost:11434')
    getProjectDigests.mockResolvedValue([])
    getProjectChapterDigests.mockResolvedValue([])
    getProjectVolumeDigests.mockResolvedValue([])
    // Kael: dead ch1 (s2), present ch2 (s4) with asserting facts so the
    // adjacent-claims path yields candidates → real LLM batches run.
    // Mira: steady presence ch2 (s3), also asserting.
    getEntityStateTimeline.mockResolvedValue([
      st({
        sceneId: 's1',
        sceneNumber: 1,
        chapterNumber: 1,
        state: flags({ present: true, status: 'healthy' }),
        sourceFacts: ['Kael docks']
      }),
      st({
        sceneId: 's2',
        sceneNumber: 2,
        chapterNumber: 1,
        state: flags({ status: 'dead' }),
        sourceFacts: ['Kael dies in the storm']
      }),
      st({
        sceneId: 's3',
        sceneNumber: 3,
        chapterNumber: 2,
        entityId: '~mira',
        entityName: 'Mira',
        state: flags({ present: true, status: 'healthy' }),
        sourceFacts: ['Mira mourns']
      }),
      st({
        sceneId: 's4',
        sceneNumber: 4,
        chapterNumber: 2,
        state: flags({ present: true, status: 'healthy' }),
        sourceFacts: ['Kael walks back in']
      })
    ])
  })
  ;(OLLAMA_LIVE_TESTS ? it : it.skip)(
    'completes with deterministic resurrection plus well-formed LLM findings',
    async () => {
      if (!ready) return
      const out = await detectContradictions(ledgers, scenes, {})
      // Proof inference actually happened: without it this whole test
      // passes vacuously (batches fail fast to null and only the
      // deterministic finding asserts). A loaded completion model within
      // keepalive means Ollama did work for this run.
      const ps = await fetch('http://localhost:11434/api/ps').then((r) => r.json())
      expect((ps.models || []).length).toBeGreaterThan(0)
      // Deterministic Pass-2 resurrection must survive the live run.
      const deaths = out.filter((r) => r.category === 'dead_then_alive')
      expect(deaths.length).toBeGreaterThanOrEqual(1)
      expect(deaths[0].severity).toBe('warning')
      // Every finding — deterministic or model-made — carries the display contract.
      for (const r of out) {
        expect(typeof r.id).toBe('string')
        expect(Array.isArray(r.betweenScenes)).toBe(true)
        expect(r.pass).toBe('contradictions')
      }
    },
    300000
  )
})
