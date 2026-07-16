/**
 * Fit a prompt to a real context window by deciding what to drop.
 *
 * WHY THIS EXISTS
 *
 * Ollama silently discards what does not fit. Measured on a real server
 * (scripts/ml-pipelines/potato-profile/probe-ollama.js, 2026-07-16): ~6,153
 * tokens sent at num_ctx=4096, **2,050 evaluated**, no error, no warning. Not
 * even truncation to the limit — roughly a third survived.
 *
 * So something is already choosing what to drop. Today that something is the
 * server, and it makes the worst possible choice, because of where things sit in
 * the prompt: the story bible and spine are at the FRONT (highest value, dropped
 * first) and the JSON output instructions are at the END (lowest value, always
 * survive). The model loses the story and keeps the formatting rules.
 *
 * This module moves that decision into code, where it can be ranked, bounded,
 * tested, and — critically — REPORTED. The shift is not "make it fit". It is
 * "decide what to drop instead of letting the model decide silently".
 *
 * WHY NOT shaping/tokenBudget.js
 *
 * That one evicts the LARGEST block (it sorts by length and pops). The story
 * bible is usually both the largest and the most valuable, so size-ordering
 * actively selects the worst victim. It is also char-based, and only reachable
 * from entity generation. Left alone; this is a different policy.
 */

/**
 * Tokens per character, by content shape.
 *
 * The app estimates `chars / 4` everywhere (useStoryDocuments.js:32,
 * documentChunker.js:304, spine.js:44). That is tuned for English prose and is
 * badly wrong for JSON, where every `{`, `"`, `:`, `,` and indent run tends to
 * cost its own token — measured at ~2.6 chars/token against ~4.0 for prose (see
 * profile-prompts.js). Using one rate for both under-counts the entity blob by
 * up to ~46%, i.e. the budget was least trustworthy exactly where it mattered.
 *
 * These are still estimates. There is no tokenizer in the repo; when one lands,
 * replace `estimateTokens` and nothing else has to change.
 */
const CHARS_PER_TOKEN = {
  prose: 4.0,
  json: 2.6
}

export function estimateTokens(text, kind = 'prose') {
  if (!text) return 0
  const rate = CHARS_PER_TOKEN[kind] || CHARS_PER_TOKEN.prose
  return Math.ceil(text.length / rate)
}

/**
 * Trim to a token count without slicing mid-sentence where avoidable.
 */
function trimToTokens(text, maxTokens, kind) {
  if (maxTokens <= 0) return ''
  const rate = CHARS_PER_TOKEN[kind] || CHARS_PER_TOKEN.prose
  const maxChars = Math.floor(maxTokens * rate)
  if (text.length <= maxChars) return text

  const cut = text.slice(0, maxChars)
  // Prefer a clean break, but only if we aren't throwing away most of the
  // allowance to get one.
  const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'))
  return boundary > maxChars * 0.5 ? cut.slice(0, boundary + 1) : cut
}

/**
 * @typedef {object} Block
 * @property {string} name      Stable identifier, used in the dropped report.
 * @property {string} text      The content.
 * @property {number} priority  Higher survives longer. Ties break by input order.
 * @property {'prose'|'json'} [kind='prose']  Drives the token estimate.
 * @property {boolean} [required=false]  Never dropped. Truncated only as a last
 *   resort, and reported when that happens.
 * @property {number} [minTokens]  If set, the block is shrunk to this before
 *   being considered for dropping — "degrade, don't delete". Use for blocks
 *   where a little is much better than nothing (the story bible, the spine).
 */

/**
 * Fit ranked blocks into a token budget.
 *
 * Order of operations, cheapest sacrifice first:
 *   1. If everything fits, change nothing.
 *   2. Degrade shrinkable blocks (lowest priority first) down to minTokens.
 *   3. Drop optional blocks entirely (lowest priority first).
 *   4. If required blocks alone still overflow, truncate them proportionally and
 *      flag `fits: false` — a bad outcome, but a VISIBLE one, which is the whole
 *      point. The alternative is the server doing it silently.
 *
 * Blocks are emitted in their original order regardless of priority: priority
 * governs survival, not position. Position is the caller's business.
 *
 * @param {Block[]} blocks
 * @param {number} budgetTokens
 * @returns {{ blocks: Block[], text: string, usedTokens: number, budgetTokens: number,
 *             dropped: Array<{name:string,tokens:number}>,
 *             degraded: Array<{name:string,from:number,to:number}>,
 *             fits: boolean }}
 */
