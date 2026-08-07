/**
 * Before/after check on chapter-title variety against a REAL Ollama.
 *
 * The reported symptom: across a 100-chapter run, "Echoes of Betrayal" appeared
 * eight times and dozens more titles were structural clones — "Echoes of X",
 * "Whispers in the Y", "Veil of Z". The cause was that planChunked generated the
 * skeleton in batches of 12 and never told a batch what earlier batches had
 * already named, so nine independent calls sampled the same distribution.
 *
 * Unit tests prove the ledger reaches the prompt. Only a real model can prove
 * that changes the output, so this runs the SAME two batches twice — once with
 * the title block suppressed (the old behaviour) and once with it — and reports
 * exact duplicates and the shape histogram for each.
 *
 * Both halves call buildSkeletonPrompt/makeSkeletonSchema from the app, so the
 * comparison exercises what ships rather than a copy that can drift.
 *
 * Run: npm run verify:titles   (VERIFY_MODEL=phi4-mini:3.8b for a smaller one,
 *                               VERIFY_CHAPTERS=36 for a longer sample)
 */

import http from 'node:http'

const mem = new Map()
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear()
}
globalThis.localStorage.setItem('versatile_ollama_endpoint', 'http://localhost:11434')

/**
 * Load the model at the SAME num_ctx the real calls use.
 *
 * Node's fetch has a 300s headers timeout browsers lack, and warming up without
 * num_ctx is worse than not warming up at all: Ollama loads the model at its own
 * small default, then the first real call arrives asking for 16k and Ollama
 * unloads and reloads to honour it. That reload happens before a single response
 * header is sent, so undici kills the request mid-load and the harness reports a
 * fetch failure that has nothing to do with what it is measuring.
 */
function warmUp(model, numCtx) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      prompt: 'hi',
      stream: false,
      think: false,
      options: { num_predict: 1, num_ctx: numCtx }
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

const { generateStructured } = await import('../src/services/providers/ollama.ts')
const { getOllamaNumCtx } = await import('../src/config/ollama.ts')
const {
  buildSkeletonPrompt,
  buildTitleVarietyBlock,
  makeSkeletonSchema,
  assembleTitle,
  titleShape,
  overusedShapes,
  SKELETON_BATCH_SIZE,
  TOKENS_PER_CHAPTER_STUB,
  STORY_ARC_TOKENS,
  SHAPE_BUDGET
} = await import('../src/composables/useStoryDirector.ts')

const MODEL = process.env.VERIFY_MODEL || 'qwen3:8b'
const TOTAL = Number(process.env.VERIFY_CHAPTERS || SKELETON_BATCH_SIZE * 2)

// The reported project, so the before-half should reproduce the reported titles.
const GOAL = {
  premise:
    'A betrayed king is stripped of his throne and his memory, and claws his way back through a court of mind-weavers who can rewrite what he believes he did.',
  genre: 'Dark Fantasy',
  tone: 'Grim, brutal, psychological'
}

const SYSTEM_PROMPT = `You are a story architect planning a full-length novel. Keep JSON output only with two fields: "chapters" (array) and "storyArc" (object).
The novel spans multiple chapters across a three-act or multi-part structure.`

/**
 * The pre-fix prompt and schema, reproduced verbatim.
 *
 * The first run of this harness built its baseline by calling the CURRENT
 * buildSkeletonPrompt with an empty titleBlock. That is not the old behaviour:
 * the current prompt and schema carry `partOf`/`partNumber`, so suppressing only
 * the instructions left the model staring at two unexplained fields. It filled
 * them mechanically and returned "Act I: The Descent, Part 1" four times running
 * — a degenerate collapse the real pre-fix code never produced. Measuring
 * against that inflates the improvement.
 *
 * Reproducing removed behaviour necessarily means a local copy; there is no
 * shipping code left to call. Kept adjacent to the real builder so the two can
 * be diffed by eye.
 */
