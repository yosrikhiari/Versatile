/**
 * LIVE CHAPTER SMOKE TEST — drives the REAL chapter pipeline against a REAL model.
 *
 * `smoke-writer.js` proves one scene survives the writer's contract. This proves
 * the whole chapter path does: `useChapterStoryGenerator.startGeneration` →
 * bootstrap → plan → `confirmPlan` → per-scene write/critique/commit → terminal
 * continuity audit → the chapter acceptance gate.
 *
 * It exists because every other test of this path mocks the model, and mocked
 * tests are what missed the two largest defects this pipeline has had (silent
 * context overflow, and the JSON envelope suppressing prose ~44x). The specific
 * claims only a live run can settle:
 *
 *   - Does a chapter request actually come back with N scenes? The flag this
 *     pipeline replaced (`singleChapter`) truncated the plan to ONE scene and
 *     sized the session budget for one, so a multi-scene chapter hit the hard
 *     ceiling before reaching a model.
 *   - Does `SessionBudget` survive a real N-scene run with retries?
 *   - Does the chapter gate fire, and are its findings true of the prose?
 *   - Does the short-chapter expansion round help, or does it just refuse to finish?
 *
 * Requires Ollama running with a non-embedding model pulled. This is minutes to
 * an hour of local inference — that is the point, not a defect.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/smoke-chapter.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/smoke-chapter.js --model qwen3:8b --scenes 2 --words 800
 */

import 'fake-indexeddb/auto'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..', '..')
const REPORTS_DIR = resolve(ROOT, 'reports')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const ENDPOINT = arg('endpoint', process.env.OLLAMA_HOST || 'http://localhost:11434')
const SCENES = Number(arg('scenes', '2'))
const WORDS = Number(arg('words', '800'))

// config/ollama.js reads its endpoint from localStorage and falls back to
// '/ollama' — a Vite proxy path that only resolves in the browser. Feeding the
// real origin through the same accessor keeps the app code untouched.
const STORE = { versatile_ollama_endpoint: ENDPOINT }
globalThis.localStorage = {
  getItem: (k) => (k in STORE ? STORE[k] : null),
  setItem: (k, v) => {
    STORE[k] = String(v)
  },
  removeItem: (k) => {
    delete STORE[k]
  },
  clear: () => {
    for (const k of Object.keys(STORE)) delete STORE[k]
  }
}

const say = (s = '') => console.log(s)
const ok = (b) => (b ? '✓' : '✗')
const started = Date.now()
const stamp = () => `[${((Date.now() - started) / 1000).toFixed(0)}s]`

/**
 * Node's `fetch` gives up if a response's HEADERS take longer than 300s
 * (undici's `headersTimeout`, `UND_ERR_HEADERS_TIMEOUT`). Ollama does not send
 * headers for a non-streaming call until the first token, and on a machine
 * where an 8B model is mostly resident in system RAM the first token of a
 * planning prompt lands well past five minutes. Every long call in the first
 * run of this harness died there — the bible stage at 308s, then the planner.
 *
 * The browser imposes no such limit, so this is purely an artefact of running
 * the app's code under Node, and disabling it is what makes the harness measure
 * the pipeline rather than undici. The dispatcher is only created on first
 * fetch, hence the warm-up call.
 */
async function liftFetchTimeouts() {
  const sym = Symbol.for('undici.globalDispatcher.1')
  try {
    await fetch(`${ENDPOINT}/api/version`).then((r) => r.json())
    const current = globalThis[sym]
    if (!current?.constructor) return false
    globalThis[sym] = new current.constructor({ headersTimeout: 0, bodyTimeout: 0 })
    return true
  } catch {
    return false
  }
}

async function pickModel() {
  const explicit = arg('model', null)
  const { models = [] } = await (await fetch(`${ENDPOINT}/api/tags`)).json()
  const usable = models.map((m) => m.name).filter((n) => !/embed/i.test(n))
  if (!usable.length) throw new Error('No non-embedding models pulled.')
  if (explicit && !usable.includes(explicit)) {
    throw new Error(`Model "${explicit}" not pulled. Available: ${usable.join(', ')}`)
  }
  return explicit || usable.find((n) => /qwen/i.test(n)) || usable[0]
}

