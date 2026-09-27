/**
 * Live probe (§35): does the agentic Editor answer legal moves?
 *
 *   npx vitest run --config vitest.live.config.js src/tests/live/editorLegality.live.js
 *
 * A 2x2 book run no longer exercises the Editor model: with the gate passing
 * nearly every scene, each step has one legal move per lane and the model is
 * never asked. So this builds 24 run states that DO have choices (failed
 * verdicts to revise or accept, drafts waiting, scenes to draft) and asks the
 * multi-agent preset's Editor (qwen2.5:3b-instruct, CPU) each one twice: with
 * the editor-v1 schema (any action, any integer or null target) and with the
 * editor-v3 per-call schema (one enum of legal gpu/cpu pairs). Every
 * answer goes through `validateEditorAnswer`. Writes
 * reports/live/editor-legality.json.
 */
import 'fake-indexeddb/auto'
import { it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { STORAGE_KEYS } from '@/config/storageKeys'

const V1_SCHEMA = {
  type: 'object',
  properties: {
    gpu: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['draft', 'critique', 'revise', 'commit', 'stop', 'wait'] },
        target: { type: ['integer', 'null'] },
        instructions: { type: 'string' }
      },
      required: ['action', 'target']
    },
    cpu: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['draft', 'critique', 'revise', 'commit', 'stop', 'wait'] },
        target: { type: ['integer', 'null'] }
      },
      required: ['action', 'target']
    },
    why: { type: 'string' }
  },
  required: ['gpu', 'cpu', 'why']
}

function states() {
  const out = []
  const issues = [
    ['Dialogue repeats itself', 'Voice flat in the argument'],
    ['"since the day Halim died" contradicts "Halim is alive"'],
    ['Paragraphs 4, 7 advance nothing'],
    []
  ]
  for (let v = 0; v < 24; v++) {
    const n = 4 + (v % 3)
    const scenes = Array.from({ length: n }, (_, i) => ({
      index: i,
      title: `Scene ${i + 1}`,
      status: 'planned',
      attempts: 0,
      score: null,
      pass: null,
      continuity: null,
      topIssues: [],
      gateFailure: null
    }))
    // Committed history, one or two failed verdicts with attempts left, a
    // waiting draft, and planned scenes after.
    scenes[0].status = 'committed'
    const failed = [1, ...(v % 2 ? [2] : [])]
    for (const f of failed) {
      Object.assign(scenes[f], {
        status: 'critiqued',
        attempts: 1,
        score: [5, 6, 6.5, 4][v % 4],
        pass: false,
        continuity: v % 4 === 1 ? 3 : 8,
        topIssues: issues[(v + f) % issues.length]
      })
    }
    const d = failed.length + 1
    if (d < n - 1) scenes[d].status = 'drafted'
    out.push({
      scenes,
      budget: { maxAttempts: 2 + (v % 2), lookahead: 2, budgetNote: null },
      gpuBusy: false,
      cpuBusy: false,
      recent: []
    })
  }
  return out
}

it('editor answers: v1 schema vs v2 legal-move schema', async () => {
  setActivePinia(createPinia())
  const HOST = 'http://localhost:11434'
  localStorage.setItem(STORAGE_KEYS.OLLAMA_ENDPOINT, HOST)
  localStorage.setItem(
    STORAGE_KEYS.SETTINGS,
    JSON.stringify({ ollamaEndpoint: HOST, ollamaModel: 'qwen3:8b' })
  )
  const { applyRolePreset, MULTI_AGENT_PRESET } = await import('@/config/roles')
  applyRolePreset(MULTI_AGENT_PRESET)
  const { aiGenerateJson } = await import('@/composables/useAiService')
  const { FEATURES } = await import('@/config/ai')
  const ed = await import('@/composables/useStoryEditor')
  const system = (await import('@/composables/useStoryEditor')).EDITOR_SYSTEM_PROMPT
  const rows = []
  for (const s of states()) {
    const legal = ed.legalMoves(s)
    const row = { gpu: legal.gpu.map(ed.moveLabel), cpu: legal.cpu.map(ed.moveLabel) }
    for (const [name, schema, prompt] of [
      [
        'v1',
        V1_SCHEMA,
        ed
          .buildEditorPrompt(s, legal)
          .replace(
            /Reply as JSON:.*$/,
            'Reply as JSON: {"gpu": {"action", "target", "instructions"?}, "cpu": {"action", "target"}, "why": "one sentence"}'
          )
      ],
      ['v3', ed.buildEditorSchema(legal), ed.buildEditorPrompt(s, legal)]
    ]) {
      const raw = await aiGenerateJson(prompt, system, {
        feature: FEATURES.STORY_GENERATION,
        role: 'editor',
        temperature: 0.2,
        maxTokens: 300,
        schema,
        schemaName: 'editor_decision'
      }).catch((e) => ({ error: String(e?.message || e) }))
      const { decision, reason } = ed.validateEditorAnswer(raw, legal)
      row[name] = { legal: !!decision, reason, raw }
    }
    rows.push(row)
  }
  const count = (k) => rows.filter((r) => r[k].legal).length
  writeFileSync(
    join(process.cwd(), 'reports/live/editor-legality.json'),
    JSON.stringify({ v1Legal: count('v1'), v3Legal: count('v3'), n: rows.length, rows }, null, 1)
  )
  expect(rows.length).toBe(24)
}, 3_600_000)
