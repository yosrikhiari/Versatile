/**
 * Live experiment: can the quality gate detect a defect that is definitely
 * there?
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/gateSensitivity.live.js
 *   python tools/gate-sensitivity.py
 *
 * Every attempt to make the gate discriminate has failed from the prompt side:
 * the rubric anchors did not move the overall score (§10), and reordering the
 * schema so the score follows the evidence made it worse (§15). Both were
 * attempts to improve the JUDGEMENT. Neither asked the prior question — whether
 * the gate responds to a defect at all.
 *
 * The usual answer is to calibrate against scenes a human has ranked, which
 * needs a human. This does not: it takes committed scenes that already pass,
 * breaks one specific thing in each by string surgery, and asks whether the
 * matching dimension drops. The ground truth is not anyone's taste, it is "I
 * removed every line of dialogue, so `voice` should fall".
 *
 * A dimension that does not move when its own defect is injected cannot gate
 * anything, and no threshold calibration will rescue it.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = process.env.OLLAMA_HOST || 'http://localhost:11434'
const MODEL = process.env.LIVE_MODEL || 'qwen3:8b'
const REPEATS = Number(process.env.REPEATS || 2)
const TEST_SCENES = [8, 14, 20, 26]

const OUT = join(process.cwd(), 'reports', 'live', 'gate-sensitivity')
mkdirSync(OUT, { recursive: true })

/** A line of dialogue: contains a quoted span. */
const DIALOGUE = /[“"][^“”"]{4,}[”"]/

/**
 * The defects, each aimed at one dimension, each a deterministic edit so the
 * variant is not itself a model output with its own quality.
 */
const DEFECTS = {
  control: {
    dimension: null,
    apply: (prose) => prose
  },
  // voice: every character now sounds like the same person.
  voice_flatten: {
    dimension: 'voice',
    apply: (prose) =>
      prose
        .split('\n')
        .map((line) =>
          DIALOGUE.test(line) ? line.replace(DIALOGUE, '"We should keep moving," ') : line
        )
        .join('\n')
  },
  // show_tell: dramatised moments become reported ones.
  told_not_shown: {
    dimension: 'show_tell',
    // Each replacement is worded differently on purpose. Repeating one sentence
    // trips `detectRepetition`, which short-circuits `evaluateScene` to score 1
    // with NO dimension scores — so the first version of this injection never
    // reached the judge and its score of 1 looked like a detection.
    apply: (prose) => {
      const summaries = [
        'She dealt with the matter at hand, and her feelings about it were the ones the situation called for.',
        'The exchange went the way such exchanges go, and by its end the position of each party was understood.',
        'What needed saying was said, more or less, and the consequences settled where consequences settle.',
        'The business of the hour was transacted without incident worth recording here.',
        'Whatever had been unresolved between them moved one notch toward resolution.',
        'The moment passed, having accomplished roughly what it needed to accomplish.'
      ]
      let k = 0
      const paras = prose.split(/\n\s*\n/)
      return paras
        .map((p, i) => (i % 2 === 0 && p.length > 200 ? summaries[k++ % summaries.length] : p))
        .join('\n\n')
    }
  },
  // pacing: filler that advances nothing, inserted three times.
  padding: {
    dimension: 'pacing',
    // Three distinct fillers, for the same reason as above: identical inserts
    // trip the repetition guard and never reach the judge.
    apply: (prose) => {
      const fillers = [
        'The light was the light of late afternoon, lying across everything in the ordinary way light does at that hour, neither bright nor dim. The air held the temperature it had held for some time. Nothing about the hour was remarkable.',
        'Somewhere behind them a bird made the noise birds make. The ground underfoot was the same ground it had been for an hour, and would be for another. A cart passed on the far road and had nothing to do with any of this.',
        'Dust moved when the wind moved and settled when it stopped. The shadows had lengthened by the amount shadows lengthen. No one said anything, and nothing required saying.'
      ]
      const paras = prose.split(/\n\s*\n/)
      const out = []
      let k = 0
      paras.forEach((p, i) => {
        out.push(p)
        if (i === 0 || i === Math.floor(paras.length / 2) || i === paras.length - 2) {
          out.push(fillers[k++ % fillers.length])
        }
      })
      return out.join('\n\n')
    }
  },
  // continuity: a flat contradiction of the story bible, stated as fact.
  contradiction: {
    dimension: 'continuity',
    apply: (prose, { bible }) => {
      const name = (bible.match(/\b(Nesrin|Halim|Ahmed|Yusuf|Kemal|Idris)\b/) || [])[1] || 'Halim'
      const paras = prose.split(/\n\s*\n/)
      const insertAt = Math.max(1, Math.floor(paras.length / 2))
      paras.splice(
        insertAt,
        0,
        `${name} had been dead for two years by then, buried past the salt flats, ` +
          `and everyone on the road knew it. No debt had ever passed between them.`
      )
      return paras.join('\n\n')
    }
  }
}

describe('live: gate sensitivity to injected defects', () => {
  it('scores a control and one variant per defect for each scene', async () => {
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
    await useProjectStore().loadProject(
      await createProject('Gate Sensitivity', 'Literary historical fiction', 'gate-sens', 1)
    )

    const { setRolePlacement } = await import('@/config/roles')
    setRolePlacement('critic', { model: MODEL, device: 'gpu', numCtx: 8192, keepAlive: '30m' })

    const { useStoryCritic } = await import('@/composables/useStoryCritic')
    const critic = useStoryCritic()

    const results = []
    const startedAt = Date.now()

    for (const index of TEST_SCENES) {
      const scene = corpus.find((c) => c.index === index)
      if (!scene) continue
      for (const [defect, spec] of Object.entries(DEFECTS)) {
        const draft = spec.apply(scene.draft, { bible: scene.storyBible })
        const changed = draft !== scene.draft || defect === 'control'
        if (!changed) {
          // An injection that did not alter the prose would silently become a
          // second control and dilute the comparison.
          console.warn(`[gate-sens] scene ${index}: defect "${defect}" changed nothing — skipped`)
          continue
        }
        for (let rep = 1; rep <= REPEATS; rep++) {
          const t0 = Date.now()
          let verdict = null
          let error = null
          try {
            verdict = await critic.evaluateScene({
              draft,
              sceneBrief: scene.sceneBrief,
              storyBible: scene.storyBible,
              chapterLog: '',
              existingEntitiesJson: null,
              focusInstructions: null
            })
          } catch (e) {
            error = String(e && e.message ? e.message : e)
          }
          const row = {
            index,
            defect,
            targetDimension: spec.dimension,
            repeat: rep,
            chars: draft.length,
            charsDelta: draft.length - scene.draft.length,
            score: verdict ? verdict.score : null,
            pass: verdict ? verdict.pass : null,
            dimensionScores: verdict ? verdict.dimensionScores || {} : {},
            issueCount: verdict && Array.isArray(verdict.issues) ? verdict.issues.length : null,
            verdictReason: verdict ? verdict.verdictReason || null : null,
            ms: Date.now() - t0,
            error
          }
          results.push(row)
          console.log(
            `[${index} ${defect} r${rep}] score=${row.score} pass=${row.pass} ` +
              `dims=${JSON.stringify(row.dimensionScores)} issues=${row.issueCount}`
          )
        }
      }
    }

    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          model: MODEL,
          repeats: REPEATS,
          scenes: TEST_SCENES,
          defects: Object.keys(DEFECTS),
          totalMinutes: +((Date.now() - startedAt) / 60000).toFixed(1),
          rows: results.length,
          errors: results.filter((r) => r.error).length,
          results
        },
        null,
        2
      )
    )
    expect(results.length).toBeGreaterThan(0)
  })
})
