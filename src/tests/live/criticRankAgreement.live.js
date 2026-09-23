/**
 * Live experiment: does the 3B CPU critic rank scenes like the 8B GPU critic?
 *
 *   ARM=gpu8b npx vitest run --config vitest.live.config.js src/tests/live/criticRankAgreement.live.js
 *   ARM=cpu3b npx vitest run --config vitest.live.config.js src/tests/live/criticRankAgreement.live.js
 *   python tools/critic-rank-agreement.py
 *
 * GENERATION-PIPELINE-ANALYSIS §9 makes this the gate in front of A/B run C:
 * "run the small critic over the 30 existing salt-road scenes and compare its
 * ranking with the recorded 8B verdicts; if they do not agree at all, the CPU
 * critic goes back to the drawing board". The 8B verdicts were never persisted
 * — `health.json` keeps only `failedScenes` and `consistency` — so both arms
 * are scored here, through the same `evaluateScene` path, on identical inputs.
 *
 * The corpus (`reports/live/critic-rank-agreement/corpus.json`) is the 30
 * committed scenes of `the-salt-road-run5-qwen`, each with its plan brief and a
 * story bible built from the spine's key facts up to that scene's chapter — so
 * the critic never sees facts from chapters the scene has not reached.
 *
 * One arm per invocation: there is one GPU, and switching models mid-run is the
 * eviction cost this whole placement design exists to avoid.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const ARM = process.env.ARM || 'gpu8b'

/** The two critics under comparison. Same prompt path, same corpus, same order. */
const ARMS = {
  gpu8b: { model: 'qwen3:8b', device: 'gpu', numCtx: 8192, keepAlive: '30m' },
  cpu3b: { model: 'qwen2.5:3b-instruct', device: 'cpu', numCtx: 8192, keepAlive: '30m' }
}

const ROOT = join(process.cwd(), 'reports', 'live', 'critic-rank-agreement')
// TAG separates passes of the same arm, e.g. TAG=-rubric for the run after the
// scoring anchors and the full-draft fix landed, so before/after sit side by side.
const OUT = join(ROOT, `${ARM}${process.env.TAG || ''}`)
mkdirSync(OUT, { recursive: true })

