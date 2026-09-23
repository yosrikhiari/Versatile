/**
 * Live experiment: does handing the writer the established-facts ledger produce
 * prose that contradicts the story less?
 *
 *   ARM=nofacts npx vitest run --config vitest.live.config.js src/tests/live/contradictionProbe.live.js
 *   ARM=facts   npx vitest run --config vitest.live.config.js src/tests/live/contradictionProbe.live.js
 *   python tools/contradiction-probe.py
 *
 * This measures the right quantity. The continuity probe counted name
 * callbacks and found nothing, for a reason that was the probe's fault and not
 * the pipeline's: every scene brief carries `charactersPresent`, so the writer
 * is TOLD who is in the scene and rarely needs to recall anyone. A continuity
 * budget was never going to show up as "remembers names". What it should buy is
 * "does not contradict what already happened" — facts and events.
 *
 * So the judge is `checkContradictions`, the same call `ConsistencyService`
 * already runs after a book is written, pointed at one scene at a time against
 * the ledger of facts established before it. It is an LLM judge and therefore
 * noisy, which is why there are repeats; a noisy measure of the right quantity
 * beats a clean measure of the wrong one.
 *
 * Paired: identical scene brief, bible, chapter log, prior scenes and retrieval
 * context. The ONLY difference is whether `storyState` is populated.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const ARM = process.env.ARM || 'facts'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
const REPEATS = Number(process.env.REPEATS || 3)

/** Scenes deep enough to have a history that can be contradicted. */
const TEST_SCENES = [14, 20, 26, 29]

const ROOT = join(process.cwd(), 'reports', 'live', 'contradiction-probe')
const OUT = join(ROOT, ARM)
mkdirSync(OUT, { recursive: true })

