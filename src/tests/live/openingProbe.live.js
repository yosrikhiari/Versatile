/**
 * Live experiment (issue #66, UX-AUDIT #59): does showing the writer how the
 * nearby scenes open stop it opening on the same images?
 *
 *   ARM=none     npx vitest run --config vitest.live.config.js src/tests/live/openingProbe.live.js
 *   ARM=openings npx vitest run --config vitest.live.config.js src/tests/live/openingProbe.live.js
 *
 * Paired, like continuityProbe: the same scene brief, story bible, chapter
 * log and retrieved context in both arms; the only difference is the
 * OPENINGS ALREADY USED block. No seed on the Ollama path, so each scene is
 * repeated and compared as a distribution.
 *
 * The measure is openingReuse's: does the new opening share an image pair
 * with the opening of any earlier scene? Its baseline (baseline.json): 43 %
 * of generated openings, 12 % of published chapter openings. And because the
 * writer copies what it is shown (§47), the probe also counts copying: the
 * longest run of words the new opening shares with a shown one, and whether
 * the copy guard would remove anything.
 *
 * Scene length is held at 350 words in both arms: only the opening is
 * measured, and it is written first.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'
import {
  openingOf,
  reusedImages,
  buildRecentOpeningsContext,
  RECENT_OPENINGS_MAX
} from '@/services/generation/openingReuse'
import { dropCopiedSentences } from '@/services/generation/copyGuard'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const ARM = process.env.ARM || 'none'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
const REPEATS = Number(process.env.REPEATS || 4)
const WORDS = 350
/** Spread across the book; every one has at least nine scenes before it. */
const TEST_SCENES = [10, 14, 18, 21, 25, 28]
const NAMES = ['Nesrin', 'Halim', 'Seyhan', 'Ahmed', 'Mehmet', 'Zeynep', 'Tuz']

const OUT = join(process.cwd(), 'reports', 'live', 'opening-probe', ARM)
mkdirSync(OUT, { recursive: true })

function words(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}']+/u)
    .filter(Boolean)
}

/** Longest run of words two texts share. */
function longestSharedRun(a, b) {
  const x = words(a)
  const y = words(b)
  let best = 0
  const prev = new Array(y.length + 1).fill(0)
  for (let i = 1; i <= x.length; i++) {
    let diag = 0
    for (let j = 1; j <= y.length; j++) {
      const keep = prev[j]
      prev[j] = x[i - 1] === y[j - 1] ? diag + 1 : 0
      if (prev[j] > best) best = prev[j]
      diag = keep
    }
  }
  return best
}

describe(`live: opening probe [${ARM}]`, () => {
  it('writes each test scene with or without the openings block', async () => {
    if (!['none', 'openings'].includes(ARM)) throw new Error(`unknown ARM=${ARM}`)
    const corpus = JSON.parse(
      readFileSync(
        join(process.cwd(), 'reports', 'live', 'critic-rank-agreement', 'corpus.json'),
        'utf-8'
      )
    )

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
    const projectId = await createProject('Opening Probe', 'Literary', 'opening-probe', 1)
    await useProjectStore().loadProject(projectId)

    const { buildRetrievalContext } = await import('@/composables/generation/context/sceneContext')
    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const writer = useStoryWriter()

    const results = []
    const startedAt = Date.now()
    for (const index of TEST_SCENES) {
      const target = corpus.find((c) => c.index === index)
      const prior = corpus
        .filter((c) => c.index < index)
        .sort((a, b) => a.index - b.index)
        .map((c) => ({
          sceneNumber: c.index,
          title: c.title,
          prose: c.draft,
          summary: c.sceneBrief.whatChanges || c.sceneBrief.goal || c.title,
          characters: c.sceneBrief.charactersPresent || [],
          location: c.sceneBrief.location || ''
        }))
      const priorOpenings = prior.map((p) => openingOf(p.prose))
      // Positionally: the target sits at index `prior.length`, after them.
      const shownBlock = buildRecentOpeningsContext(prior, prior.length)
      const shown = prior.slice(-RECENT_OPENINGS_MAX).map((p) => openingOf(p.prose))
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
            sceneBrief: { ...target.sceneBrief, estimatedWords: WORDS },
            storyArc: null,
            chapterLog,
            storyBible: target.storyBible,
            embeddingContext,
            recentOpenings: ARM === 'openings' ? shownBlock : undefined,
            storyContract: '',
            existingEntitiesJson: null
          })
          prose = result?.prose || ''
        } catch (e) {
          error = String(e?.message || e)
        }
        const opening = openingOf(prose)
        const reuseAny = reusedImages(opening, priorOpenings, NAMES)
        const reuseShown = reusedImages(opening, shown, NAMES)
        const guard = dropCopiedSentences(prose, `${embeddingContext}\n\n${shownBlock}`)
        const row = {
          arm: ARM,
          index,
          repeat: rep,
          opening,
          anchor: target.sceneBrief.sensoryAnchor || '',
          reusesAny: reuseAny.length > 0,
          reusedScenes: reuseAny.map((r) => prior[r.earlier].sceneNumber),
          reusedPairs: [...new Set(reuseAny.flatMap((r) => r.shared))],
          reusesShown: reuseShown.length > 0,
          longestRunWithShown: Math.max(0, ...shown.map((s) => longestSharedRun(opening, s))),
          guardWouldDrop: guard.dropped,
          words: prose.trim() ? prose.trim().split(/\s+/).length : 0,
          ms: Date.now() - t0,
          error
        }
        results.push(row)
        const stem = `${String(index).padStart(2, '0')}-r${rep}`
        writeFileSync(join(OUT, `${stem}.json`), JSON.stringify(row, null, 2))
        writeFileSync(join(OUT, `${stem}.prose.txt`), prose)
      }
    }
    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          arm: ARM,
          model: MODEL,
          repeats: REPEATS,
          minutes: +((Date.now() - startedAt) / 60000).toFixed(1),
          errors: results.filter((r) => r.error).length,
          reusing: results.filter((r) => r.reusesAny).length,
          total: results.length,
          results
        },
        null,
        2
      )
    )
    expect(results.length).toBe(TEST_SCENES.length * REPEATS)
  })
})