const SYNOPSIS = [
  'Category: literary crime',
  'Mira Vance has kept the tide ledger over a failing harbour for twenty years.',
  'A debt collector arrives to claim what her absent brother owes, and decides',
  'the debt is hers now. She has one morning to decide what she will sign.'
].join('\n')

async function main() {
  say('LIVE CHAPTER SMOKE TEST — real pipeline, real model')
  say('='.repeat(78))

  let version = '?'
  try {
    version = (await (await fetch(`${ENDPOINT}/api/version`)).json()).version
  } catch {
    /* reported below */
  }
  const model = await pickModel()
  const lifted = await liftFetchTimeouts()
  say(`endpoint: ${ENDPOINT}`)
  say(`ollama:   ${version}`)
  say(`model:    ${model}`)
  say(`request:  1 chapter · ${SCENES} scene(s) · ${WORDS} words`)
  say(
    `fetch:    ${lifted ? 'undici header/body timeouts lifted' : 'DEFAULT 300s HEADERS TIMEOUT — long calls will fail'}`
  )
  say()

  const { setActivePinia, createPinia } = await import('pinia')
  setActivePinia(createPinia())

  const { useSettingsStore } = await import('../../../src/stores/settingsStore')
  const settings = useSettingsStore()
  settings.ollamaModel = model
  settings.aiProvider = 'ollama'
  settings.aiProviderFallback = 'none'
  settings.localOnly = true

  // --- A real project row, so every DB path the run takes is the real one. ---
  const { createProject } = await import('../../../src/services/db-projects')
  const projectId = await createProject('Chapter smoke test', 'literary crime', SYNOPSIS, null)

  const { useProjectStore } = await import('../../../src/stores/projectStore')
  const { useManuscriptStore } = await import('../../../src/stores/manuscriptStore')
  const { useBranchStore } = await import('../../../src/stores/branchStore')
  const { useStoryBibleStore } = await import('../../../src/stores/storyBibleStore')
  const { useVolumeStore } = await import('../../../src/stores/volumeStore')

  const projectStore = useProjectStore()
  await projectStore.loadProject(projectId)
  projectStore.currentDescription = SYNOPSIS
  projectStore.currentCategory = 'literary crime'

  const branchStore = useBranchStore()
  await branchStore.initForProject(projectId)
  await useManuscriptStore().loadManuscript(projectId)
  await useStoryBibleStore().loadAll(projectId)
  await useVolumeStore().loadVolumes(projectId)

  say(`${stamp()} project ${projectId} ready, branch ${branchStore.activeBranch?.id ?? '(none)'}`)
  say()

  const { useChapterStoryGenerator } =
    await import('../../../src/composables/generation/useChapterStoryGenerator')
  const gen = useChapterStoryGenerator()

  let lastPhase = null
  const phaseLog = []
  const tick = setInterval(() => {
    if (gen.phase.value !== lastPhase) {
      lastPhase = gen.phase.value
      phaseLog.push({ phase: lastPhase, at: Date.now() - started })
      say(`${stamp()} phase → ${lastPhase}   ${gen.progress?.statusText || ''}`)
    }
  }, 1000)

  const failures = []
  let gateReport = null

  try {
    say(`${stamp()} startGeneration… (bootstrapping the cast can take several minutes)`)
    await gen.startGeneration({
      projectId,
      synopsis: SYNOPSIS,
      genre: 'literary crime',
      tone: 'cold, restrained',
      wordTarget: WORDS,
      scenesPerChapter: SCENES,
      auto: false,
      research: null,
      onChunk: () => {}
    })

    // THE claim this whole split exists to make true.
    const planned = gen.scenePlan.value.length
    say()
    say(`${stamp()} plan: ${planned} scene(s), phase ${gen.phase.value}`)
    say(`         run size: ${JSON.stringify(gen.runSize.value)}`)
    for (const s of gen.scenePlan.value) {
      say(
        `         ${s.sceneNumber}. ${s.title}  (~${s.estimatedWords} words, pov ${s.pov || '—'})`
      )
    }
    if (planned !== SCENES) {
      failures.push(`plan returned ${planned} scene(s), expected ${SCENES}`)
    }
    if (gen.runSize.value.scenes !== SCENES) {
      failures.push(`runSize.scenes = ${gen.runSize.value.scenes}, expected ${SCENES}`)
    }

    say()
    say(`${stamp()} confirmPlan… (this is the long part)`)
    await gen.confirmPlan('')

    gateReport = gen.chapterGateReport.value
  } catch (err) {
    failures.push(`run threw: ${err?.message || err}`)
    say()
    say(`${stamp()} ✗ ${err?.stack || err}`)
  } finally {
    clearInterval(tick)
  }

  // --- What actually came back. ---
  const written = gen.writtenScenes.value.filter(Boolean)
  const totalWords = written.reduce(
    (n, s) =>
      n +
      String(s.prose || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
    0
  )

  say()
  say('-'.repeat(78))
  say(`phase:          ${gen.phase.value}`)
  say(`scenes written: ${written.length} of ${gen.scenePlan.value.length}`)
  say(`words:          ${totalWords} raw against a ${WORDS} target`)
  say(`elapsed:        ${((Date.now() - started) / 1000 / 60).toFixed(1)} min`)
  if (gen.error?.value) say(`error:          ${gen.error.value}`)

  for (const s of written) {
    const w = String(s.prose || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length
    say(`  scene ${s.sceneNumber} "${s.title}" — ${w} words, ${s.keyFacts?.length ?? 0} keyFacts`)
  }

  say()
  if (gateReport) {
    const { describeChapterGate } = await import('../../../src/services/generation/chapterGate')
    say(describeChapterGate(gateReport))
  } else {
    say('CHAPTER GATE: no report produced.')
    failures.push('no chapterGateReport')
  }

  // --- The contract this run exists to check. ---
  const checks = [
    ['plan has N scenes', gen.scenePlan.value.length === SCENES],
    ['every planned scene has prose', written.length === gen.scenePlan.value.length],
    ['no scene is empty', written.every((s) => String(s.prose || '').trim().length > 0)],
    ['run reached complete', gen.phase.value === 'complete'],
    ['chapter gate produced a report', !!gateReport],
    ['gate metrics count the real scenes', gateReport?.metrics.sceneCount === SCENES]
  ]

  say()
  say('-'.repeat(78))
  for (const [label, passed] of checks) {
    say(`${ok(passed)} ${label}`)
    if (!passed) failures.push(label)
  }

  const report = {
    ranAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    ollama: version,
    model,
    request: { chapters: 1, scenes: SCENES, words: WORDS },
    elapsedMs: Date.now() - started,
    phaseLog,
    runSize: gen.runSize.value,
    plan: gen.scenePlan.value.map((s) => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      estimatedWords: s.estimatedWords,
      pov: s.pov
    })),
    scenes: written.map((s) => ({
      sceneNumber: s.sceneNumber,
      title: s.title,
      words: String(s.prose || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length,
      keyFacts: s.keyFacts?.length ?? 0,
      prose: s.prose
    })),
    consistencyReport: gen.consistencyReport.value,
    chapterGateReport: gateReport,
    runHealth: typeof gen.runHealth?.summary === 'function' ? gen.runHealth.summary() : null,
    error: gen.error?.value ?? null,
    failures
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  const out = resolve(REPORTS_DIR, 'smoke-chapter.json')
  writeFileSync(out, JSON.stringify(report, null, 2))
  say()
  say(`report: ${out}`)

  if (failures.length) {
    say()
    say(`${failures.length} failure(s): ${failures.join('; ')}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
