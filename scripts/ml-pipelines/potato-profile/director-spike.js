/**
 * DIRECTOR SPIKE — the make-or-break test for Phase 2 of the "what-if" feature.
 *
 * The corrected design (plan §5) replaces the consistency "janitor" (which erases
 * differences) with a "Director": given a ChangeSet (a divergence), for each
 * downstream scene it must decide "must this change, and how?" and emit a rewrite
 * instruction that EXPLICITLY permits changing events/outcome. This script tests
 * whether a local model can actually do that reasoning reliably.
 *
 * Reuses the ingested Magi scenes + fact ledgers from reports/ingest-spike.json.
 * Two runs:
 *   RECALL   — the real divergence ("Della keeps her hair, buys no chain").
 *              Ground truth: all 4 scenes are affected (in different ways).
 *   PRECISION— a cosmetic control divergence ("the pier-glass became a plain
 *              square mirror"). Ground truth: nothing downstream is affected.
 *
 * The hardest reasoning probe: Jim sold his watch to buy combs BEFORE arriving
 * (scene 3). That sacrifice is causally INDEPENDENT of Della's choice — a good
 * Director keeps it but flags that its MEANING inverts (combs now usable). A
 * janitor-style model would wrongly "undo" Jim's sale to remove the contradiction.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/director-spike.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/director-spike.js --model qwen3:8b
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

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
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
  if (!usable.length) throw new Error('No non-embedding models pulled.')
  if (explicit && !usable.includes(explicit)) throw new Error(`Model "${explicit}" not pulled.`)
  return explicit || usable.find((n) => /dolphin|mistral/i.test(n)) || usable[0]
}

// Re-derive scene prose deterministically (same splitter as the ingest spike).
function cleanGutenberg(raw) {
  const s = raw.indexOf('*** START')
  const e = raw.indexOf('*** END')
  let body = s !== -1 && e !== -1 ? raw.slice(raw.indexOf('\n', s) + 1, e) : raw
  return body.replace(/\r/g, '').trim()
}
function splitIntoScenes(text, targetWords = 550) {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const scenes = []
  let buf = [], wc = 0
  for (const p of paras) {
    buf.push(p); wc += p.split(/\s+/).length
    if (wc >= targetWords) { scenes.push(buf.join('\n\n')); buf = []; wc = 0 }
  }
  if (buf.length) scenes.push(buf.join('\n\n'))
  return scenes.map((content, i) => ({ sceneNumber: i + 1, content }))
}

// The Director's structured output contract.
const DIRECTOR_SCHEMA = {
  type: 'object',
  properties: {
    affected: { type: 'boolean' },
    reachedVia: { type: 'string' }, // which delta / causal path reaches this scene ('' if unaffected)
    eventsThatChange: { type: 'array', items: { type: 'string' } }, // outcomes that must now differ
    eventsThatStayButMeaningShifts: { type: 'array', items: { type: 'string' } }, // causally-independent
    rewriteInstruction: { type: 'string' }, // mandatory instruction to the writer (may change events)
    severity: { type: 'string', enum: ['unaffected', 'light-touch', 'rewrite'] },
    confidence: { type: 'number' }
  },
  required: ['affected', 'severity', 'rewriteInstruction']
}

const DIRECTOR_SYSTEM = `You are a continuity DIRECTOR for an alternate-timeline rewrite of a novel.
A change has been made at a divergence point. Your job is NOT to smooth over or erase contradictions — it is to decide how a given downstream scene must genuinely CHANGE so the story honors the new timeline.
Events and outcomes ARE allowed and expected to change. Never instruct the writer to keep events the same.
Reason about causal direction: some things in a scene are caused by the change (they must change); other things happened INDEPENDENTLY of it (they stay, though their emotional meaning may shift). Do not undo an independent event just to remove a contradiction.
Respond only with the requested JSON.`

function directorPrompt(changeSet, scene, ledger, summary) {
  const deltas = changeSet.deltas
    .map((d) => `  - [${d.category}, ${d.scope}] ${d.subject}: was "${d.from}" → now "${d.to}"`)
    .join('\n')
  const facts = ledger
    ? `Facts: characters=[${ledger.facts.characters.join(', ')}]; objects=[${ledger.facts.objects.join(', ')}]; events=[${ledger.facts.events.join(' | ')}]`
    : ''
  return `DIVERGENCE applied at ${changeSet.anchorSceneId}:
"${changeSet.premise}"

DELTAS (the change, in machine terms):
${deltas}

DOWNSTREAM SCENE ${scene.sceneNumber}${summary ? ` — summary: "${summary}"` : ''}
${facts}
PROSE (excerpt):
${scene.content.slice(0, 1800)}

In the NEW timeline, decide:
- affected: does this scene need to change at all?
- reachedVia: which delta / causal path makes it change (empty if unaffected).
- eventsThatChange: concrete events/outcomes in THIS scene that must now be different.
- eventsThatStayButMeaningShifts: events that happened independently of the change and still occur, but whose meaning/emotion shifts.
- rewriteInstruction: ONE mandatory instruction to the writer. It MAY (and usually must) change events and outcomes — do NOT tell it to keep them the same. If unaffected, say so.
- severity: unaffected | light-touch | rewrite.
- confidence: 0..1.`
}

async function main() {
  say('DIRECTOR SPIKE — can a local model turn a ChangeSet into per-scene rewrite instructions?')
  say('='.repeat(90))
  const model = await pickModel()
  say(`model: ${model}`)
  say()

  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useSettingsStore } = await import('../../../src/stores/settingsStore.js')
  const settings = useSettingsStore()
  settings.ollamaModel = model
  settings.aiProvider = 'ollama'
  settings.aiProviderFallback = 'none'
  const { aiGenerateJson } = await import('../../../src/composables/useAiService.js')
  const { FEATURES } = await import('../../../src/config/ai.ts')

  const report = JSON.parse(readFileSync(resolve(REPORTS_DIR, 'ingest-spike.json'), 'utf8'))
  const ledgerByNum = Object.fromEntries(report.ledgers.map((l) => [l.sceneNumber, l]))
  const summaryByNum = Object.fromEntries(
    (report.metaResults || []).map((m, i) => [i + 1, m.meta?.summary])
  )
  const scenes = splitIntoScenes(cleanGutenberg(readFileSync(TEXT_PATH, 'utf8')))
  // Generous ceiling: thinking models (qwen3) spend output budget reasoning
  // BEFORE the JSON; too small a cap truncates mid-object. num_predict is a
  // ceiling, not a target — non-thinking models stop early and don't pay for it.
  const aiOptions = { feature: FEATURES.STORY_GENERATION, temperature: 0.2, maxTokens: 3500, numCtx: 8192 }

  // ---- The real divergence (RECALL test) ----
  const divergence = {
    anchorSceneId: 'scene-1',
    premise:
      'Della cannot bring herself to sell her beautiful hair. She keeps it intact, and therefore has no money to buy Jim a Christmas present.',
    deltas: [
      { category: 'character_state', subject: "Della's hair", from: 'sold and cut short', to: 'kept, still long', scope: 'hard' },
      { category: 'object_state', subject: 'platinum fob chain', from: 'Della buys it for Jim', to: 'never bought (Della has no money)', scope: 'hard' },
      { category: 'motivation', subject: 'Della', from: 'sacrifices her hair out of love', to: 'cannot make the sacrifice; now has no gift and feels ashamed', scope: 'soft' }
    ]
  }

  // ---- Cosmetic control (PRECISION test) — should touch nothing downstream ----
  const control = {
    anchorSceneId: 'scene-2',
    premise: 'The pier-glass mirror in the flat is replaced by a plain square mirror. Nothing else changes.',
    deltas: [
      { category: 'object_state', subject: 'the mirror', from: 'a narrow pier-glass', to: 'a plain square mirror', scope: 'soft' }
    ]
  }

  async function runDirector(label, changeSet, expected) {
    say(`\n${'#'.repeat(90)}\n# ${label}\n# divergence: "${changeSet.premise}"\n${'#'.repeat(90)}`)
    const rows = []
    for (const scene of scenes) {
      const t0 = Date.now()
      let r = null
      try {
        r = await aiGenerateJson(
          directorPrompt(changeSet, scene, ledgerByNum[scene.sceneNumber], summaryByNum[scene.sceneNumber]),
          DIRECTOR_SYSTEM,
          { ...aiOptions, schema: DIRECTOR_SCHEMA, schemaName: 'director' }
        )
      } catch (e) {
        say(`  scene-${scene.sceneNumber}: DIRECTOR FAILED — ${e.message}`)
      }
      const dt = ((Date.now() - t0) / 1000).toFixed(1)
      const exp = expected[scene.sceneNumber - 1]
      const correct = r ? r.affected === exp : false
      say(`\n  scene-${scene.sceneNumber} (${dt}s)  affected=${r?.affected} [expected ${exp}] ${ok(correct)}  severity=${r?.severity} conf=${r?.confidence}`)
      if (r) {
        say(`     reachedVia: ${r.reachedVia || '(none)'}`)
        say(`     eventsThatChange: ${(r.eventsThatChange || []).map((e) => `\n        • ${e}`).join('') || ' (none)'}`)
        say(`     staysButMeaningShifts: ${(r.eventsThatStayButMeaningShifts || []).map((e) => `\n        • ${e}`).join('') || ' (none)'}`)
        say(`     rewriteInstruction: "${r.rewriteInstruction}"`)
      }
      rows.push({ scene: scene.sceneNumber, expected: exp, ...r, seconds: Number(dt), correct })
    }
    return rows
  }

  // Ground truth: hair divergence affects ALL four scenes. Cosmetic control affects NONE.
  const recallRows = await runDirector('RECALL — real divergence', divergence, [true, true, true, true])
  const precisionRows = await runDirector('PRECISION — cosmetic control', control, [false, false, false, false])

  // ---- Scoring ----
  say(`\n\n${'='.repeat(90)}\nSCORING\n${'='.repeat(90)}`)
  const recallCorrect = recallRows.filter((r) => r.correct).length
  const precisionCorrect = precisionRows.filter((r) => r.correct).length
  say(`  RECALL (affected scenes correctly flagged):   ${recallCorrect}/4`)
  say(`  PRECISION (cosmetic control left untouched):  ${precisionCorrect}/4  (false positives: ${4 - precisionCorrect})`)

  // Anti-janitor check: affected scenes' instructions must be change-oriented, not "keep the same".
  const janitorPhrases = /keep (the )?(scene'?s )?(events|outcome|plot|length|same)|unchanged|do not change/i
  const changeVerbs = /(change|remove|replace|no longer|instead|drop|cut|reverse|rewrite so|now)/i
  const affectedInstr = recallRows.filter((r) => r.affected)
  const antiJanitorOk = affectedInstr.filter(
    (r) => r.rewriteInstruction && changeVerbs.test(r.rewriteInstruction) && !janitorPhrases.test(r.rewriteInstruction)
  ).length
  say(`  ANTI-JANITOR (instructions direct real change, not "keep same"): ${antiJanitorOk}/${affectedInstr.length}`)

  // Causal-direction probe: on scene 3 or 4, did it keep Jim's independent sacrifice
  // (watch/combs) rather than wrongly "undo" it?
  const late = recallRows.filter((r) => r.scene >= 3)
  const keptJim = late.filter((r) =>
    (r.eventsThatStayButMeaningShifts || []).join(' ').toLowerCase().match(/watch|comb|jim/)
  ).length
  const wronglyUndidJim = late.filter((r) =>
    (r.eventsThatChange || []).join(' ').toLowerCase().match(/jim (did not|never) sell|watch not sold|jim keeps his watch/)
  ).length
  say(`  CAUSAL DIRECTION (kept Jim's independent watch/combs sacrifice on late scenes): ${keptJim}/${late.length}`)
  say(`  CAUSAL ERROR (wrongly undid Jim's watch sale): ${wronglyUndidJim} ${wronglyUndidJim === 0 ? '✓' : '✗ (janitor-style error)'}`)

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(
    resolve(REPORTS_DIR, 'director-spike.json'),
    JSON.stringify({ model, divergence, control, recallRows, precisionRows, scores: { recallCorrect, precisionCorrect, antiJanitorOk, keptJim, wronglyUndidJim } }, null, 2)
  )
  say('\nWrote reports/director-spike.json')
}

main().catch((e) => {
  say(`\nDIRECTOR SPIKE FAILED: ${e.message}`)
  if (e.cause) say(`  cause: ${e.cause.message || e.cause}`)
  process.exitCode = 1
})
