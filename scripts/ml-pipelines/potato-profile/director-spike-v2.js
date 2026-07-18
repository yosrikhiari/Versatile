/**
 * DIRECTOR SPIKE v2 — tests the two fixes §14 called for:
 *   (1) a DETERMINISTIC subject-overlap PRE-FILTER as the precision mechanism
 *       (the LLM's "affected?" flag over-flags & confabulates — worse on the
 *       stronger model). The pre-filter decides which scenes the Director even sees.
 *   (2) a TWO-STEP "reason-then-instruct" prompt with REQUIRED decomposition fields
 *       + a strict "default to unaffected" instruction, to (a) fix precision and
 *       (b) actually populate eventsThatChange / eventsThatStayButMeaningShifts
 *       (both models left them empty in v1).
 *
 * Reuses Magi scenes + ledgers from reports/ingest-spike.json.
 *   npx vite-node scripts/ml-pipelines/potato-profile/director-spike-v2.js --model qwen3:8b
 */

import 'fake-indexeddb/auto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..', '..')
const REPORTS_DIR = resolve(ROOT, 'reports')
const TEXT_PATH = arg(
  'text',
  'C:/Users/yosri/AppData/Local/Temp/claude/D--Versatile-Versatile/630cb763-de95-4519-bc7b-65822bc1c320/scratchpad/magi.txt'
)
function arg(name, fb) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fb
}
const ENDPOINT = arg('endpoint', process.env.OLLAMA_HOST || 'http://localhost:11434')
const STORE = { versatile_ollama_endpoint: ENDPOINT }
globalThis.localStorage = {
  getItem: (k) => (k in STORE ? STORE[k] : null),
  setItem: (k, v) => (STORE[k] = String(v)),
  removeItem: (k) => delete STORE[k]
}
const say = (s = '') => console.log(s)
const ok = (b) => (b ? '✓' : '✗')

async function pickModel() {
  const explicit = arg('model', null)
  const { models = [] } = await (await fetch(`${ENDPOINT}/api/tags`)).json()
  const usable = models.map((m) => m.name).filter((n) => !/embed/i.test(n))
  if (explicit && !usable.includes(explicit)) throw new Error(`Model "${explicit}" not pulled.`)
  return explicit || usable.find((n) => /qwen/i.test(n)) || usable[0]
}
function cleanGutenberg(raw) {
  const s = raw.indexOf('*** START'), e = raw.indexOf('*** END')
  return (s !== -1 && e !== -1 ? raw.slice(raw.indexOf('\n', s) + 1, e) : raw).replace(/\r/g, '').trim()
}
function splitIntoScenes(text, targetWords = 550) {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const scenes = []; let buf = [], wc = 0
  for (const p of paras) {
    buf.push(p); wc += p.split(/\s+/).length
    if (wc >= targetWords) { scenes.push(buf.join('\n\n')); buf = []; wc = 0 }
  }
  if (buf.length) scenes.push(buf.join('\n\n'))
  return scenes.map((content, i) => ({ sceneNumber: i + 1, content }))
}

// ---------- FIX 1: deterministic subject-overlap pre-filter ----------
// Character names appear pervasively and aren't distinctive subjects; generic
// adjectives/verbs of the change ("plain", "sold") aren't reliable anchors.
const CHAR_NAMES = new Set(['della', 'jim', 'james', 'dillingham', 'young', 'sofronie', 'mme'])
const NON_ANCHOR = new Set(['plain', 'square', 'narrow', 'small', 'large', 'great', 'still', 'short', 'long',
  'sold', 'cut', 'kept', 'made', 'never', 'money', 'present', 'gift', 'christmas', 'buys', 'bought', 'love'])
function subjectKeywords(changeSet) {
  const kws = new Set()
  for (const d of changeSet.deltas)
    for (const src of [d.subject, d.from, d.to])
      for (const w of String(src || '').toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/))
        if (w.length >= 4 && !CHAR_NAMES.has(w) && !NON_ANCHOR.has(w)) kws.add(w)
  return [...kws]
}
function candidateScenes(scenes, keywords) {
  return scenes.filter((s) => {
    const hay = s.content.toLowerCase()
    return keywords.some((k) => hay.includes(k))
  }).map((s) => s.sceneNumber)
}