export function fitToBudget(blocks, budgetTokens, options = {}) {
  const separator = options.separator ?? '\n\n'
  const sepTokens = estimateTokens(separator)

  const working = blocks
    .filter((b) => b && b.text)
    .map((b, i) => ({
      name: b.name,
      text: b.text,
      kind: b.kind || 'prose',
      priority: b.priority ?? 0,
      required: !!b.required,
      minTokens: b.minTokens,
      order: i,
      tokens: estimateTokens(b.text, b.kind || 'prose')
    }))

  const dropped = []
  const degraded = []

  const total = () =>
    working.reduce((sum, b) => sum + b.tokens, 0) + Math.max(0, working.length - 1) * sepTokens

  // Lowest value first; stable within a priority.
  const sacrificeOrder = () =>
    [...working].sort((a, b) => a.priority - b.priority || a.order - b.order)

  // 2. Degrade before dropping.
  for (const block of sacrificeOrder()) {
    if (total() <= budgetTokens) break
    if (block.minTokens === undefined || block.tokens <= block.minTokens) continue
    const over = total() - budgetTokens
    const target = Math.max(block.minTokens, block.tokens - over)
    if (target >= block.tokens) continue
    const before = block.tokens
    block.text = trimToTokens(block.text, target, block.kind)
    block.tokens = estimateTokens(block.text, block.kind)
    degraded.push({ name: block.name, from: before, to: block.tokens })
  }

  // 3. Drop optional blocks, lowest value first.
  for (const block of sacrificeOrder()) {
    if (total() <= budgetTokens) break
    if (block.required) continue
    // Never drop the last block standing. Because we sacrifice lowest-priority
    // first, the survivor is by construction the most valuable one — emptying
    // the prompt to satisfy the budget would be obeying the letter of the
    // constraint while defeating its purpose. Step 4 truncates it instead.
    if (working.length <= 1) break
    const idx = working.indexOf(block)
    if (idx === -1) continue
    working.splice(idx, 1)
    dropped.push({ name: block.name, tokens: block.tokens })
  }

  // 4. Last resort: the required set alone does not fit.
  let fits = total() <= budgetTokens
  if (!fits && working.length) {
    const overflow = total() - budgetTokens
    const shrinkable = working.reduce((sum, b) => sum + b.tokens, 0)
    if (shrinkable > 0) {
      for (const block of working) {
        const share = block.tokens / shrinkable
        const target = Math.max(1, Math.floor(block.tokens - overflow * share))
        const before = block.tokens
        block.text = trimToTokens(block.text, target, block.kind)
        block.tokens = estimateTokens(block.text, block.kind)
        if (block.tokens < before)
          degraded.push({ name: block.name, from: before, to: block.tokens })
      }
    }
    fits = total() <= budgetTokens
  }

  const ordered = working.sort((a, b) => a.order - b.order)
  return {
    blocks: ordered.map(({ name, text, kind, priority, required }) => ({
      name,
      text,
      kind,
      priority,
      required
    })),
    text: ordered.map((b) => b.text).join(separator),
    usedTokens: total(),
    budgetTokens,
    dropped,
    degraded,
    fits
  }
}

/**
 * Priorities for a scene-writing prompt. Higher survives longer.
 *
 * The ordering is a claim about what a scene actually needs, worth arguing with:
 *
 *  - storyContract  world rules the prose must never break. Breaking canon is
 *                   the most expensive error, so this outranks everything.
 *  - entities       who is in THIS scene. Already scene-scoped upstream
 *                   (buildSceneEntitiesBlob), so it is small and load-bearing.
 *  - storyBible     established canon. Large; degrade rather than delete —
 *                   some canon beats none.
 *  - spine          cross-chapter coherence. Degradable for the same reason.
 *  - chapterLog     what just happened. Useful, but the spine covers the arc.
 *  - sceneContext   retrieved/related prior scenes. The most speculative block:
 *                   nice when it fits, first out when it does not.
 *
 * The scene brief is NOT here — it is not variable-length context, it IS the
 * instruction, and it stays in the template unconditionally.
 */
