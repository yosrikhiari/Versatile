/**
 * Deep verification of the two generation aspects the demo seeder bypasses and
 * the earlier checks didn't cover: real EMBEDDINGS (needed for semantic search /
 * scene-writer multi-hop retrieval) and real SCENE PROSE generation (the writer's
 * structured scene call). Exercises the live Ollama embed + chat models.
 *
 * Run: npm run verify:deep
 *      VERIFY_MODEL=qwen3:8b VERIFY_EMBED=snowflake-arctic-embed2 npm run verify:deep
 */

import 'fake-indexeddb/auto'
import http from 'node:http'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
}
globalThis.localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

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

const { getEmbedding } = await import('../src/services/embeddingService.ts')
const { generateStructured } = await import('../src/services/providers/ollama.ts')

const MODEL = process.env.VERIFY_MODEL || 'qwen3:8b'
const EMBED = process.env.VERIFY_EMBED || 'snowflake-arctic-embed2'
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

console.log(`Warming up ${MODEL} and ${EMBED}...`)
await warmUp(MODEL)
await warmUp(EMBED)

// ---- 1) Real embeddings ----
{
  const t0 = Date.now()
  let vec = null
  try {
    vec = await getEmbedding('The lighthouse keeper watched the light fail over the cove.', {
      provider: 'ollama',
      model: EMBED
    })
  } catch (err) {
    console.log('      embedding error:', err && err.message ? err.message : JSON.stringify(err))
  }
  const ms = Date.now() - t0
  check('embedding returned a vector', !!vec && vec.length > 0, vec ? `${vec.length}-dim` : 'null')
  if (vec) {
    const nonZero = vec.some((x) => x !== 0)
    check('embedding is not a zero vector', nonZero, `${vec.slice(0, 3).map((n) => n.toFixed(3)).join(', ')}…`)
    // snowflake-arctic-embed2 → 1024 dims; nomic-embed-text → 768.
    check('embedding dimension matches the chosen model', vec.length === 1024 || vec.length === 768, `${vec.length}`)
  }
  console.log(`      (${ms}ms)`)
}

// ---- 2) Real scene prose generation ----
{
  const sceneSchema = {
    type: 'object',
    properties: {
      prose: { type: 'string' },
      summary: { type: 'string' },
      charactersPresent: { type: 'array', items: { type: 'string' } },
      location: { type: 'string' },
      keyFacts: { type: 'array', items: { type: 'string' } }
    },
    required: ['prose']
  }
  const SYSTEM = `You are a novelist writing a single scene of a gothic fantasy. Return ONLY JSON:
{ "prose": "2-3 paragraphs of scene prose", "summary": "one line", "charactersPresent": [names], "location": "name", "keyFacts": [facts] }.`
  const USER = `Write the scene "The Darkened Lamp", chapter 1 of a lighthouse saga. Captain Halden and his apprentice Mira are in The Lighthouse when the lamp fails. Keep it under 200 words.`

  const t0 = Date.now()
  let data = {}
  let usage = { completionTokens: 0 }
  try {
    const res = await generateStructured(USER, SYSTEM, MODEL, sceneSchema, {
      maxTokens: 700,
      idleTimeout: 90000,
      firstTokenTimeout: 300000
    })
    data = res.data
    usage = res.usage
  } catch (err) {
    console.log('      scene error:', err && err.message ? err.message : JSON.stringify(err))
  }
  const ms = Date.now() - t0

  check('scene prose is generated', typeof data.prose === 'string' && data.prose.length > 80, `${data.prose?.length || 0} chars`)
  check('scene carries characters present', Array.isArray(data.charactersPresent) && data.charactersPresent.length > 0, (data.charactersPresent || []).join(', '))
  check('scene names a location', !!data.location, data.location || '')
  check('scene carries key facts', Array.isArray(data.keyFacts) && data.keyFacts.length > 0, `${(data.keyFacts || []).length} facts`)
  check('scene call stays within its token budget', usage.completionTokens < 700, `${usage.completionTokens} of 700`)
  console.log(`      (${ms / 1000}s, ${usage.completionTokens} completion tokens)`)
  console.log('      prose:\n' + (data.prose || '').split('\n').map((l) => '        ' + l).join('\n'))
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed')
process.exit(failures ? 1 : 0)