// ---------- FIX 2a: reason step, REQUIRED decomposition fields, strict precision ----------
const REASON_SCHEMA = {
  type: 'object',
  properties: {
    affected: { type: 'boolean' },
    reachedVia: { type: 'string' },
    eventsThatChange: { type: 'array', items: { type: 'string' } },
    eventsThatStayButMeaningShifts: { type: 'array', items: { type: 'string' } },
    severity: { type: 'string', enum: ['unaffected', 'light-touch', 'rewrite'] },
    confidence: { type: 'number' }
  },
  required: ['affected', 'reachedVia', 'eventsThatChange', 'eventsThatStayButMeaningShifts', 'severity', 'confidence']
}
const REASON_SYSTEM = `You are a continuity DIRECTOR for an alternate-timeline rewrite of a novel.
Decide whether THIS scene's own events causally depend on the change.
DEFAULT TO affected=false. Only set affected=true if a concrete event or fact IN THIS SCENE directly depends on a changed subject. A purely cosmetic or setting change (an object's appearance swapped) does NOT propagate to events — mark it unaffected or at most light-touch, and never invent consequences.
Reason about causal direction and FILL BOTH arrays:
- eventsThatChange: events/outcomes in this scene that must now be different.
- eventsThatStayButMeaningShifts: events that happened INDEPENDENTLY of the change and still occur, but whose emotional meaning shifts (e.g. a gift bought before the change still exists).
Respond only with the requested JSON.`

// ---------- FIX 2b: instruct step, conditioned on the reasoning ----------
const INSTRUCT_SCHEMA = { type: 'object', properties: { rewriteInstruction: { type: 'string' } }, required: ['rewriteInstruction'] }
const INSTRUCT_SYSTEM = `You write ONE mandatory instruction for a prose writer rewriting a scene in an alternate timeline. The instruction MAY and usually must change events and outcomes — never tell the writer to keep events the same. Be specific to this scene's drama. Respond only with JSON {"rewriteInstruction": "..."}.`

function reasonPrompt(cs, scene, ledger, summary) {
  const deltas = cs.deltas.map((d) => `  - [${d.category}, ${d.scope}] ${d.subject}: "${d.from}" → "${d.to}"`).join('\n')
  const facts = ledger ? `Facts: characters=[${ledger.facts.characters.join(', ')}]; objects=[${ledger.facts.objects.join(', ')}]; events=[${ledger.facts.events.join(' | ')}]` : ''
  return `DIVERGENCE at ${cs.anchorSceneId}: "${cs.premise}"\nDELTAS:\n${deltas}\n\nSCENE ${scene.sceneNumber}${summary ? ` — "${summary}"` : ''}\n${facts}\nPROSE:\n${scene.content.slice(0, 1800)}`
}
function instructPrompt(cs, scene, reasoning) {
  return `DIVERGENCE: "${cs.premise}"\nSCENE ${scene.sceneNumber} must change. Events that change: ${(reasoning.eventsThatChange || []).join('; ')}. Events that stay but shift meaning: ${(reasoning.eventsThatStayButMeaningShifts || []).join('; ')}.\nPROSE:\n${scene.content.slice(0, 1200)}\n\nWrite the single mandatory rewrite instruction.`
}

