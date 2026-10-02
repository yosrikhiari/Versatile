/**
 * Live experiment (#107): do the planner's repeated sensory anchors make the
 * writer reuse opening images?
 *
 *   ARM=planned npx vitest run --config vitest.live.config.js src/tests/live/anchorProbe.live.js
 *   ARM=dropped npx vitest run --config vitest.live.config.js src/tests/live/anchorProbe.live.js
 *   python tools/anchor-probe.py
 *
 * §49 found the planner repeats its own anchors (14 of 29 in the salt-road
 * plan; "the scent of damp earth" six times) and the writer opens on its
 * anchor in 16 of 30 scenes, but only 5 of the 15 reusing openings take the
 * image from their own anchor. Before changing the planner, this asks whether
 * the anchor is a cause at all: the scenes whose anchor repeats an earlier one,
 * written with the planned anchor and with it removed, everything else equal
 * (brief, bible, chapter log, retrieved context). Paired, no seed, repeats.
 *
 * Measures (openingReuse): the opening reuses an earlier opening's image
 * (primary), and the opening carries the image the anchor shares with earlier
 * anchors. Scene length is held at 350 words in both arms: only the opening is
 * measured, and it is written first.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'
import { openingOf, imagePairs, reusedImages } from '@/services/generation/openingReuse'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const ARM = process.env.ARM || 'planned'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
const REPEATS = Number(process.env.REPEATS || 4)
const SCENES = Number(process.env.SCENES || 6)
const WORDS = 350
const NAMES = ['Nesrin', 'Halim', 'Seyhan', 'Ahmed', 'Mehmet', 'Zeynep', 'Tuz']

const OUT = join(process.cwd(), 'reports', 'live', 'anchor-probe', ARM)
mkdirSync(OUT, { recursive: true })

/** Scenes whose anchor shares an image pair with an earlier scene's anchor. */
export function repeatedAnchorScenes(corpus) {
  const sorted = [...corpus].sort((a, b) => a.index - b.index)
  const out = []
  sorted.forEach((c, i) => {
    const mine = imagePairs(c.sceneBrief.sensoryAnchor || '', NAMES)
    const earlier = new Set(
      sorted.slice(0, i).flatMap((p) => [...imagePairs(p.sceneBrief.sensoryAnchor || '', NAMES)])
    )
    const shared = [...mine].filter((p) => earlier.has(p))
    if (shared.length) out.push({ index: c.index, shared })
  })
  return out
}

/** `n` items spread evenly across a list, first and last included. */
function spread(list, n) {
  if (list.length <= n) return list
  return Array.from({ length: n }, (_, k) => list[Math.round((k * (list.length - 1)) / (n - 1))])
}

describe(`live: anchor probe [${ARM}]`, () => {
  it('writes each repeated-anchor scene with or without its anchor', async () => {
    if (!['planned', 'dropped'].includes(ARM)) throw new Error(`unknown ARM=${ARM}`)
    const corpus = JSON.parse(
      readFileSync(
        join(process.cwd(), 'reports', 'live', 'critic-rank-agreement', 'corpus.json'),
        'utf-8'
      )
    )
    // Deep enough to have earlier openings to reuse.
    const targets = spread(
      repeatedAnchorScenes(corpus).filter((t) => t.index >= 5),
      SCENES
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
    const projectId = await createProject('Anchor Probe', 'Literary', 'anchor-probe', 1)
    await useProjectStore().loadProject(projectId)

    const { buildRetrievalContext } = await import('@/composables/generation/context/sceneContext')
    const { useStoryWriter } = await import('@/composables/useStoryWriter')
    const writer = useStoryWriter()

    const results = []
    const startedAt = Date.now()
    for (const { index, shared } of targets) {
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
      const anchor = target.sceneBrief.sensoryAnchor || ''
      const anchorPairs = imagePairs(anchor, NAMES)
      const embeddingContext = await buildRetrievalContext(target.sceneBrief, prior, 5)
      const chapterLog = prior
        .map((p) => `Scene ${p.sceneNumber} ("${p.title}"): ${p.summary}`)
        .slice(-20)
        .join('\n')
      const sceneBrief = {
        ...target.sceneBrief,
        estimatedWords: WORDS,
        sensoryAnchor: ARM === 'dropped' ? '' : anchor
      }

      for (let rep = 1; rep <= REPEATS; rep++) {
        const t0 = Date.now()
        let prose = ''
        let error = null
        try {
          const result = await writer.writeSceneStructured({
            sceneBrief,
            storyArc: null,
            chapterLog,
            storyBible: target.storyBible,
            embeddingContext,
            storyContract: '',
            existingEntitiesJson: null
          })
          prose = result?.prose || ''
        } catch (e) {
          error = String(e?.message || e)
        }
        const opening = openingOf(prose)
        const openingPairs = imagePairs(opening, NAMES)
        const reuse = reusedImages(opening, priorOpenings, NAMES)
        const row = {
          arm: ARM,
          index,
          repeat: rep,
          anchor,
          repeatedPairs: shared,
          opening,
          reusesAny: reuse.length > 0,
          reusedPairs: [...new Set(reuse.flatMap((r) => r.shared))],
          // Measured against the planned anchor in both arms, so the arms compare.
          usesAnchor: [...openingPairs].some((p) => anchorPairs.has(p)),
          usesRepeatedPair: shared.some((p) => openingPairs.has(p)),
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
          targets,
          minutes: +((Date.now() - startedAt) / 60000).toFixed(1),
          errors: results.filter((r) => r.error).length,
          reusing: results.filter((r) => r.reusesAny).length,
          usingAnchor: results.filter((r) => r.usesAnchor).length,
          usingRepeatedPair: results.filter((r) => r.usesRepeatedPair).length,
          total: results.length,
          results
        },
        null,
        2
      )
    )
    expect(results.length).toBe(targets.length * REPEATS)
  })
})
