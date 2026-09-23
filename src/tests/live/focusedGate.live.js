/**
 * Live experiment: does asking about ONE dimension restore the gate's
 * sensitivity?
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/focusedGate.live.js
 *
 * §16 showed the five-dimension gate passing 40 of 40 deliberately broken
 * scenes, with the targeted dimension moving −0.1, −0.8, −0.1 and +0.2. This is
 * the last cheap explanation from the prompt side: one call asks for five
 * numbers, five rubrics, an issues array and a strengths array over a
 * 6,000-character scene, and maybe the judgement is simply spread too thin.
 *
 * So this asks one question at a time. Same scenes, same injected defects as
 * §16, but the model is asked for a single dimension's score with only that
 * dimension's rubric, and each variant is paired against its own control on the
 * identical question.
 *
 * If a focused call catches what the combined call misses, the gate can be
 * rebuilt as N cheap focused calls. If it misses them too, the model cannot do
 * this job and the gate belongs in deterministic checks.
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

const OUT = join(process.cwd(), 'reports', 'live', 'focused-gate')
mkdirSync(OUT, { recursive: true })

const DIALOGUE = /[“"][^“”"]{4,}[”"]/

/** The same four injections as §16, each with distinct text per insert. */
const DEFECTS = {
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
  told_not_shown: {
    dimension: 'show_tell',
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
      return prose
        .split(/\n\s*\n/)
        .map((p, i) => (i % 2 === 0 && p.length > 200 ? summaries[k++ % summaries.length] : p))
        .join('\n\n')
    }
  },
  padding: {
    dimension: 'pacing',
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
  contradiction: {
    dimension: 'continuity',
    apply: (prose, bible) => {
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
  }
}

const FOCUSED_SCHEMA = {
  type: 'object',
  properties: {
    evidence: { type: 'string' },
    score: { type: 'number' }
  },
  required: ['evidence', 'score']
}

describe('live: focused single-dimension gate', () => {
  it('asks one dimension at a time, control vs injected', async () => {
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
      await createProject('Focused Gate', 'Literary historical fiction', 'focused', 1)
    )

    const { formatDimensionRubrics } = await import('@/config/evalDimensions')
    const { aiGenerateJson } = await import('@/composables/useAiService')
    const { FEATURES } = await import('@/config/ai')

    /**
     * One dimension, its own rubric, and evidence before the number — the model
     * has to quote what it is judging before it scores it.
     */
    async function judge(dimension, prose, brief, bible) {
      const rubric = formatDimensionRubrics('creative', [dimension])
      const prompt = `Judge ONE aspect of this scene: ${dimension}.

SCORING SCALE — use these anchors and nothing else:
${rubric}

First quote the specific text that decides your score, then give the score.
If the scene is weak on this aspect, say so — a middling default is worse than
an honest low mark.

SCENE BRIEF:
- Title: ${brief.title}
- Emotional goal: ${brief.emotionalGoal}
- Characters present: ${(brief.charactersPresent || []).join(', ')}

STORY BIBLE (established facts — contradicting these is a continuity failure):
${bible}

SCENE:
${prose}

Return JSON: { "evidence": "the text that decides it", "score": number }`
      const parsed = await aiGenerateJson(
        prompt,
        `You are a story editor judging exactly one aspect: ${dimension}. You quote evidence, then score.`,
        {
          feature: FEATURES.STORY_GENERATION,
          role: 'critic',
          temperature: 0.3,
          maxTokens: 500,
          schema: FOCUSED_SCHEMA,
          schemaName: 'focused_dimension'
        }
      ).catch(() => null)
      return parsed && typeof parsed.score === 'number'
        ? { score: parsed.score, evidence: String(parsed.evidence || '').slice(0, 300) }
        : { score: null, evidence: null }
    }

    const results = []
    const startedAt = Date.now()
    for (const index of TEST_SCENES) {
      const scene = corpus.find((c) => c.index === index)
      if (!scene) continue
      for (const [defect, spec] of Object.entries(DEFECTS)) {
        const injected = spec.apply(scene.draft, scene.storyBible)
        if (injected === scene.draft) {
          console.warn(`[focused] scene ${index}: "${defect}" changed nothing — skipped`)
          continue
        }
        for (let rep = 1; rep <= REPEATS; rep++) {
          for (const [variant, prose] of [
            ['control', scene.draft],
            ['injected', injected]
          ]) {
            const t0 = Date.now()
            const r = await judge(spec.dimension, prose, scene.sceneBrief, scene.storyBible)
            results.push({
              index,
              defect,
              dimension: spec.dimension,
              variant,
              repeat: rep,
              score: r.score,
              evidence: r.evidence,
              ms: Date.now() - t0
            })
            console.log(
              `[${index} ${defect} ${variant} r${rep}] ${spec.dimension}=${r.score} ` +
                `(${((Date.now() - t0) / 1000).toFixed(0)}s)`
            )
          }
        }
      }
    }

    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          model: MODEL,
          repeats: REPEATS,
          totalMinutes: +((Date.now() - startedAt) / 60000).toFixed(1),
          rows: results.length,
          unparsed: results.filter((r) => r.score === null).length,
          results
        },
        null,
        2
      )
    )
    expect(results.length).toBeGreaterThan(0)
  })
})
