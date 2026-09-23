/**
 * Live experiment: does a wider continuity budget produce prose that stays in
 * its own story?
 *
 *   ARM=narrow npx vitest run --config vitest.live.config.js src/tests/live/continuityProbe.live.js
 *   ARM=wide   npx vitest run --config vitest.live.config.js src/tests/live/continuityProbe.live.js
 *   python tools/continuity-probe.py
 *
 * Why not an A/B of two whole books: the Ollama path sends no `seed`, so runs
 * are not reproducible and a single book per arm measures sampling noise as
 * much as the change. This is paired instead — the SAME scene brief, the same
 * story bible, the same chapter log, the same prior scenes, and the only thing
 * that differs is `embeddingContext`, built at 350 tokens (the old cap) or at
 * the new budget. Every difference in the output is attributable to that.
 *
 * The measure has to match what changed. The five-dimension critic cannot
 * answer this: it returns 8/10 for all thirty committed scenes
 * (GENERATION-PIPELINE-ANALYSIS §10), so it is constant by construction. What a
 * wider continuity budget should buy is prose that stays anchored to people and
 * places the story already established, instead of inventing new ones because
 * it cannot see them. That is countable without a judge:
 *
 *   grounded   — capitalised names in the draft that appear in the prior scenes
 *   invented   — capitalised names that do not
 *   grounding  — grounded / (grounded + invented)
 *
 * Crude as a name detector, but applied identically to both arms, so the bias
 * cancels and the comparison stands.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const ARM = process.env.ARM || 'wide'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'

/** The old cap, and the new budget at the default 16,384-token window. */
const ARMS = { narrow: 350, wide: 3793 }

/**
 * Scenes deep enough into the book to have a real history behind them. Scene 5
 * has four prior scenes; scene 29 has twenty-eight. If the budget matters, the
 * gap between arms should widen with the index.
 */
const TEST_SCENES = [8, 14, 20, 26, 29]

const ROOT = join(process.cwd(), 'reports', 'live', 'continuity-probe')
const OUT = join(ROOT, ARM)
mkdirSync(OUT, { recursive: true })

const STOPWORDS = new Set([
  'The',
  'A',
  'An',
  'And',
  'But',
  'But',
  'He',
  'She',
  'It',
  'They',
  'We',
  'You',
  'I',
  'His',
  'Her',
  'Their',
  'Our',
  'Then',
  'When',
  'What',
  'Where',
  'Why',
  'How',
  'That',
  'This',
  'There',
  'These',
  'Those',
  'If',
  'As',
  'At',
  'In',
  'On',
  'Of',
  'To',
  'For',
  'From',
  'With',
  'By',
  'Not',
  'No',
  'Yes',
  'So',
  'Her',
  'Him',
  'Them',
  'Its',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Still',
  'Only',
  'Even',
  'Now',
  'Later',
  'After',
  'Before',
  'Behind',
  'Above',
  'Below',
  'Down',
  'Up',
  'Out',
  'Into',
  'Over',
  'Under',
  'Again',
  'Once',
  'Never',
  'Always',
  'Nothing',
  'Something',
  'Someone',
  'Everything',
  'Everyone',
  'Perhaps',
  'Maybe',
  'Yet',
  'Because',
  'Though',
  'While'
])

