/**
 * Live run: the production quality gate over the human-labelling pool (§28).
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/gateOnPool.live.js
 *   python tools/labelling/compare.py
 *
 * Reads reports/live/labelling/scenes.json (tools/labelling/build_pool.py) and
 * writes the critic's verdict for every scene to gate-verdicts.json beside it,
 * with the default (focused) critic unless FOCUSED=0. Run it after the pool is
 * frozen; the labelling page never shows these verdicts, so labels stay blind.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
const DIR = join(process.cwd(), 'reports', 'live', 'labelling')

describe('live: gate verdicts on the labelling pool', () => {
  it('judges every pool scene with the production critic', async () => {
    const poolPath = join(DIR, 'scenes.json')
    if (!existsSync(poolPath)) throw new Error(`missing pool: ${poolPath}`)
    const { scenes } = JSON.parse(readFileSync(poolPath, 'utf-8'))

    setActivePinia(createPinia())
    localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, MODEL)
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: MODEL })
    )
    const { db } = await import('@/services/db-core')
    await db.delete()
    await db.open()
    const { createProject } = await import('@/services/db-projects')
    const { useProjectStore } = await import('@/stores/projectStore')
    await useProjectStore().loadProject(
      await createProject('Labelling Pool', 'Mixed', 'label-pool', 1)
    )
    const { setRolePlacement } = await import('@/config/roles')
    setRolePlacement('critic', { model: MODEL, device: 'gpu', numCtx: 8192, keepAlive: '30m' })
    const { useStoryCritic, setFocusedCritic, isFocusedCriticEnabled } =
      await import('@/composables/useStoryCritic')
    if (process.env.FOCUSED) setFocusedCritic(process.env.FOCUSED === '1')
    const critic = useStoryCritic()

    const out = []
    const t0 = Date.now()
    for (const s of scenes) {
      const brief = {
        title: s.brief.title,
        emotionalGoal: s.brief.emotionalGoal,
        whatChanges: s.brief.whatChanges,
        charactersPresent: s.brief.characters,
        location: s.brief.location,
        payoff: '',
        tension: ''
      }
      let verdict = null
      let error = null
      try {
        verdict = await critic.evaluateScene({
          draft: s.prose,
          sceneBrief: brief,
          storyBible: s.facts.join('\n'),
          chapterLog: ''
        })
      } catch (e) {
        error = String(e?.message || e)
      }
      out.push({
        sceneId: s.id,
        pass: verdict?.pass ?? null,
        dimensionScores: verdict?.dimensionScores || {},
        verdictReason: verdict?.verdictReason || null,
        issues: verdict?.issues || [],
        error
      })
      console.log(`[pool ${s.order}/${scenes.length}] ${s.id} pass=${verdict?.pass}`)
    }
    writeFileSync(
      join(DIR, 'gate-verdicts.json'),
      JSON.stringify(
        {
          model: MODEL,
          focusedCritic: isFocusedCriticEnabled(),
          minutes: +((Date.now() - t0) / 60000).toFixed(1),
          verdicts: out
        },
        null,
        2
      )
    )
    expect(out.length).toBe(scenes.length)
  })
})
