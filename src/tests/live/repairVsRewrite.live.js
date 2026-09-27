/**
 * Live experiment (§35, plan step 6): repair in place vs a full rewrite.
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/repairVsRewrite.live.js
 *
 * Scenes that fail the gate on continuity: the 30 corpus scenes with the
 * planted contradiction (gateSensitivity's `contradiction`), plus the four
 * corpus scenes whose own text fails (real contradictions, §34). Each failing
 * draft is fixed twice through production code, from the same verdict:
 *
 *   repair   planRepair + critic.repairSentence + applyRepair (sceneGate's
 *            repairInPlace), then re-judged
 *   rewrite  writer.writeSceneStructured with the gate's feedback
 *            (formatEvalFeedback, as the retry loop sends it), then re-judged
 *
 * Writes reports/live/repair-vs-rewrite.json with all three texts, verdicts
 * and wall times, for a blind pairwise read afterwards.
 */
import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = 'http://localhost:11434'
const MODEL = 'qwen3:8b'
const OUT = join(process.cwd(), 'reports/live/repair-vs-rewrite.json')

function plant(prose, bible) {
  const name = (bible.match(/\b(Nesrin|Halim|Ahmed|Yusuf|Kemal|Idris)\b/) || [])[1] || 'Halim'
  const paras = prose.split(/\n\s*\n/)
  paras.splice(
    Math.max(1, Math.floor(paras.length / 2)),
    0,
    `${name} had been dead for two years by then, buried past the salt flats, ` +
      `and everyone on the road knew it. No debt had ever passed between them.`
  )
  return paras.join('\n\n')
}

it('repair in place vs rewrite, on scenes that fail continuity', async () => {
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
    await createProject('Repair vs Rewrite', 'Adventure', 'rvr', 1)
  )
  const { setRolePlacement } = await import('@/config/roles')
  setRolePlacement('critic', { model: MODEL, device: 'gpu', numCtx: 8192, keepAlive: '30m' })
  const { useStoryCritic } = await import('@/composables/useStoryCritic')
  const { useStoryWriter } = await import('@/composables/useStoryWriter')
  const { planRepair, applyRepair } = await import('@/composables/criticIsolation')
  const { formatEvalFeedback } = await import('@/services/evalFeedback')
  const { CRITIC_VERDICT_CONFIG } = await import('@/services/criticVerdict')
  const critic = useStoryCritic()
  const writer = useStoryWriter()

  const corpus = JSON.parse(
    readFileSync(join(process.cwd(), 'reports/live/critic-rank-agreement/corpus.json'), 'utf-8')
  )
  const cases = [
    ...corpus.map((c) => ({ id: `planted-${c.index}`, c, draft: plant(c.draft, c.storyBible) })),
    ...[6, 9, 14, 21].map((i) => {
      const c = corpus.find((x) => x.index === i)
      return { id: `real-${i}`, c, draft: c.draft }
    })
  ]
  const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : []
  const seen = new Set(done.map((r) => r.id))
  const judge = (c, draft) =>
    critic.evaluateScene({
      draft,
      sceneBrief: c.sceneBrief,
      storyBible: c.storyBible,
      chapterLog: ''
    })
  const brief = (v) => ({
    pass: v?.pass ?? null,
    continuity: v?.dimensionScores?.continuity ?? null,
    voice: v?.dimensionScores?.voice ?? null,
    reason: v?.verdictReason ?? null,
    evidence: (v?.issues || []).flatMap((i) => (i.type === 'continuity' ? i.evidence || [] : []))
  })

  for (const k of cases) {
    if (seen.has(k.id)) continue
    const row = { id: k.id, original: k.draft }
    const v0 = await judge(k.c, k.draft)
    row.before = brief(v0)
    if (v0?.pass !== false) {
      row.skipped = 'passes as is'
      done.push(row)
      writeFileSync(OUT, JSON.stringify(done, null, 1))
      continue
    }
    // Repair in place, exactly as sceneGate.repairInPlace does it.
    let t = Date.now()
    const plan = planRepair(v0, CRITIC_VERDICT_CONFIG.minDimensionScore)
    let repaired = null
    if (plan) {
      const replacements = []
      for (const r of plan.rewrites) {
        const replacement = await critic.repairSentence(r.sentence, r.fact)
        if (replacement == null) break
        replacements.push({ sentence: r.sentence, replacement })
      }
      if (replacements.length === plan.rewrites.length) {
        const text = applyRepair(k.draft, plan.cut, replacements)
        if (text && text !== k.draft) repaired = text
      }
    }
    row.repair = { text: repaired, fixMs: Date.now() - t }
    if (repaired) {
      t = Date.now()
      row.repair.after = brief(await judge(k.c, repaired))
      row.repair.judgeMs = Date.now() - t
    }
    // A full rewrite with the gate's feedback, as the retry loop sends it.
    t = Date.now()
    const feedback = formatEvalFeedback([
      {
        sceneIndex: 1,
        passed: false,
        score: v0.score,
        dimensionScores: v0.dimensionScores || null,
        topIssues: (v0.issues || [])
          .slice(0, 3)
          .map((i) => i.text || i.description || '')
          .filter(Boolean)
      }
    ])
    const written = await writer
      .writeSceneStructured({
        sceneBrief: k.c.sceneBrief,
        storyArc: {
          genre: 'Adventure',
          tone: 'Tense',
          premise: 'A salt carrier on a poisoned trade road.'
        },
        chapterLog: '',
        storyBible: k.c.storyBible,
        pastEvalResults: feedback
      })
      .catch((e) => ({ prose: null, error: String(e?.message || e) }))
    row.rewrite = {
      text: written?.prose || null,
      fixMs: Date.now() - t,
      error: written?.error || null
    }
    if (row.rewrite.text) {
      t = Date.now()
      row.rewrite.after = brief(await judge(k.c, row.rewrite.text))
      row.rewrite.judgeMs = Date.now() - t
    }
    done.push(row)
    writeFileSync(OUT, JSON.stringify(done, null, 1))
    console.log(
      `[rvr] ${k.id} repair=${row.repair.after?.pass ?? 'n/a'} rewrite=${row.rewrite.after?.pass ?? 'n/a'}`
    )
  }
  expect(done.length).toBe(cases.length)
}, 36_000_000)
