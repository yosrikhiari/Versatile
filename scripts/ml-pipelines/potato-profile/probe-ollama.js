/**
 * Live Ollama probe — measures, rather than models.
 *
 * The research behind PLAN-potato-pipeline.md left three questions open that no
 * primary source could settle, and all three are load-bearing for this app:
 *
 *   1. Is a client-set `num_ctx` actually honoured? Ollama's docs never document
 *      the per-request option at all, and ollama#11964 shows a path where both
 *      the client value AND OLLAMA_CONTEXT_LENGTH were ignored.
 *   2. What is the real KV-cache cost of a given num_ctx on THIS machine? No
 *      KV-cache formula survived verification, so we refuse to trust arithmetic.
 *   3. What happens on prompt overflow — truncate, context-shift, or error?
 *
 * This script answers all three against a real server, on real hardware. Where a
 * question cannot be answered it says so rather than guessing.
 *
 * Requires Ollama running. Nothing here writes to the app's data.
 *
 *   npx vite-node scripts/ml-pipelines/potato-profile/probe-ollama.js
 *   npx vite-node scripts/ml-pipelines/potato-profile/probe-ollama.js --model qwen3:8b
 *   npx vite-node scripts/ml-pipelines/potato-profile/probe-ollama.js --endpoint http://host:11434
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORTS_DIR = resolve(__dirname, '..', '..', '..', 'reports')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

// config/ollama.js defaults to '/ollama', a Vite proxy path that only resolves
// in the browser. From node we need the real origin.
const ENDPOINT = arg('endpoint', process.env.OLLAMA_HOST || 'http://localhost:11434')

// Must match config/ollama.js DEFAULT_NUM_CTX. Deliberately not imported: this
// script's job is to test what the app requests, so if the two drift apart the
// report should say so rather than silently follow.
const APP_DEFAULT_NUM_CTX = 16384
const BASELINE_NUM_CTX = 4096 // what Ollama picks itself under 24 GiB VRAM

const say = (s = '') => console.log(s)
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(0)

async function api(path, init) {
  const res = await fetch(`${ENDPOINT}${path}`, init)
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

async function pickModel() {
  const explicit = arg('model', null)
  const { models = [] } = await api('/api/tags')
  const names = models.map((m) => m.name)
  if (!names.length) throw new Error('Ollama has no models pulled. Try: ollama pull qwen3:8b')
  if (explicit) {
    if (!names.includes(explicit)) {
      throw new Error(`Model "${explicit}" not pulled. Available: ${names.join(', ')}`)
    }
    return explicit
  }
  // Prefer the app's default if present, else the first available.
  return names.includes('qwen3:8b') ? 'qwen3:8b' : names[0]
}

/** Unload so the next load is forced to honour (or ignore) our num_ctx afresh. */
async function unload(model) {
  try {
    await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: 0 })
    })
  } catch {
    // Unload is best-effort; a failure here just makes the next reading noisier.
  }
  // Give the runner a moment to actually release.
  await new Promise((r) => setTimeout(r, 1500))
}

/** Load at a given num_ctx and report what /api/ps says was actually allocated. */
async function loadAndMeasure(model, numCtx) {
  await unload(model)
  const gen = await api('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: 'hi',
      stream: false,
      keep_alive: '5m',
      options: { num_ctx: numCtx, num_predict: 1 }
    })
  })
  const ps = await api('/api/ps')
  const entry = (ps.models || []).find((m) => m.name === model || m.model === model)
  return {
    numCtx,
    reportedContext: entry?.context_length ?? null,
    size: entry?.size ?? null,
    sizeVram: entry?.size_vram ?? null,
    promptEvalCount: gen.prompt_eval_count ?? null
  }
}

/**
 * Overflow test.
 *
 * Send a prompt deliberately longer than num_ctx and read `prompt_eval_count` —
 * the number of prompt tokens the server actually evaluated. If that comes back
 * materially lower than what we sent, the server dropped tokens (truncation or
 * a shifting window). If it errors, we learn that instead. Either way this is a
 * measurement, not an inference.
 */
