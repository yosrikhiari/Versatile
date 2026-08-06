/**
 * Live probe of a 10-volume / 6,000-words-per-chapter run against real Ollama.
 *
 * `src/tests/unit/tenVolumeScale.test.js` proves the plan's SHAPE at this scale
 * with a mocked provider. This measures the two things a mock cannot: whether a
 * 2,000-word scene call actually comes back at 2,000 words on this machine's
 * model, and what the full run would therefore cost in wall-clock.
 *
 * Run with: npx vite-node scripts/verify-ten-volume-scale.mjs
 */
import http from 'node:http'

// Minimal localStorage so config/ollama and the throughput store work in node.
const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
}
globalThis.localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

const { generate } = await import('../src/services/providers/ollama.ts')
const { estimateRun, formatDuration } = await import('../src/services/generationEstimate.ts')

const MODEL = process.env.VERIFY_MODEL || 'dolphin-mistral:7b'

const VOLUMES = 10
const CHAPTERS_PER_VOLUME = 10
const WORDS_PER_CHAPTER = 6000
const SCENES_PER_CHAPTER = 3
const TOTAL_CHAPTERS = VOLUMES * CHAPTERS_PER_VOLUME
const TOTAL_SCENES = TOTAL_CHAPTERS * SCENES_PER_CHAPTER
const TOTAL_WORDS = TOTAL_CHAPTERS * WORDS_PER_CHAPTER
const PER_SCENE_WORDS = WORDS_PER_CHAPTER / SCENES_PER_CHAPTER

/**
 * Node's undici applies a 300s headers timeout that browsers do not, and a cold
 * model load on a small GPU can exceed it before the first byte — a property of
 * this harness, not of the app. `node:http` has no such default, so the warm-up
 * absorbs the load and the timed call then measures generation.
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

const countWords = (s) => (s.trim().match(/\S+/g) || []).length

console.log(`Model: ${MODEL}`)
console.log(
  `Target shape: ${VOLUMES} volumes x ${CHAPTERS_PER_VOLUME} chapters x ${WORDS_PER_CHAPTER} words`
)
console.log(
  `= ${TOTAL_CHAPTERS} chapters, ${TOTAL_SCENES} scenes, ${TOTAL_WORDS.toLocaleString()} words\n`
)

console.log('Warming up...')
await warmUp(MODEL)

// The exact target and token cap useStoryWriter would use for one scene of a
// 6,000-word chapter split three ways.
const maxTokens = Math.max(2000, Math.min(4500, Math.ceil(PER_SCENE_WORDS * 1.8) + 800))
const prompt = `Write scene 1: "The Second Body"

SCENE BRIEF:
- Emotional goal: dread curdling into certainty
- What changes: Ines confirms the drowned man is the same one she logged last month
- Obstacle: the harbourmaster's records have been altered
- Location: the night dock, low tide
- Characters present: Ines Valente, Harbourmaster Ferro

The scene MUST be at least ${PER_SCENE_WORDS} words. Do not end the scene early. If you are below the word count, continue writing until you reach it.

Write the scene now as prose. Output ONLY the scene text — no JSON, no headings, no preamble, no notes. Start with the first sentence of the scene.`

const t0 = Date.now()
const { text, usage } = await generate(
  prompt,
  'You are a novelist writing bleak literary thrillers.',
  MODEL,
  { maxTokens, idleTimeout: 90000, firstTokenTimeout: 300000 }
)
const ms = Date.now() - t0
const words = countWords(text)
const rate = usage.completionTokens / (ms / 1000)

console.log(`\n--- one scene, target ${PER_SCENE_WORDS} words, cap ${maxTokens} tokens ---`)
console.log(`words produced : ${words}  (${((words / PER_SCENE_WORDS) * 100).toFixed(0)}% of target)`)
console.log(`tokens         : ${usage.completionTokens} of ${maxTokens}`)
console.log(`elapsed        : ${(ms / 1000).toFixed(1)}s   (${rate.toFixed(2)} tok/s)`)
console.log(
  `hit cap?       : ${usage.completionTokens >= maxTokens - 5 ? 'YES — truncated by num_predict' : 'no — model stopped on its own'}`
)
console.log(
  `>= 85% target? : ${words >= PER_SCENE_WORDS * 0.85 ? 'yes' : 'NO — extendToTarget continuation passes would be needed'}`
)

const est = estimateRun({
  totalWords: TOTAL_WORDS,
  scenes: TOTAL_SCENES,
  chapters: TOTAL_CHAPTERS,
  model: MODEL
})
console.log(`\n--- full 10-volume run, at this machine's measured rate ---`)
console.log(
  `throughput     : ${est.tokensPerSecond.toFixed(2)} tok/s (${est.measured ? `measured, ${est.samples} sample(s)` : 'default guess'})`
)
console.log(`estimated time : ${formatDuration(est.ms)}  (${(est.ms / 3_600_000).toFixed(1)} hours)`)

// Naive extrapolation from the one real scene — prose only, excluding planning,
// spine, metadata and critique passes.
const proseOnlyHours = ((ms / 1000) * TOTAL_SCENES) / 3600
console.log(
  `prose-only from this measured scene: ${proseOnlyHours.toFixed(1)} hours across ${TOTAL_SCENES} scenes`
)
