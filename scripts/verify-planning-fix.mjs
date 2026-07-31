/**
 * End-to-end check of the planning path against a REAL Ollama.
 *
 * The unit tests mock fetch, so they prove the logic but not that Ollama honours
 * a bounded `format` schema while streaming — which is the assumption the whole
 * timeout fix rests on. Run with: npx vite-node scripts/verify-planning-fix.mjs
 */

// Node's undici applies a 300s headers timeout that browsers do not have, and
// swapping models on a small GPU can exceed it before the first byte. Disable it
// so this harness measures Ollama, not undici.
import http from 'node:http'

/**
 * Load the model before the timed checks.
 *
 * Node's fetch (undici) enforces a 300s headers timeout that browsers do not,
 * and on a GPU too small to hold two models a cold load can exceed it before the
 * first byte — a property of this harness, not of the app. `node:http` has no
 * such default, so the warm-up absorbs the load and the checks then measure
 * generation.
 */
function warmUp(model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      prompt: 'hi',
      stream: false,
      think: false,
      options: { num_predict: 1 }
    })
    const req = http.request(
      {
        hostname: 'localhost',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      },
      (res) => {
        res.resume()
        res.on('end', resolve)
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

// Minimal localStorage so config/ollama and the throughput store work in node.
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
}
globalThis.localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

const { generate, generateStructured } = await import('../src/services/providers/ollama.ts')
const { getThroughput } = await import('../src/services/generationEstimate.ts')
const { repairTruncatedJson } = await import('../src/services/ai/aiHelpers.ts')

const MODEL = process.env.VERIFY_MODEL || 'phi4-mini:3.8b'
let failures = 0

console.log(`Warming up ${MODEL}...`)
await warmUp(MODEL)

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

// 1) Streaming generate returns text AND real usage counts.
{
  const t0 = Date.now()
  let chunks = 0
  const { text, usage } = await generate(
    'Reply with exactly: ready',
    'You are terse.',
    MODEL,
    { maxTokens: 40, idleTimeout: 60000, firstTokenTimeout: 120000 }
  )
  const ms = Date.now() - t0
  check('streaming generate returns text', text.length > 0, JSON.stringify(text.slice(0, 40)))
  check('usage counts are captured from the stream', usage.completionTokens > 0, JSON.stringify(usage))
  console.log(`      (${ms}ms)`)
  void chunks
}

// 2) The planning call: a BOUNDED schema must terminate on its own, quickly.
//    This is the exact shape that used to run to num_predict and time out.
{
  const schema = {
    type: 'object',
    properties: {
      chapters: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            chapterNumber: { type: 'number' },
            title: { type: 'string' },
            hookEnding: { type: 'string' }
          },
          required: ['title']
        }
      }
    },
    required: ['chapters']
  }

  const t0 = Date.now()
  const { data, usage } = await generateStructured(
    'Plan the chapter skeleton for a story about a lighthouse keeper who finds a body. Exactly 3 chapters.',
    'You are a story architect. Return only JSON.',
    MODEL,
    schema,
    { maxTokens: 3 * 170, idleTimeout: 90000, firstTokenTimeout: 300000 }
  )
  const ms = Date.now() - t0

  check('bounded schema yields exactly the requested chapter count',
    Array.isArray(data.chapters) && data.chapters.length === 3,
    `got ${data.chapters?.length}`)
  check('planning call terminates well inside the old 240s cap', ms < 240000, `${(ms / 1000).toFixed(1)}s`)
  check('planning call did not exhaust its token budget', usage.completionTokens < 3 * 170,
    `${usage.completionTokens} of ${3 * 170}`)
  console.log(`      titles: ${(data.chapters || []).map((c) => c.title).join(' | ')}`)
}

// 3) Throughput was learned from the real calls.
{
  const rec = getThroughput(MODEL)
  check('throughput recorded from real generations', !!rec && rec.tokensPerSecond > 0,
    rec ? `${rec.tokensPerSecond.toFixed(2)} tok/s over ${rec.samples} samples` : 'none')
}

// 4) Salvage works on genuinely truncated model output.
{
  const truncated = '{"chapters":[{"chapterNumber":1,"title":"The Light"},{"chapterNumber":2,"tit'
  const repaired = repairTruncatedJson(truncated)
  check('truncated planning output is salvaged, not discarded',
    repaired?.chapters?.length === 1 && repaired.chapters[0].title === 'The Light',
    JSON.stringify(repaired))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
