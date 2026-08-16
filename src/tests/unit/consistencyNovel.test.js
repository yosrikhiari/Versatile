// Regression lock for the multi-chapter consistency pipeline.
//
// Exercises the SAME real consistency modules the headless harness
// (scripts/test-multichapter-novel.mjs) wires together, so a regression in the
// app's fact ledger, fix-planning, or fact-canon guard is caught without spinning
// up Ollama. The AI critic (checkContradictions) is exercised only when a local
// Ollama is reachable, and skipped otherwise so the suite stays green in CI.
//
// Real modules under test:
//   - buildFactLedger            src/composables/generation/context/sceneContext.ts
//   - planConsistencyFixes       src/composables/generation/context/sceneContext.ts
//   - createFactCanonGuard       src/guardrails/guards/factCanonGuard.ts
//   - useStoryCritic.checkContradictions  src/composables/useStoryCritic.ts (optional)

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import {
  buildFactLedger,
  planConsistencyFixes
} from '../../composables/generation/context/sceneContext'
import { createFactCanonGuard } from '../../guardrails/guards/factCanonGuard'

// ---- deterministic, no-Ollama tests -----------------------------------------

describe('consistency pipeline (deterministic)', () => {
  it('buildFactLedger accumulates key facts per chapter, prefixed by chapter', () => {
    const written = [
      { chapterId: 1, keyFacts: ['Elara found the forbidden tome', 'Kaelen is missing'] },
      { chapterId: 2, keyFacts: ['Mira is a spy for the cult', 'The cult meets at dusk'] },
      { chapterId: 3, keyFacts: ['Kaelen reappears alive'] }
    ]
    const ledger = buildFactLedger(null, written)
    expect(ledger).toHaveLength(5)
    expect(ledger[0]).toMatch(/^Ch1:/)
    expect(ledger.some((l) => l.includes('Kaelen is missing'))).toBe(true)
    expect(ledger.some((l) => l.includes('Kaelen reappears alive'))).toBe(true)
  })

  it('buildFactLedger ignores scenes without keyFacts', () => {
    const written = [
      { chapterId: 1, keyFacts: ['Elara found the forbidden tome'] },
      { chapterId: 2 }, // missing keyFacts entirely
      { chapterId: 3, keyFacts: [] }
    ]
    const ledger = buildFactLedger(null, written)
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toBe('Ch1: Elara found the forbidden tome')
  })

  it('planConsistencyFixes maps a critic report to the offending scene index', () => {
    const written = [
      {
        prose:
          'Kaelen Dain is missing under suspicious circumstances and was last seen searching for the prophecy.',
        characters: ['Kaelen Dain'],
        location: 'The Archive',
        chapterId: 1
      },
      {
        prose: 'Kaelen Dain reappears as part of the cult seeking to summon the Void God.',
        characters: ['Kaelen Dain'],
        location: 'The Archive',
        chapterId: 2
      }
    ]
    // `between` excerpts are substrings of the prose so findByExcerpt can locate them.
    const report = {
      characterIssues: [
        {
          character: 'Kaelen Dain',
          contradictions: [
            {
              type: 'timeline',
              description: 'missing vs reappears',
              between: [
                'Kaelen Dain is missing under suspicious circumstances and was last seen searching for the prophecy.'
              ]
            }
          ]
        }
      ],
      locationIssues: []
    }
    const fixes = planConsistencyFixes(report, written)
    expect([...fixes.keys()]).toContain(0)
  })

  it('factCanonGuard flags a new fact that negates an established ledger fact', () => {
    const guard = createFactCanonGuard(
      { refresh() {} },
      {
        enabled: true,
        getFactLedger: () => ['Elara is a grieving scholar']
      }
    )
    const hits = guard({
      data: { keyFacts: ['Elara is not a grieving scholar'] },
      layer: 'scene',
      sceneId: 'ch2'
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].passed).toBe(false)
  })

  it('factCanonGuard passes when the new fact does not negate the ledger', () => {
    const guard = createFactCanonGuard(
      { refresh() {} },
      {
        enabled: true,
        getFactLedger: () => ['Elara is a grieving scholar']
      }
    )
    const hits = guard({
      data: { keyFacts: ['Elara studies the forbidden tome'] },
      layer: 'scene',
      sceneId: 'ch2'
    })
    expect(hits).toHaveLength(0)
  })

  it('factCanonGuard is a no-op when disabled', () => {
    const guard = createFactCanonGuard(
      { refresh() {} },
      {
        enabled: false,
        getFactLedger: () => ['Elara is a grieving scholar']
      }
    )
    const hits = guard({
      data: { keyFacts: ['Elara is not a grieving scholar'] },
      layer: 'scene',
      sceneId: 'ch2'
    })
    expect(hits).toHaveLength(0)
  })
})

// ---- optional AI critic test (only when a local Ollama is reachable) ---------

async function ollamaReachable() {
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

describe('consistency pipeline (AI critic, requires local Ollama)', () => {
  let ready = false
  let critic

  beforeAll(async () => {
    ready = await ollamaReachable()
    if (!ready) return
    setActivePinia(createPinia())
    const { useSettingsStore } = await import('../../stores/settingsStore')
    const settings = useSettingsStore()
    settings.localOnly = true
    settings.ollamaModel = 'qwen3:8b'
    const { useStoryCritic } = await import('../../composables/useStoryCritic')
    critic = useStoryCritic()
  })

  it('checkContradictions finds zero issues for a self-consistent 2-scene draft', async function () {
    if (!ready) this.skip()
    const characters = [{ name: 'Elara Voss' }, { name: 'Kaelen Dain' }]
    const locations = [{ name: 'The Archive' }]
    const sceneProse = [
      {
        characters: ['Elara Voss', 'Kaelen Dain'],
        location: 'The Archive',
        prose: 'Elara Voss met Kaelen Dain in the Archive to study the prophecy.'
      },
      {
        characters: ['Elara Voss', 'Kaelen Dain'],
        location: 'The Archive',
        prose: 'Elara Voss and Kaelen Dain continued their study of the prophecy in the Archive.'
      }
    ]
    const report = await critic.checkContradictions({
      characters,
      locations,
      sceneProse,
      synopsis: 'A scholar studies a prophecy.',
      ledger: ['Ch1: Elara met Kaelen in the Archive']
    })
    expect(report.characterIssues || []).toHaveLength(0)
    expect(report.locationIssues || []).toHaveLength(0)
  })
})