function legacySkeletonPrompt({ goal, N, batchStart, batchCount, prevHook, needArc }) {
  return `Plan the chapter skeleton for this story.
PREMISE: "${goal.premise}"
GENRE: ${goal.genre || 'Standard'}
TONE: ${goal.tone || 'Standard'}

Produce EXACTLY ${batchCount} chapters, numbered ${batchStart + 1} through ${batchStart + batchCount}, forming part of ONE continuous arc across ${N} total chapters. Each chapter's "hookEnding" must set up the next chapter.
${prevHook ? `The PREVIOUS chapter (#${batchStart}) ended on: "${prevHook}". Chapter ${batchStart + 1} must follow directly from that.` : 'This batch opens the story.'}
Return ONLY JSON, no markdown:
{
  ${needArc ? '"storyArc": { "premise": "", "genre": "", "tone": "", "centralConflict": "", "emotionalJourney": "", "resolution": "" },\n  ' : ''}"chapters": [ { "chapterNumber": ${batchStart + 1}, "title": "", "goal": "", "arcPosition": "", "emotionalTarget": "", "hookEnding": "" } ]
}`
}

/** The pre-fix chapter item: no partOf, no partNumber. */
function legacySkeletonSchema(batchCount) {
  return {
    type: 'object',
    properties: {
      storyArc: {
        type: 'object',
        properties: {
          premise: { type: 'string' },
          genre: { type: 'string' },
          tone: { type: 'string' },
          centralConflict: { type: 'string' },
          emotionalJourney: { type: 'string' },
          resolution: { type: 'string' }
        }
      },
      chapters: {
        type: 'array',
        minItems: batchCount,
        maxItems: batchCount,
        items: {
          type: 'object',
          properties: {
            chapterNumber: { type: 'number' },
            title: { type: 'string' },
            goal: { type: 'string' },
            arcPosition: { type: 'string' },
            emotionalTarget: { type: 'string' },
            hookEnding: { type: 'string' }
          },
          required: ['title']
        }
      }
    },
    required: ['chapters']
  }
}

/** Run every batch of one condition, threading hooks the way planChunked does. */
async function runCondition({ label, withTitleBlock }) {
  const titles = []
  let prevHook = ''
  let elapsed = 0

  while (titles.length < TOTAL) {
    const batchStart = titles.length
    const batchCount = Math.min(SKELETON_BATCH_SIZE, TOTAL - batchStart)
    const needArc = batchStart === 0

    // BEFORE runs the genuine pre-fix prompt AND schema; AFTER runs the shipping
    // ones. Anything less than both makes the comparison a strawman.
    const args = { goal: GOAL, N: TOTAL, batchStart, batchCount, prevHook, needArc }
    const prompt = withTitleBlock
      ? buildSkeletonPrompt({
          ...args,
          titleBlock: buildTitleVarietyBlock(titles, GOAL.genre, GOAL.tone)
        })
      : legacySkeletonPrompt(args)
    const schema = withTitleBlock
      ? makeSkeletonSchema(batchCount)
      : legacySkeletonSchema(batchCount)

    const t0 = Date.now()
    const { data } = await generateStructured(
      prompt,
      SYSTEM_PROMPT,
      MODEL,
      schema,
      {
        maxTokens: batchCount * TOKENS_PER_CHAPTER_STUB + (needArc ? STORY_ARC_TOKENS : 0),
        idleTimeout: 420_000,
        firstTokenTimeout: 480_000,
        // The fix is prompt-side AND sampling-side, so the two halves must
        // differ in both or the comparison misattributes the result. BEFORE
        // leaves these unset, which is what the shipped code did: the global
        // defaults applied (repeat_last_n=512, top_p=0.9, min_p=0.05), and a
        // 512-token window covers under three chapters of this batch.
        ...(withTitleBlock ? { repeatLastN: -1, topP: 0.95, minP: 0.02 } : {})
      }
    )
    elapsed += Date.now() - t0

    const batch = Array.isArray(data?.chapters) ? data.chapters : []
    for (let k = 0; k < batchCount; k++) {
      const raw = batch[k] || {}
      titles.push(assembleTitle(raw, batchStart + k + 1))
      if (raw.hookEnding) prevHook = raw.hookEnding
    }
    process.stdout.write(`  ${label}: ${titles.length}/${TOTAL} chapters\n`)
  }

  return { titles, seconds: Math.round(elapsed / 1000) }
}

function score(titles) {
  const seen = new Map()
  for (const t of titles) {
    const key = t.trim().toLowerCase()
    seen.set(key, (seen.get(key) || 0) + 1)
  }
  const repeats = [...seen.entries()].filter(([, n]) => n > 1)
  const duplicateTitles = repeats.reduce((sum, [, n]) => sum + n - 1, 0)

  const shapes = new Map()
  for (const t of titles) {
    const s = titleShape(t)
    shapes.set(s, (shapes.get(s) || 0) + 1)
  }
  const sorted = [...shapes.entries()].sort((a, b) => b[1] - a[1])
  return {
    duplicateTitles,
    repeats,
    distinctShapes: shapes.size,
    topShare: sorted.length ? sorted[0][1] / titles.length : 0,
    sorted,
    overused: overusedShapes(titles)
  }
}

function report(label, titles, seconds) {
  const s = score(titles)
  console.log(`\n${'='.repeat(66)}\n${label}  (${titles.length} chapters, ${seconds}s)\n${'='.repeat(66)}`)
  titles.forEach((t, i) => console.log(`  ${String(i + 1).padStart(3)}. ${t}`))
  console.log(`\n  exact duplicate titles : ${s.duplicateTitles}`)
  if (s.repeats.length) {
    for (const [title, n] of s.repeats) console.log(`      "${title}" x${n}`)
  }
  console.log(`  distinct shapes        : ${s.distinctShapes}`)
  console.log(`  largest shape share    : ${Math.round(s.topShare * 100)}%`)
  console.log(`  shape histogram        : ${s.sorted.map(([k, n]) => `${k}=${n}`).join('  ')}`)
  console.log(`  shapes over budget (${SHAPE_BUDGET}) : ${s.overused.join(', ') || '(none)'}`)
  return s
}

const NUM_CTX = getOllamaNumCtx()
console.log(`Model: ${MODEL}   Chapters: ${TOTAL}   Batch size: ${SKELETON_BATCH_SIZE}   num_ctx: ${NUM_CTX}`)
console.log('Warming up (at the real num_ctx, so the first real call does not trigger a reload)...')
await warmUp(MODEL, NUM_CTX)

console.log('\nRunning BEFORE (no title context — the shipped behaviour prior to this fix)...')
const before = await runCondition({ label: 'before', withTitleBlock: false })

console.log('\nRunning AFTER (title ledger + shape budget + style palette)...')
const after = await runCondition({ label: 'after', withTitleBlock: true })

const b = report('BEFORE', before.titles, before.seconds)
const a = report('AFTER', after.titles, after.seconds)

console.log(`\n${'='.repeat(66)}\nVERDICT\n${'='.repeat(66)}`)
let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

check('after has no exact duplicate titles', a.duplicateTitles === 0, `${a.duplicateTitles} found`)
check(
  'after uses at least as many distinct shapes as before',
  a.distinctShapes >= b.distinctShapes,
  `${b.distinctShapes} -> ${a.distinctShapes}`
)
check(
  'no single shape dominates after',
  a.topShare <= 0.5,
  `${Math.round(b.topShare * 100)}% -> ${Math.round(a.topShare * 100)}%`
)

// A model can ignore instructions; that is a finding about the model, not a
// crash. Exit non-zero so CI or a human notices, but print everything first.
console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