/** Distinct capitalised words that are plausibly names, not sentence openers. */
function properNouns(text) {
  const names = new Set()
  for (const m of String(text || '').matchAll(/(^|[^.!?"'\n]\s+)([A-Z][a-zçğıöşü]{2,})/gu)) {
    const w = m[2]
    if (!STOPWORDS.has(w)) names.add(w)
  }
  return names
}

describe(`live: continuity probe [${ARM}]`, () => {
  it('writes each test scene at one continuity budget', async () => {
    const budget = ARMS[ARM]
    if (!budget) throw new Error(`unknown ARM=${ARM}; expected one of ${Object.keys(ARMS)}`)

    const corpusPath = join(
      process.cwd(),
      'reports',
      'live',
      'critic-rank-agreement',
      'corpus.json'
    )
    if (!existsSync(corpusPath)) throw new Error(`missing corpus: ${corpusPath}`)
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf-8'))

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
      'Continuity Probe',
      'Literary historical fiction',
      'continuity-probe',
      1
    )
    await useProjectStore().loadProject(projectId)

    const { buildRetrievalContext } = await import('@/composables/generation/context/sceneContext')
    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const writer = useStoryWriter()

    const results = []
    const startedAt = Date.now()

    for (const index of TEST_SCENES) {
      const target = corpus.find((c) => c.index === index)
      if (!target) continue
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

      // Everything the story has already established, by name.
      const establishedText = prior.map((p) => p.prose).join('\n')
      const established = properNouns(establishedText)

      const embeddingContext = await buildRetrievalContext(
        target.sceneBrief,
        prior,
        5,
        undefined,
        budget
      )

      // The chapter log the real pipeline would hand this scene: one line per
      // prior scene. Identical in both arms.
      const chapterLog = prior
        .map((p) => `Scene ${p.sceneNumber} ("${p.title}"): ${p.summary}`)
        .slice(-20)
        .join('\n')

      const t0 = Date.now()
      let prose = ''
      let error = null
      try {
        const result = await writer.writeSceneStructured({
          sceneBrief: target.sceneBrief,
          storyArc: null,
          chapterLog,
          storyBible: target.storyBible,
          embeddingContext,
          storyContract: '',
          existingEntitiesJson: null
        })
        prose = result?.prose || ''
      } catch (e) {
        error = String(e && e.message ? e.message : e)
      }
      const ms = Date.now() - t0

      const found = properNouns(prose)
      const grounded = [...found].filter((n) => established.has(n))
      const invented = [...found].filter((n) => !established.has(n))
      const row = {
        arm: ARM,
        budgetTokens: budget,
        index,
        title: target.title,
        priorScenes: prior.length,
        contextChars: embeddingContext.length,
        contextTokensApprox: Math.round(embeddingContext.length / 4),
        earlierScenesCited: (embeddingContext.match(/^- Scene /gm) || []).length,
        words: prose.trim() ? prose.trim().split(/\s+/).length : 0,
        grounded: grounded.length,
        invented: invented.length,
        grounding: found.size ? +(grounded.length / found.size).toFixed(3) : null,
        groundedNames: grounded.sort(),
        inventedNames: invented.sort(),
        ms,
        error
      }
      results.push(row)
      writeFileSync(
        join(OUT, `${String(index).padStart(2, '0')}.json`),
        JSON.stringify(row, null, 2)
      )
      writeFileSync(join(OUT, `${String(index).padStart(2, '0')}.prose.txt`), prose)
      console.log(
        `[${ARM} scene ${index}] ctx=${row.contextTokensApprox}tok cited=${row.earlierScenesCited} ` +
          `words=${row.words} grounded=${row.grounded} invented=${row.invented} ` +
          `grounding=${row.grounding} ${(ms / 1000).toFixed(1)}s${error ? ` ERROR=${error}` : ''}`
      )
    }

    const ok = results.filter((r) => !r.error && r.grounding !== null)
    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          arm: ARM,
          budgetTokens: budget,
          model: MODEL,
          startedAt: new Date(startedAt).toISOString(),
          totalMinutes: +((Date.now() - startedAt) / 60000).toFixed(1),
          scenes: results.length,
          errors: results.filter((r) => r.error).length,
          meanContextTokens: Math.round(
            results.reduce((a, r) => a + r.contextTokensApprox, 0) / (results.length || 1)
          ),
          meanEarlierScenesCited: +(
            results.reduce((a, r) => a + r.earlierScenesCited, 0) / (results.length || 1)
          ).toFixed(2),
          meanGrounding: ok.length
            ? +(ok.reduce((a, r) => a + r.grounding, 0) / ok.length).toFixed(3)
            : null,
          totalInvented: results.reduce((a, r) => a + r.invented, 0),
          totalGrounded: results.reduce((a, r) => a + r.grounded, 0),
          results
        },
        null,
        2
      )
    )
    expect(results.length).toBe(TEST_SCENES.length)
  })
})