describe(`live: critic rank agreement [${ARM}]`, () => {
  it('scores all 30 salt-road scenes with one critic', async () => {
    const placement = ARMS[ARM]
    if (!placement) throw new Error(`unknown ARM=${ARM}; expected one of ${Object.keys(ARMS)}`)

    const corpusPath = join(ROOT, 'corpus.json')
    if (!existsSync(corpusPath)) throw new Error(`missing corpus: ${corpusPath}`)
    let corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'))
    // LIMIT=2 is the smoke run: prove the path before spending an hour on it.
    if (process.env.LIMIT) corpus = corpus.slice(0, Number(process.env.LIMIT))

    setActivePinia(createPinia())
    localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
    localStorage.setItem(STORAGE_KEYS.OLLAMA_UTILITY_MODEL, placement.model)
    localStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: placement.model })
    )

    // The critic resolves its model and device from the role placement, which is
    // exactly the knob the multi-agent preset turns. Setting it here means the
    // arm runs through the production path, not a bypass.
    const { setRolePlacement, resolveRolePlacement } = await import('@/config/roles')
    setRolePlacement('critic', placement)
    const runtime = resolveRolePlacement('critic')
    console.log(`[arm ${ARM}] critic placement:`, JSON.stringify(runtime))

    const { db } = await import('@/services/db-core')
    await db.delete()
    await db.open()
    const { createProject } = await import('@/services/db-projects')
    const { useProjectStore } = await import('@/stores/projectStore')
    const projectId = await createProject(
      'Critic Rank Agreement',
      'Literary historical fiction',
      'rank-agreement',
      1
    )
    await useProjectStore().loadProject(projectId)

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    // What the model actually received.
    //
    // AgentOps records that a call happened, with which model and how long it
    // took, but PRIVACY.md has it strip prompts from every read path -- so the
    // gateway cannot, by design, tell you that the critic was handed 74% of a
    // scene. That defect (`draft.slice(0, 4000)` against 4,380-6,313 char
    // scenes) survived three live runs unnoticed and took hand-counting to
    // find. Wrapping fetch here keeps the capture local to the experiment:
    // nothing is sent anywhere, and the gateway's policy stays true.
    const promptDir = join(OUT, 'prompts')
    mkdirSync(promptDir, { recursive: true })
    const realFetch = globalThis.fetch.bind(globalThis)
    let calls = []
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || ''
      if (init?.body && /\/api\/(generate|chat|embed)/.test(url)) {
        try {
          const body = JSON.parse(init.body)
          calls.push({
            url,
            model: body.model,
            options: body.options,
            format: body.format ? 'grammar-constrained' : null,
            systemChars: (body.system || '').length,
            promptChars: (body.prompt || JSON.stringify(body.messages || '')).length,
            prompt: body.prompt || body.messages || null,
            system: body.system || null
          })
        } catch {
          /* a body we cannot parse is not worth failing the run over */
        }
      }
      return realFetch(input, init)
    }

    const results = []
    const startedAt = Date.now()
    for (const scene of corpus) {
      calls = []
      const t0 = Date.now()
      let verdict
      let error = null
      try {
        verdict = await critic.evaluateScene({
          draft: scene.draft,
          sceneBrief: scene.sceneBrief,
          storyBible: scene.storyBible,
          chapterLog: '',
          existingEntitiesJson: null,
          focusInstructions: null
        })
      } catch (e) {
        error = String(e && e.message ? e.message : e)
        verdict = null
      }
      const ms = Date.now() - t0
      const captured = calls.slice()
      writeFileSync(
        join(promptDir, `${String(scene.index).padStart(2, '0')}.json`),
        JSON.stringify(captured, null, 2)
      )
      // The number that would have caught the truncation bug on day one.
      const draftChars = scene.draft.length
      const sawWholeDraft = captured.some((c) =>
        typeof c.prompt === 'string' ? c.prompt.includes(scene.draft.slice(-120)) : false
      )
      const row = {
        arm: ARM,
        model: placement.model,
        device: placement.device,
        index: scene.index,
        chapter: scene.chapter,
        title: scene.title,
        words: scene.words,
        draftChars,
        promptChars: captured.length ? Math.max(...captured.map((c) => c.promptChars)) : null,
        sawWholeDraft,
        modelCalls: captured.length,
        ms,
        error,
        score: verdict ? verdict.score : null,
        pass: verdict ? verdict.pass : null,
        evalUnavailable: verdict ? !!verdict.evalUnavailable : null,
        dimensionScores: verdict ? verdict.dimensionScores || {} : {},
        issueCount: verdict && Array.isArray(verdict.issues) ? verdict.issues.length : null,
        issues: verdict && Array.isArray(verdict.issues) ? verdict.issues : [],
        verdictReason: verdict ? verdict.verdictReason || null : null
      }
      results.push(row)
      writeFileSync(
        join(OUT, `${String(scene.index).padStart(2, '0')}.json`),
        JSON.stringify(row, null, 2)
      )
      console.log(
        `[${ARM} ${scene.index}/30] "${scene.title}" score=${row.score} pass=${row.pass} ` +
          `unavailable=${row.evalUnavailable} issues=${row.issueCount} ${(ms / 1000).toFixed(1)}s` +
          (error ? ` ERROR=${error}` : '')
      )
    }

    const scored = results.filter((r) => typeof r.score === 'number')
    const summary = {
      arm: ARM,
      model: placement.model,
      device: placement.device,
      numCtx: placement.numCtx,
      host: HOST,
      startedAt: new Date(startedAt).toISOString(),
      totalMinutes: +((Date.now() - startedAt) / 60000).toFixed(1),
      scenes: results.length,
      scoredScenes: scored.length,
      unavailable: results.filter((r) => r.evalUnavailable).length,
      errors: results.filter((r) => r.error).length,
      passCount: results.filter((r) => r.pass === true).length,
      sawWholeDraft: results.filter((r) => r.sawWholeDraft).length,
      meanPromptChars: Math.round(
        results.reduce((a, r) => a + (r.promptChars || 0), 0) / (results.length || 1)
      ),
      meanScore: scored.length
        ? +(scored.reduce((a, r) => a + r.score, 0) / scored.length).toFixed(3)
        : null,
      medianSeconds: +(
        results.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(results.length / 2)] / 1000
      ).toFixed(1),
      results
    }
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(
      `[arm ${ARM}] done in ${summary.totalMinutes} min — scored ${summary.scoredScenes}/30, ` +
        `pass ${summary.passCount}/30, mean ${summary.meanScore}, unavailable ${summary.unavailable}, errors ${summary.errors}`
    )

    expect(results.length).toBe(corpus.length)
  })
})