const SCENE_PRIORITY = {
  storyContract: 100,
  entities: 80,
  storyBible: 60,
  spine: 50,
  chapterLog: 30,
  sceneContext: 10
}

/**
 * Context window to budget against, in tokens.
 *
 * Deliberately conservative and provider-agnostic: 16384 matches
 * config/ollama.js DEFAULT_NUM_CTX, which the probe confirmed Ollama honours on
 * 0.31.2. Cloud models are far larger, so budgeting them to this is a haircut we
 * accept in exchange for one code path — a scene prompt that needs more than
 * ~16k of context is not short of window, it is badly assembled.
 */
const DEFAULT_CONTEXT_TOKENS = 16384

/** Headroom for the template scaffolding, brief, arc, and JSON instructions. */
const SCAFFOLD_RESERVE_TOKENS = 1500

/**
 * Fit a scene-writing prompt's variable blocks to the window.
 *
 * Returns the same keys it was given, each either intact, shortened, or ''.
 * Callers drop them straight back into their template, so the prompt's shape
 * never changes — only what survives inside it.
 *
 * @returns {{storyContract:string, spineContext:string, storyContextBlock:string,
 *            existingEntitiesJson:string, sceneContext:string, logSummary:string,
 *            note:string, fits:boolean}}
 */
export function fitSceneContext({
  storyContract = '',
  spineContext = '',
  storyContextBlock = '',
  existingEntitiesJson = '',
  sceneContext = '',
  logSummary = '',
  outputTokens = 2240,
  contextTokens = DEFAULT_CONTEXT_TOKENS
} = {}) {
  const budget = Math.max(1000, contextTokens - outputTokens - SCAFFOLD_RESERVE_TOKENS)

  const result = fitToBudget(
    [
      {
        name: 'storyContract',
        text: storyContract,
        priority: SCENE_PRIORITY.storyContract,
        // World rules the prose must never break. Truncate it if we truly must,
        // but never drop it — prose written against no rules is worse than prose
        // written against partial ones.
        required: true
      },
      {
        name: 'entities',
        text: existingEntitiesJson,
        kind: 'json',
        priority: SCENE_PRIORITY.entities,
        minTokens: 400
      },
      {
        name: 'storyBible',
        text: storyContextBlock,
        priority: SCENE_PRIORITY.storyBible,
        minTokens: 400
      },
      { name: 'spine', text: spineContext, priority: SCENE_PRIORITY.spine, minTokens: 200 },
      { name: 'chapterLog', text: logSummary, priority: SCENE_PRIORITY.chapterLog },
      { name: 'sceneContext', text: sceneContext, priority: SCENE_PRIORITY.sceneContext }
    ],
    budget
  )

  const pick = (name) => result.blocks.find((b) => b.name === name)?.text || ''

  return {
    storyContract: pick('storyContract'),
    existingEntitiesJson: pick('entities'),
    storyContextBlock: pick('storyBible'),
    spineContext: pick('spine'),
    logSummary: pick('chapterLog'),
    sceneContext: pick('sceneContext'),
    note: describeBudget(result),
    fits: result.fits
  }
}

/**
 * Human-readable summary of what the budget sacrificed, or '' if nothing was.
 *
 * Exists so callers can SAY what happened. A budget that silently drops context
 * is only marginally better than a server that silently drops context.
 */
export function describeBudget(result) {
  if (!result) return ''
  const parts = []
  if (result.dropped.length) {
    parts.push(`dropped ${result.dropped.map((d) => `${d.name} (~${d.tokens} tok)`).join(', ')}`)
  }
  if (result.degraded.length) {
    parts.push(
      `shortened ${result.degraded.map((d) => `${d.name} (${d.from}→${d.to} tok)`).join(', ')}`
    )
  }
  if (!result.fits) {
    parts.push(`STILL OVER BUDGET (${result.usedTokens}/${result.budgetTokens} tok)`)
  }
  return parts.join('; ')
}