async function main() {
  say('DIRECTOR SPIKE v2 — deterministic pre-filter + two-step reason/instruct')
  say('='.repeat(90))
  const model = await pickModel()
  say(`model: ${model}\n`)
  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSettingsStore } = await import('../../../src/stores/settingsStore.js')
  const settings = useSettingsStore()
  settings.ollamaModel = model; settings.aiProvider = 'ollama'; settings.aiProviderFallback = 'none'
  const { aiGenerateJson } = await import('../../../src/composables/useAiService.js')
  const { FEATURES } = await import('../../../src/config/ai.ts')

  const report = JSON.parse(readFileSync(resolve(REPORTS_DIR, 'ingest-spike.json'), 'utf8'))
  const ledgerByNum = Object.fromEntries(report.ledgers.map((l) => [l.sceneNumber, l]))
  const summaryByNum = Object.fromEntries((report.metaResults || []).map((m, i) => [i + 1, m.meta?.summary]))
  const scenes = splitIntoScenes(cleanGutenberg(readFileSync(TEXT_PATH, 'utf8')))
  const aiOptions = { feature: FEATURES.STORY_GENERATION, temperature: 0.2, maxTokens: 3500, numCtx: 8192 }

  const divergence = {
    anchorSceneId: 'scene-1',
    premise: 'Della cannot bring herself to sell her beautiful hair. She keeps it intact, and therefore has no money to buy Jim a Christmas present.',
    deltas: [
      { category: 'character_state', subject: "Della's hair", from: 'sold and cut short', to: 'kept, still long', scope: 'hard' },
      { category: 'object_state', subject: 'platinum fob chain', from: 'Della buys it for Jim', to: 'never bought', scope: 'hard' },
      { category: 'motivation', subject: 'Della', from: 'sacrifices her hair out of love', to: 'cannot make the sacrifice; has no gift and feels ashamed', scope: 'soft' }
    ]
  }
  const control = {
    anchorSceneId: 'scene-2',
    premise: 'The pier-glass mirror in the flat is replaced by a plain square mirror. Nothing else changes.',
    deltas: [{ category: 'object_state', subject: 'the pier-glass mirror', from: 'a narrow pier-glass', to: 'a plain square mirror', scope: 'soft' }]
  }

  async function run(label, cs, expectedAffected) {
    const kws = subjectKeywords(cs)
    const candidates = candidateScenes(scenes, kws)
    say(`\n${'#'.repeat(90)}\n# ${label}: "${cs.premise}"\n# PRE-FILTER keywords: [${kws.join(', ')}]`)
    say(`# candidate scenes (deterministic): [${candidates.join(', ') || 'none'}]   non-candidates auto-unaffected: [${scenes.map(s=>s.sceneNumber).filter(n=>!candidates.includes(n)).join(', ') || 'none'}]`)
    const rows = []
    for (const scene of scenes) {
      const n = scene.sceneNumber
      if (!candidates.includes(n)) { rows.push({ scene: n, prefiltered: true, affected: false, severity: 'unaffected' }); continue }
      const t0 = Date.now()
      let r = null, instr = null
      try {
        r = await aiGenerateJson(reasonPrompt(cs, scene, ledgerByNum[n], summaryByNum[n]), REASON_SYSTEM, { ...aiOptions, schema: REASON_SCHEMA, schemaName: 'director_reason' })
        if (r?.affected) {
          const ir = await aiGenerateJson(instructPrompt(cs, scene, r), INSTRUCT_SYSTEM, { ...aiOptions, maxTokens: 800, schema: INSTRUCT_SCHEMA, schemaName: 'director_instruct' })
          instr = ir?.rewriteInstruction
        }
      } catch (e) { say(`  scene-${n}: FAILED ${e.message}`) }
      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      say(`\n  scene-${n} (${dt}s)  affected=${r?.affected} severity=${r?.severity} conf=${r?.confidence}`)
      say(`     reachedVia: ${r?.reachedVia || '(none)'}`)
      say(`     eventsThatChange: ${(r?.eventsThatChange || []).map(e=>`\n        • ${e}`).join('') || ' (none)'}`)
      say(`     staysButMeaningShifts: ${(r?.eventsThatStayButMeaningShifts || []).map(e=>`\n        • ${e}`).join('') || ' (none)'}`)
      if (instr) say(`     rewriteInstruction: "${instr}"`)
      rows.push({ scene: n, prefiltered: false, ...r, rewriteInstruction: instr, seconds: Number(dt) })
    }
    return { kws, candidates, rows }
  }

  const recall = await run('RECALL — real divergence', divergence, [true, true, true, true])
  const precision = await run('PRECISION — cosmetic control', control, [false, false, false, false])

  // ---- Scoring ----
  say(`\n\n${'='.repeat(90)}\nSCORING\n${'='.repeat(90)}`)
  const recAffected = recall.rows.filter((r) => r.affected).length
  say(`  RECALL: ${recAffected}/4 scenes affected (expected 4; pre-filter candidates were [${recall.candidates.join(', ')}])`)
  const precAffected = precision.rows.filter((r) => r.affected && r.severity === 'rewrite')
  say(`  PRECISION: cosmetic control triggered ${precAffected.length} full-rewrite(s) (expected 0). Pre-filter alone scoped it to scenes [${precision.candidates.join(', ') || 'none'}].`)
  // decomposition population (FIX 2 target): how many affected reason-calls filled the arrays?
  const affectedReasoned = recall.rows.filter((r) => !r.prefiltered && r.affected)
  const filledDecomp = affectedReasoned.filter((r) => (r.eventsThatChange || []).length > 0).length
  const filledStays = affectedReasoned.filter((r) => (r.eventsThatStayButMeaningShifts || []).length > 0).length
  say(`  DECOMPOSITION populated (v1 was 0/4): eventsThatChange ${filledDecomp}/${affectedReasoned.length}; staysButMeaningShifts ${filledStays}/${affectedReasoned.length}`)
  // causal direction on late scenes
  const late = recall.rows.filter((r) => r.scene >= 3 && !r.prefiltered)
  const keptJim = late.filter((r) => (r.eventsThatStayButMeaningShifts || []).join(' ').toLowerCase().match(/watch|comb|jim/)).length
  say(`  CAUSAL DIRECTION (late scenes keep Jim's independent watch/combs as 'stays-but-shifts'): ${keptJim}/${late.length}`)

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(resolve(REPORTS_DIR, 'director-spike-v2.json'), JSON.stringify({ model, recall, precision, scores: { recAffected, precFullRewrites: precAffected.length, filledDecomp, filledStays, keptJim } }, null, 2))
  say('\nWrote reports/director-spike-v2.json')
}
main().catch((e) => { say(`\nFAILED: ${e.message}`); if (e.cause) say(`  cause: ${e.cause.message || e.cause}`); process.exitCode = 1 })
