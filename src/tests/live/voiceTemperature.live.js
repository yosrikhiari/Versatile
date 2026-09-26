/**
 * Live probe (§34): the voice judge alone, at the production prompt and
 * options, varying only the sampling temperature (0.3 in production until
 * §34; every other focused judge samples at 0).
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/voiceTemperature.live.js
 *
 * Writes reports/live/voice-temperature.json: repeat scores for one scene's
 * unchanged dialogue, and every labelled pool scene clean and with every line
 * of dialogue flattened to one sentence (gateSensitivity's voice_flatten).
 */
import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const HOST = 'http://localhost:11434'
const MODEL = 'qwen3:8b'
const DIALOGUE = /[“"][^“”"]{4,}[”"]/
const flatten = (prose) =>
  prose
    .split('\n')
    .map((l) => (DIALOGUE.test(l) ? l.replace(DIALOGUE, '"We should keep moving," ') : l))
    .join('\n')

it('voice judge: temperature 0.3 vs 0', async () => {
  setActivePinia(createPinia())
  localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
  localStorage.setItem(
    STORAGE_KEYS.SETTINGS,
    JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: MODEL })
  )
  const { setRolePlacement } = await import('@/config/roles')
  setRolePlacement('critic', { model: MODEL, device: 'gpu', numCtx: 8192, keepAlive: '30m' })
  const { aiGenerateJson } = await import('@/composables/useAiService')
  const { buildVoicePrompt, extractDialogueLines, countSpeeches, MIN_VOICE_LINES, JUDGE_SAMPLING } =
    await import('@/composables/criticIsolation')
  const { formatDimensionRubrics } = await import('@/config/evalDimensions')
  const { FEATURES } = await import('@/config/ai')

  const judge = async (s, prose, temperature) => {
    if (countSpeeches(prose) < MIN_VOICE_LINES) return null
    const r = await aiGenerateJson(
      buildVoicePrompt({
        lines: extractDialogueLines(prose),
        storyBible: (s.facts || []).join('\n'),
        charactersPresent: s.brief.characters || [],
        rubric: formatDimensionRubrics('creative', ['voice'])
      }),
      'You judge dialogue voice from dialogue alone, and you are willing to mark it low.',
      {
        feature: FEATURES.STORY_GENERATION,
        role: 'critic',
        temperature,
        maxTokens: 300,
        schema: {
          type: 'object',
          properties: { score: { type: 'number' }, issue: { type: 'string' } },
          required: ['score']
        },
        schemaName: 'focused_voice_isolated',
        ...JUDGE_SAMPLING
      }
    ).catch(() => null)
    return typeof r?.score === 'number' ? r.score : null
  }

  const pool = JSON.parse(
    readFileSync(join(process.cwd(), 'reports/live/labelling/scenes.json'), 'utf-8')
  ).scenes
  const labels = Object.fromEntries(
    JSON.parse(
      readFileSync(
        join(process.cwd(), 'reports/live/labelling/claude-labels/consensus.json'),
        'utf-8'
      )
    ).map((r) => [r.sceneId, r.dims.voice])
  )
  const out = { repeats: {}, pool: [] }
  const s10 = pool.find((s) => s.id === 'salt-corpus-10')
  for (const t of [0.3, 0]) {
    out.repeats[t] = []
    for (let k = 0; k < 5; k++) out.repeats[t].push(await judge(s10, s10.prose, t))
  }
  for (const s of pool) {
    const row = { id: s.id, label: labels[s.id] ?? null }
    for (const t of [0.3, 0]) {
      row[`clean@${t}`] = await judge(s, s.prose, t)
      row[`flat@${t}`] = await judge(s, flatten(s.prose), t)
    }
    out.pool.push(row)
  }
  writeFileSync(
    join(process.cwd(), 'reports/live/voice-temperature.json'),
    JSON.stringify(out, null, 1)
  )
  expect(out.pool.length).toBe(pool.length)
}, 7_200_000)
