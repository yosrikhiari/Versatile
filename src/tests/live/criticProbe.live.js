/**
 * Live probe: what does the app's critic path actually return for a real scene?
 *
 *   PROBE_REPEATS=3 npx vitest run --config vitest.live.config.js src/tests/live/criticProbe.live.js
 *
 * Reads chapter 1 scene 1 of `reports/live/the-salt-road-run5-qwen/` and runs
 * `useStoryCritic().evaluateScene` on it N times with the utility model, writing
 * each result to `reports/live/critic-probe/<n>.json`.
 *
 * This is how the fabricated-7 was found: under the optional-field schema
 * qwen3:8b answered `{ "pass": true, "strengths": [...] }` on every call and
 * the parse defaulted the score. With every field required it returns a full
 * evaluation (score 8, show_tell 7, one minor issue — stable across repeats).
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const REPEATS = Number(process.env.PROBE_REPEATS || 3)
const OUT = join(process.cwd(), 'reports', 'live', 'critic-probe')
mkdirSync(OUT, { recursive: true })

describe('live: critic probe', () => {
  it('evaluates a real scene through the app critic', async () => {
    setActivePinia(createPinia())
    localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, 'qwen3:8b')
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: 'qwen3:8b' })
    )
    const { db } = await import('@/services/db-core')
    await db.delete()
    await db.open()

    const book = readFileSync(
      join(process.cwd(), 'reports', 'live', 'the-salt-road-run5-qwen', 'book.md'),
      'utf-8'
    )
    const plan = JSON.parse(
      readFileSync(
        join(process.cwd(), 'reports', 'live', 'the-salt-road-run5-qwen', 'plan.json'),
        'utf-8'
      )
    )
    const scene1 = book.split('### The Letter')[1].split('### ')[0].trim()
    const brief = plan.chapterPlan[0].scenes[0]

    const { createProject } = await import('@/services/db-projects')
    const { useProjectStore } = await import('@/stores/projectStore')
    const projectId = await createProject('Critic Probe', 'Literary historical fiction', 'probe', 1)
    await useProjectStore().loadProject(projectId)

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()
    const results = []
    for (let i = 0; i < REPEATS; i++) {
      const r = await critic.evaluateScene({
        draft: scene1,
        sceneBrief: { ...brief, charactersPresent: brief.charactersPresent || [] },
        storyBible:
          '## Nesrin — widowed salt-carrier, 34. Owes Halim. Son Ahmed, 11.\n## Halim — caravan master, 50s. Keeps records. Ring of animal teeth.',
        chapterLog: '',
        existingEntitiesJson: null,
        focusInstructions: null
      })
      results.push(r)
      writeFileSync(join(OUT, `${i + 1}.json`), JSON.stringify(r, null, 2))
      console.log(
        `[probe ${i + 1}] score=${r.score} pass=${r.pass} unavailable=${!!r.evalUnavailable} issues=${(r.issues || []).length} dims=${JSON.stringify(r.dimensionScores)} reason=${r.verdictReason}`
      )
    }
    expect(results.length).toBe(REPEATS)
  })
})