describe(`live: contradiction probe [${ARM}]`, () => {
  it('writes each scene with or without the fact ledger and judges it', async () => {
    const withFacts = ARM === 'facts'

    const base = join(process.cwd(), 'reports', 'live')
    const corpusPath = join(base, 'critic-rank-agreement', 'corpus.json')
    const planPath = join(base, 'the-salt-road-run5-qwen', 'plan.json')
    if (!existsSync(corpusPath)) throw new Error(`missing corpus: ${corpusPath}`)
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'))
    const plan = JSON.parse(readFileSync(planPath, 'utf-8'))

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
    const projectId = await createProject(
      'Contradiction Probe',
      'Literary historical fiction',
      'contradiction-probe',
      1
    )
    await useProjectStore().loadProject(projectId)

    const { buildRetrievalContext } = await import('@/composables/generation/context/sceneContext')
    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const writer = useStoryWriter()
    const critic = useStoryCritic()

    // Chapter -> scene indices, so a scene's chapter and the facts established
    // before it can both be derived from the committed plan.
    const chapterOfScene = new Map()
    let n = 1
    for (const c of plan.chapterPlan) {
      for (let k = 0; k < c.scenes.length; k++) chapterOfScene.set(n++, c.chapterNumber)
    }
    const factsBefore = (chapterNumber) =>
      plan.spine
        .filter((e) => e && e.chapterNumber < chapterNumber)
        .flatMap((e) => (e.keyFacts || []).map((f) => `Ch${e.chapterNumber}: ${f}`))

    const results = []
    const startedAt = Date.now()

    for (const index of TEST_SCENES) {
      const target = corpus.find((c) => c.index === index)
      if (!target) continue
      const chapterNumber = chapterOfScene.get(index)
      const ledger = factsBefore(chapterNumber)
      const storyState = withFacts ? ledger.join('\n') : ''

      const prior = corpus
        .filter((c) => c.index < index)
        .map((c) => ({
          sceneNumber: c.index,
          title: c.title,
          prose: c.draft,
          summary: c.sceneBrief.whatChanges || c.sceneBrief.goal || c.title,
          characters: c.sceneBrief.charactersPresent || [],
          location: c.sceneBrief.location || ''
        }))
      const embeddingContext = await buildRetrievalContext(target.sceneBrief, prior, 5)
      const chapterLog = prior
        .map((p) => `Scene ${p.sceneNumber} ("${p.title}"): ${p.summary}`)
        .slice(-20)
        .join('\n')

      for (let rep = 1; rep <= REPEATS; rep++) {
        const t0 = Date.now()
        let prose = ''
        let error = null
        try {
          const result = await writer.writeSceneStructured({
            sceneBrief: target.sceneBrief,
            storyArc: null,
            chapterLog,
            storyBible: target.storyBible,
            storyState,
            embeddingContext,
            storyContract: '',
            existingEntitiesJson: null
          })
          prose = result?.prose || ''
        } catch (e) {
          error = String(e && e.message ? e.message : e)
        }
        const writeMs = Date.now() - t0

        // Judge the draft against the facts it was supposed to respect.
        //
        // `checkContradictions` only examines a character who appears in TWO OR
        // MORE of the scenes it is given (`scenesByChar.get(name).length >= 2`)
        // and matches scenes to characters through `scene.characters`. Handing
        // it the generated scene alone returned 0 for everything, including
        // prose that said a living character had been dead for two years —
        // calibrated and confirmed. So the draft is judged alongside the prior
        // scenes its cast appears in, which is also how ConsistencyService uses
        // it.
        let issues = null
        let judgeError = null
        const j0 = Date.now()
        try {
          const cast = (target.sceneBrief.charactersPresent || []).map((n) => String(n))
          const priorWithCast = prior
            .filter((p) => (p.characters || []).some((c) => cast.includes(String(c))))
            .slice(-4)
            .map((p) => ({
              sceneNumber: p.sceneNumber,
              title: p.title,
              prose: p.prose,
              characters: (p.characters || []).map((c) => String(c)),
              location: p.location
            }))
          const report = await critic.checkContradictions({
            characters: cast.map((name) => ({
              name,
              role: '',
              description: `Established by the story so far. ${ledger.slice(0, 6).join(' ')}`
            })),
            locations: [],
            sceneProse: [
              ...priorWithCast,
              { sceneNumber: index, title: target.title, prose, characters: cast }
            ],
            synopsis: '',
            ledger
          })
          issues =
            (report.characterIssues || []).reduce(
              (a, i) => a + (i.contradictions?.length || 0),
              0
            ) +
            (report.locationIssues || []).reduce((a, i) => a + (i.contradictions?.length || 0), 0)
        } catch (e) {
          judgeError = String(e && e.message ? e.message : e)
        }
        const judgeMs = Date.now() - j0

        const row = {
          arm: ARM,
          index,
          repeat: rep,
          chapterNumber,
          ledgerFacts: ledger.length,
          priorScenesJudged: null,
          storyStateChars: storyState.length,
          words: prose.trim() ? prose.trim().split(/\s+/).length : 0,
          contradictions: issues,
          writeMs,
          judgeMs,
          error,
          judgeError
        }
        results.push(row)
        const stem = `${String(index).padStart(2, '0')}-r${rep}`
        writeFileSync(join(OUT, `${stem}.json`), JSON.stringify(row, null, 2))
        writeFileSync(join(OUT, `${stem}.prose.txt`), prose)
        console.log(
          `[${ARM} ${index} r${rep}] facts=${ledger.length} state=${storyState.length}ch ` +
            `words=${row.words} contradictions=${issues} ` +
            `${(writeMs / 1000).toFixed(0)}s+${(judgeMs / 1000).toFixed(0)}s` +
            `${error ? ` ERROR=${error}` : ''}${judgeError ? ` JUDGE_ERROR=${judgeError}` : ''}`
        )
      }
    }

    const scored = results.filter((r) => typeof r.contradictions === 'number')
    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          arm: ARM,
          withFacts,
          model: MODEL,
          repeats: REPEATS,
          startedAt: new Date(startedAt).toISOString(),
          totalMinutes: +((Date.now() - startedAt) / 60000).toFixed(1),
          rows: results.length,
          errors: results.filter((r) => r.error).length,
          judgeErrors: results.filter((r) => r.judgeError).length,
          meanContradictions: scored.length
            ? +(scored.reduce((a, r) => a + r.contradictions, 0) / scored.length).toFixed(3)
            : null,
          results
        },
        null,
        2
      )
    )
    expect(results.length).toBe(TEST_SCENES.length * REPEATS)
  })
})