async function overflowTest(model, numCtx) {
  // ~4 chars/token, so aim comfortably past the window.
  const targetTokens = Math.floor(numCtx * 1.5)
  const filler = 'The harbor lights went out one by one. '
  const prompt = filler.repeat(Math.ceil((targetTokens * 4) / filler.length))
  const approxSentTokens = Math.ceil(prompt.length / 4)

  try {
    const gen = await api('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        keep_alive: '5m',
        options: { num_ctx: numCtx, num_predict: 8 }
      })
    })
    return {
      outcome: 'accepted',
      approxSentTokens,
      promptEvalCount: gen.prompt_eval_count ?? null,
      numCtx
    }
  } catch (e) {
    return { outcome: 'error', approxSentTokens, error: String(e.message || e), numCtx }
  }
}

async function main() {
  say('OLLAMA PROBE — measuring what this machine actually does')
  say('='.repeat(78))
  say(`endpoint: ${ENDPOINT}`)

  let version = null
  try {
    version = (await api('/api/version')).version
    say(`version:  ${version}`)
  } catch {
    say('version:  (unavailable)')
  }

  const model = await pickModel()
  say(`model:    ${model}`)
  say()

  // ---- 1. What the model itself declares -------------------------------
  say('1. MODEL SHAPE  (/api/show)')
  say('-'.repeat(78))
  const show = await api('/api/show', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  })
  const info = show.model_info || {}
  const arch = show.details?.family || info['general.architecture'] || '?'
  const pick = (suffix) => {
    const key = Object.keys(info).find((k) => k.endsWith(suffix))
    return key ? info[key] : null
  }
  const trainedCtx = pick('.context_length')
  const blockCount = pick('.block_count')
  const kvHeads = pick('.attention.head_count_kv')
  const keyLength = pick('.attention.key_length')

  say(`  architecture:        ${arch}`)
  say(`  trained context:     ${trainedCtx ?? '(not reported)'}`)
  say(`  block_count:         ${blockCount ?? '(not reported)'}`)
  say(`  head_count_kv:       ${kvHeads ?? '(not reported)'}`)
  say(`  key_length:          ${keyLength ?? '(not reported)'}`)
  say(`  quantization:        ${show.details?.quantization_level || '?'}`)
  say()
  if (trainedCtx && APP_DEFAULT_NUM_CTX > trainedCtx) {
    say(`  ⚠ The app requests num_ctx=${APP_DEFAULT_NUM_CTX} but this model was trained`)
    say(`    for ${trainedCtx}. Requesting beyond the trained context is not free.`)
    say()
  }

  // ---- 2. Is num_ctx honoured? -----------------------------------------
  say('2. IS A CLIENT-SET num_ctx HONOURED?')
  say('-'.repeat(78))
  say('  Loading twice at different num_ctx and comparing allocation.')
  say('  If the numbers are identical, the request was ignored.')
  say()

  const low = await loadAndMeasure(model, BASELINE_NUM_CTX)
  const high = await loadAndMeasure(model, APP_DEFAULT_NUM_CTX)

  const row = (r) =>
    `  num_ctx ${String(r.numCtx).padStart(6)}  →  ps.context_length=${String(r.reportedContext ?? '?').padStart(6)}  size=${String(r.size ? mb(r.size) + 'MB' : '?').padStart(8)}  vram=${String(r.sizeVram ? mb(r.sizeVram) + 'MB' : '?').padStart(8)}`
  say(row(low))
  say(row(high))
  say()

  let verdict
  if (low.reportedContext != null && high.reportedContext != null) {
    if (high.reportedContext === APP_DEFAULT_NUM_CTX && low.reportedContext === BASELINE_NUM_CTX) {
      verdict = 'HONOURED — /api/ps reports back exactly what we asked for.'
    } else if (high.reportedContext === low.reportedContext) {
      verdict = `IGNORED — both loads report context_length=${high.reportedContext}. The app's num_ctx is not taking effect. See ollama#11964; consider pinning OLLAMA_CONTEXT_LENGTH server-side.`
    } else {
      verdict = `PARTIAL — asked ${BASELINE_NUM_CTX}/${APP_DEFAULT_NUM_CTX}, got ${low.reportedContext}/${high.reportedContext}. Something is rewriting the request (NUM_PARALLEL multiplies context — check it).`
    }
  } else if (low.size && high.size) {
    const delta = high.size - low.size
    verdict =
      delta > 1024 * 1024
        ? `LIKELY HONOURED — context_length not reported, but allocation grew ${mb(delta)}MB between the two loads, which only makes sense if num_ctx took effect.`
        : `LIKELY IGNORED — context_length not reported and allocation barely moved (${mb(delta)}MB) despite a ${APP_DEFAULT_NUM_CTX - BASELINE_NUM_CTX}-token difference.`
  } else {
    verdict = 'UNDETERMINED — /api/ps reported neither context_length nor size.'
  }
  say(`  VERDICT: ${verdict}`)
  say()

  // ---- 3. Real KV cost, measured ---------------------------------------
  say('3. WHAT DID THE EXTRA CONTEXT ACTUALLY COST?')
  say('-'.repeat(78))
  if (low.size && high.size) {
    const delta = high.size - low.size
    const extraTokens = APP_DEFAULT_NUM_CTX - BASELINE_NUM_CTX
    say(`  ${BASELINE_NUM_CTX} → ${APP_DEFAULT_NUM_CTX} tokens cost ${mb(delta)} MB`)
    say(`  ≈ ${(delta / extraTokens / 1024).toFixed(1)} KB per token of context`)
    say()
    say(`  Extrapolated (measured, not a formula):`)
    for (const ctx of [8192, 16384, 32768, 65536]) {
      const est = low.size + (delta / extraTokens) * (ctx - BASELINE_NUM_CTX)
      say(`    num_ctx ${String(ctx).padStart(6)}  ≈  ${mb(est).padStart(6)} MB total resident`)
    }
  } else {
    say('  /api/ps did not report size — cannot measure. No formula substituted.')
  }
  say()

  // ---- 4. Overflow behaviour -------------------------------------------
  say('4. WHAT HAPPENS ON PROMPT OVERFLOW?')
  say('-'.repeat(78))
  say(`  Sending ~1.5x num_ctx and reading prompt_eval_count.`)
  say()
  const of = await overflowTest(model, BASELINE_NUM_CTX)
  if (of.outcome === 'error') {
    say(`  OUTCOME: ERROR — the server rejected it.`)
    say(`    ${of.error}`)
    say(`  → Overflow is loud. Good: it cannot silently degrade quality.`)
  } else {
    say(`  sent ~${of.approxSentTokens} tokens at num_ctx=${of.numCtx}`)
    say(`  server evaluated: ${of.promptEvalCount ?? '(not reported)'}`)
    if (of.promptEvalCount != null) {
      if (of.promptEvalCount < of.approxSentTokens * 0.9) {
        say()
        say(`  OUTCOME: DROPPED — the server evaluated far fewer tokens than we sent.`)
        say(`  → Overflow is SILENT. No error surfaces; context is simply lost.`)
        say(`    This is the failure mode the plan is built around.`)
      } else {
        say()
        say(`  OUTCOME: FULLY EVALUATED — everything we sent was processed.`)
        say(`  → The server grew the window or ignored num_ctx. Cross-check §2.`)
      }
    }
  }
  say()

  const report = {
    generatedBy: 'probe-ollama',
    endpoint: ENDPOINT,
    ollamaVersion: version,
    model,
    modelShape: { arch, trainedCtx, blockCount, kvHeads, keyLength },
    numCtxHonoured: verdict,
    loads: { low, high },
    overflow: of
  }
  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true })
  writeFileSync(resolve(REPORTS_DIR, 'ollama-probe.json'), JSON.stringify(report, null, 2))
  say(`Wrote reports/ollama-probe.json`)
}

main().catch((e) => {
  say()
  say(`PROBE FAILED: ${e.message}`)
  say()
  say(`Is Ollama running? Try:  curl ${ENDPOINT}/api/tags`)
  say(`Override the endpoint:   --endpoint http://host:11434`)
  process.exitCode = 1
})
