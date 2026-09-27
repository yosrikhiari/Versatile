/**
 * Live follow-up to repairVsRewrite (§35): a stricter sentence-repair prompt,
 * on the same failing drafts and verdicts (reports/live/repair-vs-rewrite.json).
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/repairPromptV2.live.js
 *
 * Production's prompt says "change as little as possible"; on the first case
 * the model swapped "had been dead" for "had been leading a caravan" and kept
 * "buried past the salt flats", so the repair still failed. The candidate asks
 * that nothing left in the sentence state or imply the contradicted fact. No
 * example is taken from the test sentences. Writes
 * reports/live/repair-prompt-v2.json.
 */
import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = 'http://localhost:11434'
const MODEL = 'qwen3:8b'

export function repairPromptV2(sentence, fact) {
  return `This sentence from a scene contradicts an established fact of the story.

FACT: ${fact}
SENTENCE: ${sentence}

Rewrite this sentence so that nothing in it states OR implies anything the fact rules out: remove or change every word and phrase that depends on the contradiction, not only the main verb. Keep its place in the scene, its voice and roughly its length. If the sentence cannot be saved, return an empty string to delete it.

Return JSON: { "sentence": "the rewritten sentence, or empty" }`
}

it('stricter sentence repair on the same failing drafts', async () => {
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
  await useProjectStore().loadProject(await createProject('Repair v2', 'Adventure', 'rv2', 1))
  const { setRolePlacement } = await import('@/config/roles')
  setRolePlacement('critic', { model: MODEL, device: 'gpu', numCtx: 8192, keepAlive: '30m' })
  const { useStoryCritic } = await import('@/composables/useStoryCritic')
  const { aiGenerateJson } = await import('@/composables/useAiService')
  const { applyRepair, SENTENCE_REPAIR_SCHEMA, JUDGE_SAMPLING } =
    await import('@/composables/criticIsolation')
  const { FEATURES } = await import('@/config/ai')
  const critic = useStoryCritic()
  const corpus = JSON.parse(
    readFileSync(join(process.cwd(), 'reports/live/critic-rank-agreement/corpus.json'), 'utf-8')
  )
  const rows = JSON.parse(
    readFileSync(join(process.cwd(), 'reports/live/repair-vs-rewrite.json'), 'utf-8')
  )
  const out = []
  for (const r of rows) {
    if (r.skipped || !r.before?.evidence?.length) continue
    const c = corpus.find((x) => x.index === Number(r.id.split('-')[1]))
    const t = Date.now()
    const replacements = []
    for (const e of r.before.evidence) {
      const res = await aiGenerateJson(
        repairPromptV2(e.sentence, e.fact),
        'You are a careful line editor for fiction.',
        {
          feature: FEATURES.STORY_GENERATION,
          role: 'critic',
          temperature: 0,
          maxTokens: 200,
          schema: SENTENCE_REPAIR_SCHEMA,
          schemaName: 'repair_sentence',
          ...JUDGE_SAMPLING
        }
      ).catch(() => null)
      if (typeof res?.sentence !== 'string') break
      replacements.push({ sentence: e.sentence, replacement: res.sentence.trim() })
    }
    const text =
      replacements.length === r.before.evidence.length
        ? applyRepair(r.original, [], replacements)
        : null
    const fixMs = Date.now() - t
    const v =
      text && text !== r.original
        ? await critic.evaluateScene({
            draft: text,
            sceneBrief: c.sceneBrief,
            storyBible: c.storyBible,
            chapterLog: ''
          })
        : null
    out.push({
      id: r.id,
      text,
      fixMs,
      pass: v?.pass ?? null,
      reason: v?.verdictReason ?? null,
      replacements
    })
    writeFileSync(
      join(process.cwd(), 'reports/live/repair-prompt-v2.json'),
      JSON.stringify(out, null, 1)
    )
  }
  expect(out.length).toBeGreaterThan(0)
}, 7_200_000)
