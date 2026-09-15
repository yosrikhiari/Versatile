import { ref } from 'vue'
import { aiGenerate, aiStream, aiGenerateJson, resolveFeatureConfig } from './useAiService'
import { FEATURES, PROVIDERS, RESEARCH_CHUNKS_DEFAULT } from '../config/ai'
import { SessionBudget } from '../services/aiProviderBudget'

import { useProjectStore } from '../stores/projectStore'
import { getAllChunksForProject, getAllResearchDocuments } from '../services/researchDb'
import { getEmbedding } from '../services/embeddingService'
import { cosineSimilarity } from '../services/ollamaService'
import { resolveResearchScope } from '../services/researchScope'
import { sanitizeJson, repairTruncatedJson } from '../services/ai/aiHelpers'
import { guardPlan } from '../guardrails/integration/composableGuardrails'
import { rethrowIfFatal } from './generation/lifecycle/fatal'

// Planning is bounded by LACK OF PROGRESS, not by elapsed time.
//
// The previous 240s wall-clock cap was below what the work costs: an unbounded
// `num_predict` of ~4,400 tokens takes ~12 minutes on a partially-offloaded
// local model, so every planning call was killed mid-flight and every retry
// paid the same 240s again. Measured on a GTX 1650 / qwen3:8b at 5.85 tok/s.
//
// Now a call lives as long as tokens keep arriving and dies quickly when they
// stop, which detects a genuine hang sooner than the old cap did while no
// longer punishing slow hardware for succeeding.
const PLAN_IDLE_TIMEOUT_MS = 90_000
// Prompt evaluation emits nothing; on a large bible + research prompt this is
// legitimately minutes of silence before the first token.
const PLAN_FIRST_TOKEN_TIMEOUT_MS = 300_000

// Token budget per planned unit, measured against the schemas below. Left
// implicit, `resolveMaxTokens` fell back to a flat 4,096 for any model it has no
// metadata for — which is every local Ollama model — so a 3-scene call was given
// the same runway as a 100-chapter one and simply ran until it was cut off.
// Raised from 170: each chapter stub may now also carry `partOf`/`partNumber`.
// Under-budgeting truncates the batch, and the padding path turns a truncated
// chapter into "Chapter 47" — the exact failure this budget exists to prevent.
const TOKENS_PER_CHAPTER_STUB = 190
/** One planned event line ("Ines signs the pastor's certificate; Tomas watches"). */
const TOKENS_PER_EVENT = 45
const TOKENS_PER_SCENE = 300
const STORY_ARC_TOKENS = 400

/**
 * Planning is many calls, not one, and `rethrowIfFatal` already treats an
 * AbortError as fatal to the run — so the only thing needed to make a cancelled
 * plan stop issuing work is to raise one at each loop boundary.
 */
function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return
  const err = new Error(message)
  err.name = 'AbortError'
  throw err
}

// Hard cap on how many chunks we lexically rank in one planning call. Retrieval
// only needs the top handful, and scanning an unbounded corpus on the main thread
// is what froze the "Planning" phase on large research sets.
const LEXICAL_SCAN_CAP = 4000

// Rank chunks by BM25-ish TF-IDF against the query, computing document frequency
// ONCE per token (the previous version recomputed df — and re-lowercased every
// chunk — inside a per-chunk loop, which was O(N²) and blocked the UI thread).
function rankChunksLexically(queryText: any, lowerTexts: any[]) {
  const qTokens = queryText.toLowerCase().split(/\W+/).filter(Boolean)
  const N = lowerTexts.length || 1
  if (qTokens.length === 0) return new Array(N).fill(0)

  // df[token] — how many chunks contain the token — computed once.
  const df = new Map()
  for (const token of qTokens) {
    let d = 0
    for (let i = 0; i < lowerTexts.length; i++) {
      if (lowerTexts[i].includes(token)) d++
    }
    df.set(token, d)
  }

  return lowerTexts.map((lowerText: string) => {
    let score = 0
    for (const token of qTokens) {
      const dfv = df.get(token)
      if (!dfv) continue
      // term frequency via indexOf (no per-token regex construction)
      let tf = 0
      let idx = lowerText.indexOf(token)
      while (idx !== -1) {
        tf++
        idx = lowerText.indexOf(token, idx + token.length)
      }
      if (tf === 0) continue
      const idf = Math.log((N - dfv + 0.5) / (dfv + 0.5) + 1)
      score += (1 + Math.log(tf)) * idf
    }
    return score
  })
}

// sanitizeJson imported from aiHelpers.js

// Force a validated plan to match the user's exact structural request:
// exactly N chapters, S scenes each, W words per chapter. Trims extras and
// pads shortfalls (a safety net — the prompt asks the model to hit these).
function enforceStructure(chapters: any, spec: any) {
  const N = Math.max(1, spec.chapters || chapters.length)
  const S = Math.max(1, spec.scenesPerChapter || 3)
  const W = Math.max(1, spec.wordsPerChapter || 2000)
  const wordsPerScene = Math.max(200, Math.round(W / S))
  const chaptersPerVol = Math.max(1, spec.chaptersPerVolume || N)

  const out = (Array.isArray(chapters) ? chapters : []).slice(0, N)
  while (out.length < N) {
    out.push({
      title: `Chapter ${out.length + 1}`,
      goal: '',
      arcPosition: '',
      emotionalTarget: '',
      hookEnding: '',
      scenes: []
    })
  }

  return out.map((c: any, i: number) => {
    let scenes = (Array.isArray(c.scenes) ? c.scenes : []).slice(0, S)
    while (scenes.length < S) {
      scenes.push({
        title: `Scene ${scenes.length + 1}`,
        emotionalGoal: '',
        whatChanges: '',
        obstacle: '',
        sceneFunction: 'setup',
        charactersPresent: [],
        characterWants: {},
        location: '',
        setup: '',
        payoff: 'none',
        sensoryAnchor: '',
        arcPosition: 'setup',
        tension: 'medium',
        pacing: 'medium'
      })
    }
    scenes = scenes.map((s: any, j: number) => ({
      ...s,
      sceneNumber: j + 1,
      estimatedWords: wordsPerScene
    }))
    return {
      ...c,
      chapterNumber: i + 1,
      volumeIndex: Math.floor(i / chaptersPerVol) + 1,
      estimatedWords: W,
      scenes
    }
  })
}

// JSON schemas for the chunked planner's structured-output calls. On capable
// providers these constrain decoding directly; on others aiGenerateJson falls
// back to text + sanitizeJson, so this is strictly a reliability upgrade.
const SKELETON_SCHEMA = {
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
      items: {
        type: 'object',
        properties: {
          chapterNumber: { type: 'number' },
          title: { type: 'string' },
          // Consecutive chapters covering ONE unbroken event share a base title
          // and number the parts, instead of the model either repeating a title
          // or inventing an unrelated one for the second half of a single scene.
          partOf: { type: 'string' },
          partNumber: { type: 'number' },
          goal: { type: 'string' },
          arcPosition: { type: 'string' },
          emotionalTarget: { type: 'string' },
          hookEnding: { type: 'string' },
          // The progression contract. `revealed` is what the reader knows at
          // the end of this chapter that they did not before; `stateAfter` is
          // how the situation differs from the chapter's start. Both exist so
          // a chapter cannot be "Ines begins to suspect…" for the ninth time.
          revealed: { type: 'string' },
          stateAfter: { type: 'string' },
          // The chapter's events, one per scene, decided here — the one call
          // that sees the whole arc. Scene planning dresses them; it no longer
          // invents them, which is how three chapters came to discover the
          // same certificate.
          events: { type: 'array', items: { type: 'string' } }
        },
        required: ['title']
      }
    }
  },
  required: ['chapters']
}

const SCENES_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneNumber: { type: 'number' },
          title: { type: 'string' },
          emotionalGoal: { type: 'string' },
          whatChanges: { type: 'string' },
          obstacle: { type: 'string' },
          charactersPresent: { type: 'array', items: { type: 'string' } },
          // Per-scene plot-thread link: the signal buildSceneEntitiesBlob
          // scopes the thread dump on. Absent, threads ride whole (see the
          // `pov` comment below for what happens to unnamed fields).
          threadIds: { type: 'array', items: { type: 'string' } },
          characterWants: { type: 'object' },
          // Viewpoint was never actually decided by anything. The schema had no
          // `pov`, so the director never emitted one, and the only consumer
          // (useVolumeStoryGenerator) fell through `s.pov || s.povCharacter ||
          // charactersPresent[0]` — the first two permanently undefined. Every
          // scene was therefore narrated by whoever the model happened to list
          // first, and useStoryWriter then enforced that guess as a hard rule
          // ("do not head-hop"). Naming it here makes it a choice.
          pov: { type: 'string' },
          location: { type: 'string' },
          setup: { type: 'string' },
          payoff: { type: 'string' },
          sensoryAnchor: { type: 'string' },
          arcPosition: { type: 'string' },
          tension: { type: 'string' },
          pacing: { type: 'string' }
        },
        required: ['title']
      }
    }
  },
  required: ['scenes']
}

// Built per call so `maxItems` carries the exact count this batch asked for.
//
// An unbounded array tells the grammar it may keep emitting chapters forever,
// and a model handed a large num_predict duly does. The array bound is what lets
// the call terminate on its own rather than by running out of budget — the
// difference between a planning step that finishes and one that gets cut off.
const CHAPTER_FIX_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    goal: { type: 'string' },
    revealed: { type: 'string' },
    stateAfter: { type: 'string' },
    emotionalTarget: { type: 'string' },
    hookEnding: { type: 'string' },
    events: { type: 'array', items: { type: 'string' } }
  },
  required: ['title', 'goal']
}

function makeSkeletonSchema(batchCount: number) {
  return {
    ...SKELETON_SCHEMA,
    properties: {
      ...SKELETON_SCHEMA.properties,
      chapters: {
        ...SKELETON_SCHEMA.properties.chapters,
        minItems: batchCount,
        maxItems: batchCount
      }
    }
  }
}

function makeScenesSchema(sceneCount: number) {
  return {
    ...SCENES_SCHEMA,
    properties: {
      scenes: { ...SCENES_SCHEMA.properties.scenes, minItems: sceneCount, maxItems: sceneCount }
    }
  }
}

// How many chapters to request per skeleton call. A single call emitting 100+
// chapter objects is what truncates/times out and makes "Forging the Story Graph"
// hang; batching keeps every call small and reliable.
const SKELETON_BATCH_SIZE = 12

// ---- Chapter title variety -------------------------------------------------
//
// Every skeleton batch used to see the premise, the tone and the previous
// chapter's hook — never the titles already used. Nine independent calls
// drawing from one distribution is why a 100-chapter run produced "Echoes of
// Betrayal" eight times, roughly once per batch, alongside dozens of
// "[Noun] of [Noun]" clones. Nothing ever told batch 5 what batches 1-4 named.

const SHAPE_CONNECTORS = new Set([
  'of',
  'in',
  'from',
  'beneath',
  'within',
  'under',
  'beyond',
  'against',
  'without',
  'before',
  // Coordinating conjunctions were the blind spot in the first pass. A live run
  // came back with "Flesh and Thread", "Blood and Ink" and "Ash and Breath" —
  // three clones of one structure, the exact failure this budget exists to stop.
  // Without these they all fell into the catch-all `plain-3w` bucket alongside
  // unrelated titles, so the shape never registered as repeated and the budget
  // never fired.
  'and',
  'or'
])

/**
 * Collapse a title to its structural shape so near-duplicates can be counted.
 *
 * "Echoes of Betrayal" and "Whispers of Power" are different strings and the
 * same title. Only shape-counting catches that, which is what makes this worth
 * more than an exact-match blocklist.
 */
function titleShape(title: any): string {
  // A non-string is garbage input, not a one-word title — without this guard a
  // stray number would quietly consume the 'single-word' budget.
  if (typeof title !== 'string') return 'empty'
  // Normalise the curly apostrophe first: the run that prompted this shipped
  // "The Veil’s Reflection" with U+2019, which a straight-quote test misses.
  const t = title.replace(/[‘’]/g, "'").trim().toLowerCase()
  if (!t) return 'empty'
  if (t.endsWith('?')) return 'question'
  // Apostrophes survive the strip — they are the possessive signal below.
  const words = t
    .replace(/[.,;:!"]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return 'empty'
  if (words.length === 1) return 'single-word'
  const connector = words.find((w) => SHAPE_CONNECTORS.has(w))
  if (connector) return `x-${connector}-y`
  if (words.some((w) => w.endsWith("'s"))) return 'possessive'
  // A title that states something — "He Stopped Speaking", "They Speak Through
  // My Mouth", "The Mirror Was Broken". Without this they fell into the
  // word-count buckets, which cap at four, so a whole distinct form was
  // invisible to the metric: a run that replaced noun-phrase clichés with
  // sentences scored as no improvement at all.
  if (SUBJECT_PRONOUNS.has(words[0]) || words.some((w) => COPULA_OR_AUX.has(w))) return 'sentence'
  if (words[0] === 'the') return 'the-x'
  return `plain-${Math.min(words.length, 4)}w`
}

/**
 * Signals that a title is a statement rather than a noun phrase.
 *
 * Deliberately shallow: a leading subject pronoun, or a copula/auxiliary
 * anywhere. That is enough to separate "He Stopped Speaking" from "The Mirror
 * Throne" without pretending to parse English, and both lists are closed
 * classes, so this cannot drift the way a verb lexicon would.
 */
const SUBJECT_PRONOUNS = new Set([
  'i',
  'he',
  'she',
  'they',
  'we',
  'you',
  'it',
  'nobody',
  'everyone',
  'someone'
])
const COPULA_OR_AUX = new Set([
  'is',
  'was',
  'are',
  'were',
  'am',
  'be',
  'been',
  'will',
  'did',
  'does',
  'do',
  'has',
  'have',
  'had',
  'can',
  'cannot',
  'must'
])

const SHAPE_LABELS: Record<string, string> = {
  'single-word': 'a single word',
  question: 'a question',
  possessive: 'a possessive ("X\'s Y")',
  'the-x': '"The [Noun]"'
}

function describeShape(shape: string): string {
  if (SHAPE_LABELS[shape]) return SHAPE_LABELS[shape]
  const connector = shape.match(/^x-(\w+)-y$/)
  if (connector) return `"[Noun] ${connector[1]} [Noun]"`
  const plain = shape.match(/^plain-(\d)w$/)
  if (plain) return `a plain ${plain[1]}-word phrase`
  return shape
}

/**
 * The style palette, as [form description, examples] pairs.
 *
 * Split out of the prompt string because the examples have to be reachable from
 * code. A live run returned them verbatim as chapters 1-10 — "The Iron Collar",
 * "Who Signed the Order?", "Ashwater Bridge" and the rest, in palette order,
 * for a story containing none of those things. Shown a list of good titles, a
 * small model reads it as a menu rather than as a description of form; this is
 * the same "answered the wrong question in the right shape" failure the
 * relationship generator hit.
 *
 * So the examples are seeded into the used-titles ledger, which makes them
 * arrive already banned. Removing them instead would cost the palette its
 * teaching value — the forms are much harder to convey without instances.
 */
const TITLE_PALETTE: Array<[string, string[]]> = [
  ["a character's name, alone or possessive", ['Seraphine', 'What Dain Owed']],
  ['a concrete object, place or body part', ['The Iron Collar', 'Ashwater Bridge']],
  ['a fragment of spoken dialogue', ['Tell Me What You Remember']],
  ['a question', ['Who Signed the Order?']],
  ['a single striking word', ['Unmade', 'Kneel']],
  ['an action or verb phrase', ['Burn the Archive', 'She Stops Pretending']],
  ['a flat statement of what happens', ['The Vote Fails']]
]

const PALETTE_LINES = TITLE_PALETTE.map(
  ([form, examples]) => `- ${form} (${examples.map((e) => `"${e}"`).join(', ')})`
).join('\n')

/** Every example title, so the ledger can pre-ban them. */
const PALETTE_EXAMPLES = TITLE_PALETTE.flatMap(([, examples]) => examples)

// At most this many chapters in the whole novel may share one shape.
const SHAPE_BUDGET = 3
// Titles run ~4 words, so 80 of them is a few hundred input tokens — far cheaper
// than the batch's own output, and the only thing that kills exact repeats.
const TITLE_RECALL_CAP = 80

function overusedShapes(usedTitles: string[]): string[] {
  const counts = new Map<string, number>()
  for (const t of usedTitles) {
    const shape = titleShape(t)
    if (shape === 'empty') continue
    counts.set(shape, (counts.get(shape) || 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= SHAPE_BUDGET)
    .sort((a, b) => b[1] - a[1])
    .map(([shape]) => shape)
}

/**
 * `batchCount` drives the per-batch quotas.
 *
 * It defaults to the standard batch size so the block can still be rendered for
 * inspection without one, but planChunked always passes the real count — a final
 * batch of 4 must not be told to produce a 12-chapter spread of forms.
 */
function buildTitleVarietyBlock(
  usedTitles: string[],
  genre: string,
  tone: string,
  batchCount: number = SKELETON_BATCH_SIZE
): string {
  // Quotas scale with the batch, and floor at values a 4-chapter tail can still
  // satisfy. Asking for two questions in a batch of three would make the whole
  // instruction unsatisfiable, and an unsatisfiable rule is one the model learns
  // to disregard wholesale.
  // Same quotasFor() the post-batch audit uses, so the instruction and the
  // enforcement can never disagree about what the rule is.
  const q = quotasFor(batchCount)
  // A minimum of zero is not a rule, it is noise: "At least 0 must be a
  // question" reads as permission to skip and dilutes the ones that do apply.
  // Sub-minimum quotas are dropped from the list rather than rendered as 0.
  const quotaLines = [
    `- At most ${q.maxTheX} may begin with "The".`,
    `- At most ${q.maxConnector} may be "[Noun] of/in/and [Noun]".`,
    q.wantQuestion ? '- At least 1 must be a question ending in "?".' : '',
    q.wantSingleWord ? '- At least 1 must be ONE word.' : '',
    q.wantSentence ? '- At least 1 must be a full statement, e.g. "He Stopped Speaking".' : ''
  ]
    .filter(Boolean)
    .join('\n')
  const recent = usedTitles.slice(-TITLE_RECALL_CAP)
  // Shape counting reads real chapter titles only. Seeding the palette examples
  // here instead would spend budget on shapes the story has not actually used —
  // one example per form is enough to push several straight toward the limit.
  const banned = overusedShapes(usedTitles)
  // Pre-banned, because a small model treats the palette as a menu: a live run
  // returned all seven forms' examples verbatim as chapters 1-10.
  const offLimits = [...PALETTE_EXAMPLES, ...recent]
  return `
TITLES — this is the field most likely to come out repetitive. Read this section carefully.

OFF LIMITS. Never use one of these, and never produce a near-synonym of one.${
    recent.length ? '' : ' None are from this novel yet — they are the example titles below.'
  }
${offLimits.map((t) => `- ${t}`).join('\n')}
${
  banned.length
    ? `\nSHAPES THAT ARE FULL. At most ${SHAPE_BUDGET} chapters in the whole novel may share a shape, and these already hit that limit. Produce NO further titles in these shapes:\n${banned.map((s) => `- ${describeShape(s)}`).join('\n')}`
    : ''
}

The titles you return in THIS batch must also all differ from one another, in
wording AND in shape. The run that prompted this rule returned "Echoes of
Betrayal" twice inside a single batch of twelve. Before you answer, re-read the
titles you have just written and replace any that repeat an earlier one.

QUOTAS for these ${batchCount} titles. These are requirements, not preferences —
the shape limits above are computed from PREVIOUS batches and cannot see what you
are writing now, so within a batch these are the only constraint. A run without
them came back with eleven of twenty-four titles beginning with "The", and not a
single question, one-word or spoken-fragment title in the whole novel.
${quotaLines}
Count them yourself before answering.

Vary the FORM of titles across this batch. Deliberately mix:
${PALETTE_LINES}
Abstract-noun pairs ("[Noun] of [Noun]") are permitted but must be the exception.

The bracketed examples above are from an UNRELATED book and exist only to show
the seven forms. They are on the used list above. Copy the FORM, never the words.

Each title must name what actually happens in THAT chapter, drawn from its own
goal and hook. A title that could sit on any chapter of any dark fantasy novel
is a failed title.

TONE: this is ${genre || 'dark fantasy'}, tone "${tone || 'dark'}". Titles carry the
real weight of their events — violence, coercion, betrayal, desire, bodily horror.
Do not soften, euphemise, or make a title vaguer than the chapter it names.

CONTINUOUS EVENTS: when consecutive chapters cover ONE unbroken event, do not
invent unrelated names and do not repeat a title. Set "partOf" to a shared base
title and "partNumber" to 1, 2, 3... on each, leaving "title" empty. Use this
only for genuinely continuous action, never to dodge inventing a title.`
}

/**
 * The story's identity, rendered for a prompt.
 *
 * Called at every director prompt site rather than trusting genre to be present
 * somewhere in the evidence blob. Scene planning carried no identity at all: it
 * interpolated the chapter goal and hooks, and genre reached it only if the
 * bible text happened to mention it — and that text is truncation-bounded
 * (LEXICAL_SCAN_CAP), so "usually present" was the strongest guarantee on offer.
 *
 * The closing line exists because these three can contradict the material around
 * them. A Style Guide document, retrieved research and the author's genre
 * setting are separate inputs that nothing previously reconciled, so a bible
 * written for one register could quietly outvote the setting. The author's
 * choice is the tiebreak.
 */
function buildIdentityBlock({
  genre,
  tone,
  pov
}: {
  genre?: string
  tone?: string
  pov?: string
}): string {
  const lines = [
    `GENRE: ${genre || 'Standard'}`,
    `TONE: ${tone || 'Standard'}`,
    pov ? `POV: ${pov}` : ''
  ].filter(Boolean)
  return `${lines.join('\n')}
These govern every choice below. Where the story bible, the style guide or the research context implies a different genre or tone, THESE take precedence.`
}

/**
 * Compact plot-thread catalog for scene planning.
 *
 * The scene schema asks for `threadIds` per scene, but ids are meaningless
 * unless the model sees the catalog — an id it never saw is an id it
 * invents. Empty/missing input yields '' and the scene prompt carries no
 * thread language at all (today's behaviour, byte-identical).
 */
export function buildThreadCatalogBlock(plotThreads?: any[]): string {
  const threads = (plotThreads || []).filter((t: any) => t && t.id !== undefined && t.id !== null)
  if (threads.length === 0) return ''
  const lines = threads.map(
    (t: any) => `- ${String(t.id)}: ${String(t.title || 'Untitled thread')}`
  )
  return `Active plot threads (reference by id in each scene's "threadIds" — scenes advancing no thread use []):
${lines.join('\n')}`
}

/**
 * The per-batch skeleton prompt.
 *
 * Extracted so scripts/verify-title-variety.mjs drives the real prompt instead
 * of a copy — the before/after it reports is only evidence if both halves are
 * the code that actually ships. `titleBlock` is a parameter rather than an
 * internal call for the same reason: the probe's baseline passes '' to
 * reproduce the old behaviour without a test-only branch living in here.
 */
/**
 * The whole outline, one line per chapter, with the chapter being planned
 * marked. Scene planning used to see only its own chapter's line and the
 * previous chapter's hook — nothing about where the chapter sat in the book —
 * and every chapter re-derived the same opening beats from the premise.
 */
export function buildOutlineBlock(chapters: any[], currentIndex: number): string {
  if (!Array.isArray(chapters) || chapters.length === 0) return ''
  const lines = chapters.map((ch, i) => {
    const marker = i === currentIndex ? ' ◀ THIS CHAPTER' : ''
    const goal = (ch?.goal || '').trim()
    const reveal = (ch?.revealed || '').trim()
    return `${i + 1}. ${ch?.title || `Chapter ${i + 1}`} — ${goal}${reveal ? ` [reveals: ${reveal}]` : ''}${marker}`
  })
  return `FULL OUTLINE (${chapters.length} chapters):\n${lines.join('\n')}`
}

/**
 * What earlier chapters have already put on the page: their reveals and
 * end-states. Handed to the planner as "do not re-establish", which is the
 * instruction that stops chapter 7 from re-discovering the second body.
 */
export function buildEstablishedBlock(chapters: any[], uptoIndex: number): string {
  const prior = (chapters || []).slice(0, Math.max(0, uptoIndex)).filter(Boolean)
  const facts: string[] = []
  for (const [i, ch] of prior.entries()) {
    const reveal = (ch?.revealed || '').trim()
    const after = (ch?.stateAfter || '').trim()
    if (reveal) facts.push(`- ch ${i + 1}: ${reveal}`)
    if (after) facts.push(`- after ch ${i + 1}: ${after}`)
  }
  if (facts.length === 0) return ''
  return `ALREADY ESTABLISHED — the reader knows all of this. Do not re-discover, re-explain or re-stage any of it; build on it:\n${facts.join('\n')}`
}

/**
 * A deterministic beat ladder for an N-chapter book: what job each chapter
 * does. Handed to the model as a scaffold to fill rather than a shape to
 * invent, because an 8B model asked for "one continuous arc" produced a book
 * that left town in chapter 2, discovered the inciting body in chapter 3, and
 * ended twice. Climax always lands on chapter N−1 and resolution on N.
 */
const STORY_BEATS = [
  'opening — the ordinary world and the first anomaly; establish who wants what',
  'inciting incident — the story problem arrives and cannot be ignored',
  'first complication — the obvious explanation fails; someone lies',
  'commitment — the protagonist acts in a way that cannot be undone',
  'rising pressure — allies and adversaries declare themselves; a second front opens',
  'midpoint reversal — what the protagonist believed is inverted',
  'consequences — the reversal costs someone; a relationship breaks',
  'the walls close in — the last safe option disappears',
  'crisis — the darkest point; the protagonist must choose what to sacrifice',
  'climax — the decisive confrontation; the central question is answered on the page',
  'resolution — the new order, what it cost, and where the protagonist stands'
]

export function storyShapeFor(n: number): string[] {
  const N = Math.max(1, Math.floor(n))
  if (N === 1) return [STORY_BEATS[STORY_BEATS.length - 2]]
  if (N === 2) return [STORY_BEATS[1], STORY_BEATS[STORY_BEATS.length - 2]]
  const last = STORY_BEATS.length - 1
  return Array.from({ length: N }, (_, i) => {
    if (i === N - 1) return STORY_BEATS[last]
    if (i === N - 2) return STORY_BEATS[last - 1]
    // Spread the remaining beats across chapters 1..N−2, monotonically.
    const idx = Math.round((i / Math.max(1, N - 3)) * (last - 2))
    return STORY_BEATS[Math.min(last - 2, idx)]
  })
}

export function buildShapeBlock(N: number, batchStart: number, batchCount: number): string {
  const shape = storyShapeFor(N)
  const lines = []
  for (let k = batchStart; k < batchStart + batchCount; k++) {
    lines.push(`${k + 1}. ${shape[k]}`)
  }
  return `CHAPTER FUNCTIONS — each chapter does exactly this job and nothing from another chapter's line:\n${lines.join('\n')}`
}

/**
 * Goals of the chapters that come AFTER the one being planned. A small model
 * handed the whole outline still staged chapter 7's discovery in chapter 2;
 * naming the future as forbidden is what stops it.
 */
export function buildNotYetBlock(chapters: any[], currentIndex: number): string {
  const later = (chapters || []).slice(currentIndex + 1).filter(Boolean)
  if (later.length === 0) return ''
  const lines = later.map((ch, j) => {
    const n = currentIndex + 2 + j
    return `- ch ${n}: ${(ch?.goal || ch?.title || '').trim()}`
  })
  return `NOT YET HAPPENED — reserved for later chapters. Do not stage, pre-empt, foreshadow heavily, or resolve any of it here:\n${lines.join('\n')}`
}

/** The scenes chapters 1..i−1 already planned — the strongest "not this again" a planner can get. */
export function buildPlannedScenesBlock(chapters: any[], uptoIndex: number): string {
  const lines: string[] = []
  for (const [k, ch] of (chapters || []).slice(0, Math.max(0, uptoIndex)).entries()) {
    for (const sc of ch?.scenes || []) {
      const beat = (sc?.whatChanges || sc?.goal || '').trim()
      if (!sc?.title && !beat) continue
      lines.push(`- ch ${k + 1}: "${sc?.title || ''}" — ${beat}`)
    }
  }
  if (lines.length === 0) return ''
  return `SCENES ALREADY PLANNED in earlier chapters. None of these may happen again, under any title:\n${lines.join('\n')}`
}

/** The chapter's events from the skeleton, numbered so scene k can be told to realise event k. */
export function buildEventsBlock(ch: any, S: number): string {
  const events = Array.isArray(ch?.events) ? ch.events.filter(Boolean) : []
  if (events.length === 0) return ''
  return `EVENTS FOR THIS CHAPTER (decided in the outline; one per scene, in this order):\n${events
    .slice(0, S)
    .map((e: string, k: number) => `EVENT ${k + 1}: ${e}`)
    .join('\n')}`
}

function buildSkeletonPrompt({
  goal,
  N,
  S = 3,
  batchStart,
  batchCount,
  prevHook,
  needArc,
  titleBlock,
  establishedBlock = ''
}: {
  goal: any
  N: number
  S?: number
  batchStart: number
  batchCount: number
  prevHook: string
  needArc: boolean
  titleBlock: string
  establishedBlock?: string
}): string {
  return `Plan the chapter skeleton for this story.
PREMISE: "${goal.premise}"
${buildIdentityBlock(goal)}

Produce EXACTLY ${batchCount} chapters, numbered ${batchStart + 1} through ${batchStart + batchCount}, forming part of ONE continuous arc across ${N} total chapters. Each chapter's "hookEnding" must set up the next chapter.
${prevHook ? `The PREVIOUS chapter (#${batchStart}) ended on: "${prevHook}". Chapter ${batchStart + 1} must follow directly from that.` : 'This batch opens the story.'}
${establishedBlock}
${buildShapeBlock(N, batchStart, batchCount)}

PROGRESSION RULES — these matter more than anything else:
- The premise is the situation at the START of chapter 1. It is not a chapter. No chapter may re-introduce, re-discover or re-explain what the premise already states.
- Every chapter changes the story's state. "goal" is what is DIFFERENT when the chapter ends: a specific discovery, decision, loss, betrayal, reversal or arrival. Not a mood, not "begins to suspect", not "starts to question".
- "revealed" is the concrete fact, name, document or event the reader learns in this chapter and did not know before. Each chapter reveals something new; later chapters build on earlier reveals and never re-reveal them.
- "stateAfter" is one sentence: where things stand at the chapter's end (who knows what, who has done what, what is now impossible).
- Escalate. Chapters ${batchStart + 1}–${batchStart + batchCount} must climb: what is at risk grows, options close, and the ending chapters pay off what the opening chapters planted. The final chapter resolves the central conflict on the page.
- No two chapters may share a goal, a reveal, or a setting-plus-purpose pairing. If two chapters would do the same thing, one of them is wrong.
- "events" lists EXACTLY ${S} concrete events for the chapter, in order, one sentence each — a thing that happens on the page (someone arrives, finds, says, refuses, breaks, signs, dies). Each event moves the chapter toward its goal; the last one is the hookEnding. Across all ${N} chapters, no event may happen twice.
- An event is external and specific: it names who does what to whom, or what object changes hands or state. "She reflects", "gathers strength", "realizes", "prepares", "decides", "vows" and "considers" are not events — they are what a scene makes the reader feel while something else happens. A chapter whose three events are all interior is an empty chapter; give it a person, a place and a thing at stake instead.
- Name the counterpart. Every event involves a second named character, or a named object or document, or a named place that resists. "Nesrin walks the road once more" is a mood; "Nesrin pays the tax-farmer with the last of the coast salt and he short-weighs her in front of the town" is an event.
${titleBlock}
Return ONLY JSON, no markdown:
{
  ${needArc ? '"storyArc": { "premise": "", "genre": "", "tone": "", "centralConflict": "", "emotionalJourney": "", "resolution": "" },\n  ' : ''}"chapters": [ { "chapterNumber": ${batchStart + 1}, "title": "", "partOf": "", "partNumber": 0, "goal": "", "arcPosition": "", "emotionalTarget": "", "hookEnding": "", "revealed": "", "stateAfter": "", "events": [${Array.from({ length: S }, () => '""').join(', ')}] } ]
}`
}

/**
 * Quota caps and floors for a batch of `batchCount` titles.
 *
 * Single source of truth: the prompt renders these and the post-check enforces
 * them, so the instruction and the audit can never disagree.
 */
/** The two over-cap requirements, named so the repurposing rule can't drift. */
const NO_THE = 'must NOT begin with "The"'
const NO_CONNECTOR = 'must NOT be "[Noun] of/in/and [Noun]"'
const OVER_CAP_FORMS = [NO_THE, NO_CONNECTOR]

function quotasFor(batchCount: number) {
  return {
    maxTheX: Math.max(1, Math.round(batchCount / 4)),
    maxConnector: Math.max(1, Math.round(batchCount / 4)),
    wantQuestion: batchCount >= 8,
    wantSingleWord: batchCount >= 8,
    wantSentence: batchCount >= 6
  }
}

/**
 * Which chapters in a returned batch need a different title, and what form each
 * replacement must take.
 *
 * The quotas were advisory for one release and a live 7B run answered 7 where
 * the instruction said "at most 3", and 0 where it said "at least 1". Prompt
 * wording does not fix that — a model either follows a numeric constraint or it
 * does not, and this one does not. So the batch is audited after it returns.
 *
 * Returns [] when the batch complied, which is the common case and costs nothing.
 */
function planTitleRepairs(titles: string[], batchCount: number, priorTitles: string[] = []) {
  const q = quotasFor(batchCount)
  const shapes = titles.map(titleShape)
  const repairs: Array<{ index: number; requiredForm: string }> = []
  const claimed = new Set<number>()

  // Duplicates first, and they outrank every shape rule.
  //
  // This is the failure that started the whole investigation, and for one
  // release it was the only one left purely advisory: the ledger tells a batch
  // what is taken and a live run reused two of those titles anyway, putting
  // AFTER (2 duplicates) behind the untouched baseline (1). Steering never
  // closed it; the repair machinery already existed and simply was not pointed
  // at it.
  const seen = new Set(priorTitles.map((t) => t.trim().toLowerCase()))
  titles.forEach((title, index) => {
    const key = title.trim().toLowerCase()
    if (!key) return
    if (seen.has(key)) {
      claimed.add(index)
      repairs.push({ index, requiredForm: `must not repeat the existing title "${title}"` })
      return
    }
    seen.add(key)
  })

  // Over-cap shapes: keep the first `max`, re-ask for the rest. Keeping the
  // earliest is arbitrary but stable, which matters for resumability.
  const overCap = (predicate: (s: string) => boolean, max: number, form: string) => {
    const hits = shapes.map((s, i) => (predicate(s) ? i : -1)).filter((i) => i >= 0)
    for (const index of hits.slice(max)) {
      if (claimed.has(index)) continue
      claimed.add(index)
      repairs.push({ index, requiredForm: form })
    }
  }
  overCap((s) => s === 'the-x', q.maxTheX, NO_THE)
  overCap((s) => /^x-\w+-y$/.test(s), q.maxConnector, NO_CONNECTOR)

  // Missing forms: convert an already-doomed chapter where possible, otherwise
  // take the last compliant one. Never re-ask for a chapter twice.
  const requireForm = (present: boolean, form: string) => {
    if (present) return
    // Only an over-cap repair may be repurposed. A duplicate repair must keep
    // its own requirement — matching on letter case alone would be one careless
    // rewording away from silently dropping the duplicate rule.
    const reusable = repairs.find((r) => OVER_CAP_FORMS.includes(r.requiredForm))
    if (reusable) {
      reusable.requiredForm = form
      return
    }
    for (let i = titles.length - 1; i >= 0; i--) {
      if (claimed.has(i)) continue
      claimed.add(i)
      repairs.push({ index: i, requiredForm: form })
      return
    }
  }
  requireForm(!q.wantQuestion || shapes.includes('question'), 'must be a question ending in "?"')
  requireForm(!q.wantSingleWord || shapes.includes('single-word'), 'must be exactly ONE word')
  requireForm(
    !q.wantSentence || shapes.includes('sentence'),
    'must be a full statement, e.g. "He Stopped Speaking"'
  )

  return repairs
}

/** Pinned to exactly the number of chapters being repaired, like the others. */
function makeTitleRepairSchema(count: number) {
  return {
    type: 'object',
    properties: {
      titles: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: { chapterNumber: { type: 'number' }, title: { type: 'string' } },
          required: ['chapterNumber', 'title']
        }
      }
    },
    required: ['titles']
  }
}

/**
 * Re-ask for just the titles that broke quota. Returns index -> new title.
 *
 * Small and bounded on purpose: it sends only the offending chapters and their
 * goals, so an over-quota batch costs a few hundred tokens rather than a second
 * full skeleton call. Advisory by design at the edges — a replacement is only
 * accepted if it actually satisfies the form that was demanded and is not
 * already in use, because a model that ignored the quota once will happily
 * return the same shape again, and swapping one violation for another while
 * reporting success is worse than leaving the original.
 */
async function requestTitleRepairs({
  repairs,
  assembled,
  usedTitles,
  systemPrompt,
  sessionBudget,
  signal
}: {
  repairs: Array<{ index: number; requiredForm: string }>
  assembled: Array<{ chapterNumber: number; title: string; raw: any }>
  usedTitles: string[]
  systemPrompt: any
  sessionBudget?: SessionBudget | null
  signal?: AbortSignal
}): Promise<Map<number, string>> {
  const applied = new Map<number, string>()
  const taken = new Set(
    [...usedTitles, ...assembled.map((a) => a.title)].map((t) => t.trim().toLowerCase())
  )

  const lines = repairs
    .map(({ index, requiredForm }) => {
      const entry = assembled[index]
      return `Chapter ${entry.chapterNumber} — current title "${entry.title}" — this chapter is about: "${entry.raw.goal || entry.raw.hookEnding || 'see the arc'}"\n  Its replacement ${requiredForm}.`
    })
    .join('\n')

  const prompt = `These chapter titles break the variety rules for this novel. Replace ONLY these, one new title each.

${lines}

Each replacement must still name what actually happens in that chapter. Do not reuse any title already used in this novel.
Return ONLY JSON: { "titles": [ { "chapterNumber": 0, "title": "" } ] }`

  const result = await aiGenerateJson(prompt, systemPrompt, {
    feature: FEATURES.STORY_GENERATION,
    temperature: 0.8,
    maxTokens: repairs.length * 40 + 120,
    schema: makeTitleRepairSchema(repairs.length),
    schemaName: 'title_repair',
    role: 'utility',
    repeatLastN: -1,
    topP: 0.95,
    minP: 0.02,
    idleTimeout: PLAN_IDLE_TIMEOUT_MS,
    firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
    sessionBudget,
    signal
  }).catch((err) => {
    // A failed repair leaves the original title standing, which is a worse
    // title, not a broken plan. Only a cancelled run travels up.
    rethrowIfFatal(err)
    console.warn('[StoryDirector] title repair failed; keeping originals:', err)
    return null
  })

  const returned = Array.isArray(result?.titles) ? result.titles : []
  for (const { index, requiredForm } of repairs) {
    const entry = assembled[index]
    const match = returned.find((t: any) => Number(t?.chapterNumber) === entry.chapterNumber)
    const candidate = String(match?.title || '').trim()
    if (!candidate) continue
    if (taken.has(candidate.toLowerCase())) continue
    if (!satisfiesForm(candidate, requiredForm)) continue
    applied.set(index, candidate)
    taken.add(candidate.toLowerCase())
  }
  return applied
}

/** Does a replacement actually meet the form its repair demanded? */
function satisfiesForm(title: string, requiredForm: string): boolean {
  const shape = titleShape(title)
  if (requiredForm.includes('ONE word')) return shape === 'single-word'
  if (requiredForm.includes('question')) return shape === 'question'
  if (requiredForm.includes('full statement')) return shape === 'sentence'
  if (requiredForm.includes('NOT begin with "The"')) return shape !== 'the-x'
  if (requiredForm.includes('NOT be "[Noun]')) return !/^x-\w+-y$/.test(shape)
  return true
}

/**
 * `partOf` + `partNumber` win over `title`, falling back to the padding name.
 * Keeping this in one place is what stops a multi-part chapter from being
 * counted as padding, or from landing on the canvas with an empty title.
 */
function assembleTitle(raw: any, chapterNumber: number): string {
  const base = String(raw?.partOf || '').trim()
  const part = Number(raw?.partNumber)
  if (base && Number.isFinite(part) && part > 0) return `${base}, Part ${part}`
  return String(raw?.title || '').trim() || `Chapter ${chapterNumber}`
}

// Provider-aware planning concurrency. Ollama runs one model locally, so parallel
// calls only queue (no speedup, memory pressure) — keep it serial. Cloud providers
// plan chapters concurrently, which is the difference between minutes and an hour
// on a long novel.
function planConcurrency() {
  try {
    const config = resolveFeatureConfig(FEATURES.STORY_GENERATION)
    return config.provider === PROVIDERS.OLLAMA ? 1 : 4
  } catch {
    return 2
  }
}

// Bounded-concurrency map: runs the tasks with at most `limit` in flight, pulling
// the next task only when a slot frees (so each task's timeout clock starts when it
// actually launches, not up front). Task functions must not throw — planning tasks
// swallow their own errors and degrade.
async function runWithConcurrency(tasks: any[], limit: number) {
  const results = new Array(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++
      results[idx] = await tasks[idx]()
    }
  }
  const poolSize = Math.max(1, Math.min(limit, tasks.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))
  return results
}

// Plan a large structured story in small, reliable pieces instead of one giant
// JSON: build the chapter skeleton in bounded batches (each batch threaded off the
// previous batch's last hook so the arc stays continuous), then plan each chapter's
// scenes with bounded concurrency. Every step degrades to padding rather than
// throwing, so a long novel always yields a usable plan — that is what keeps the
// "Forging the Story Graph" stage from hanging or aborting at scale.
async function planChunked({
  goal,
  systemPrompt,
  onPartialData,
  onSkeletonReady,
  sessionBudget,
  signal,
  plotThreads
}: {
  goal: any
  systemPrompt: any
  onPartialData: any
  onSkeletonReady?: any
  sessionBudget?: SessionBudget | null
  signal?: AbortSignal
  plotThreads?: any[]
}) {
  const s = goal.structure
  const N = Math.max(1, s.chapters)
  const S = Math.max(1, s.scenesPerChapter || 3)
  // Scene planning may run against different evidence than the skeleton did —
  // see the `onSkeletonReady` hook below.
  let activeSystemPrompt = systemPrompt

  // 1) Chapter skeleton — in batches of SKELETON_BATCH_SIZE
  const chapters: any[] = []
  let storyArc: any = {}
  // Threaded across batches so batch N can see everything batches 1..N-1 named.
  // This is the whole fix for cross-batch title repetition; without it each
  // batch is an independent draw from the same distribution.
  const usedTitles: string[] = []
  // Padding is deliberate (a flaky batch must not cost the book its length) but
  // it is not free: a padded chapter is a title and nothing else. Counted here
  // so the caller can put it on the run-health ledger instead of the console.
  // `duplicateTitles` counts titles that exactly repeat an earlier chapter's.
  // The ledger, the shape budget and the sampling window all reduce repetition
  // but none of them can guarantee it: they steer a model, they do not constrain
  // it. Counting survivors puts the failure on the run-health ledger instead of
  // leaving it for the author to notice at chapter 97.
  const degradation = {
    paddedChapters: 0,
    chaptersWithoutScenePlan: 0,
    duplicateTitles: 0,
    quotaViolations: 0,
    repetitiveChapters: 0,
    duplicateChapterGoals: 0,
    interiorChapters: 0
  }
  const seenTitleKeys = new Set<string>()
  while (chapters.length < N) {
    throwIfAborted(signal, 'Story planning cancelled')
    const batchStart = chapters.length
    const batchCount = Math.min(SKELETON_BATCH_SIZE, N - batchStart)
    const needArc = batchStart === 0
    const prevHook = batchStart > 0 ? chapters[batchStart - 1].hookEnding : ''

    const skeletonPrompt = buildSkeletonPrompt({
      goal,
      N,
      S,
      batchStart,
      batchCount,
      prevHook,
      needArc,
      titleBlock: buildTitleVarietyBlock(usedTitles, goal.genre, goal.tone, batchCount),
      establishedBlock: buildEstablishedBlock(chapters, batchStart)
    })
    const skel = await aiGenerateJson(skeletonPrompt, activeSystemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      idleTimeout: PLAN_IDLE_TIMEOUT_MS,
      firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
      maxTokens:
        batchCount * (TOKENS_PER_CHAPTER_STUB + S * TOKENS_PER_EVENT) +
        (needArc ? STORY_ARC_TOKENS : 0),
      // Sampling tuned for THIS call's shape. The ledger above stops a batch
      // repeating an *earlier* batch, but it is built once per batch and so
      // cannot stop a batch repeating itself — and the reported run did exactly
      // that, emitting "Echoes of Betrayal" at chapters 5 and 10 of one batch.
      // The mechanical cause is the window: the global repeat_last_n of 512
      // covers under three chapters of a ~2,300-token batch, so chapter 1's
      // title exerts no pressure whatever on chapter 10's.
      //
      // -1 spans the whole context, which is what "do not repeat yourself
      // anywhere in this batch" actually requires. top_p/min_p widen from the
      // 0.9/0.05 prose defaults because a title is a short, high-variance
      // choice: the default cutoff prunes exactly the uncommon nouns that make
      // one title unlike the last. Temperature stays 0.7 — this same call also
      // emits the structural fields under a pinned schema.
      repeatLastN: -1,
      topP: 0.95,
      minP: 0.02,
      schema: makeSkeletonSchema(batchCount),
      schemaName: 'chapter_skeleton',
      role: 'utility',
      sessionBudget,
      signal,
      // Heartbeat on every token chunk so the stage watchdog knows streaming is alive
      onToken: (_chunk, _full) => {
        try {
          if (onPartialData) onPartialData('structure', 'streaming')
        } catch {
          // Best-effort heartbeat; a throwing consumer must not break streaming.
        }
      }
    }).catch((err) => {
      // A spent budget or a user stop fails every remaining call identically.
      // Padding around those produces a full-length outline of empty chapters
      // and hides the reason the run is over — so they travel up instead.
      rethrowIfFatal(err)
      console.warn(`[StoryDirector] skeleton batch ${batchStart + 1}+ failed:`, err)
      return null
    })

    if (needArc && skel && skel.storyArc && typeof skel.storyArc === 'object') {
      storyArc = skel.storyArc
    }

    const batchChapters = Array.isArray(skel?.chapters) ? skel.chapters : []
    // Assemble the batch before committing any of it, so a quota repair can
    // simply replace a title instead of having to un-push one from the ledger.
    // Fill exactly batchCount chapters, padding any the model omitted so the arc
    // never loses its length to a single flaky/truncated batch.
    const assembled: Array<{
      raw: any
      chapterNumber: number
      isPadded: boolean
      title: string
    }> = []
    for (let k = 0; k < batchCount; k++) {
      const raw = batchChapters[k] || {}
      const chapterNumber = batchStart + k + 1
      // A multi-part chapter carries `partOf` and no `title`; counting that as
      // padding would report a healthy run as degraded.
      const isPadded = !raw.title && !raw.partOf
      assembled.push({ raw, chapterNumber, isPadded, title: assembleTitle(raw, chapterNumber) })
    }

    // Quotas are enforced after the fact, not merely instructed. A live 7B run
    // answered 7 where the prompt said "at most 3" and 0 where it said "at least
    // 1"; a model either honours a numeric constraint or it does not, and firmer
    // wording does not change which. One bounded repair call per offending batch
    // is what turns steering into enforcement. Padded chapters are excluded —
    // the batch call already failed for those, so re-asking buys nothing.
    const repairs = planTitleRepairs(
      assembled.map((a) => a.title),
      batchCount,
      usedTitles
    ).filter((r) => !assembled[r.index].isPadded)
    if (repairs.length) {
      const replacements = await requestTitleRepairs({
        repairs,
        assembled,
        usedTitles,
        systemPrompt: activeSystemPrompt,
        sessionBudget,
        signal
      })
      for (const [index, title] of replacements) assembled[index].title = title
      // Whatever the repair could not fix is still a violation; record it rather
      // than let a quiet miss look like compliance.
      degradation.quotaViolations += repairs.length - replacements.size
    }

    for (const entry of assembled) {
      // Only real model output enters the ledger. A padded "Chapter 47" is our
      // fallback, not a title the model chose: replaying it as "already used"
      // teaches nothing, and a run with several padded batches would exhaust the
      // plain-two-word budget and ban a shape the model never actually spent.
      if (entry.isPadded) {
        degradation.paddedChapters++
      } else {
        usedTitles.push(entry.title)
        const key = entry.title.trim().toLowerCase()
        if (seenTitleKeys.has(key)) degradation.duplicateTitles++
        seenTitleKeys.add(key)
      }
      chapters.push({
        chapterNumber: entry.chapterNumber,
        title: entry.title,
        goal: entry.raw.goal || '',
        arcPosition: entry.raw.arcPosition || '',
        emotionalTarget: entry.raw.emotionalTarget || '',
        hookEnding: entry.raw.hookEnding || '',
        // The progression contract travels with the chapter: scene planning
        // reads these to know what is already on the page.
        revealed: entry.raw.revealed || '',
        stateAfter: entry.raw.stateAfter || '',
        events: Array.isArray(entry.raw.events)
          ? entry.raw.events.map((e: any) => String(e || '').trim()).filter(Boolean)
          : [],
        storyFunction: storyShapeFor(N)[entry.chapterNumber - 1] || ''
      })
    }
    try {
      onPartialData?.('scene', `Outlined chapters ${batchStart + 1}–${batchStart + batchCount}`)
    } catch {
      // Best-effort progress callback; a throwing consumer must not break planning.
    }
  }

  // 1.4) Re-plan chapters the skeleton got wrong, one call per offender:
  //      - two chapters with the same goal are one chapter written twice (a
  //        live run ended twice: chapter 9 and 10 both "Ines signs the final
  //        certificate and leaves");
  //      - a chapter whose events are interior ("reflects", "gathers strength",
  //        "decides") has nothing for a scene to dramatise — a live run planned
  //        "gazes at the stars / packs supplies / sets off" as its crisis.
  //      Each re-ask names the problem and the chapter's function in the book.
  async function replanChapter(index: number, problem: string) {
    throwIfAborted(signal, 'Story planning cancelled')
    const ch = chapters[index]
    const shape = storyShapeFor(N)
    const prompt = `The outline below has a problem: ${problem}
STORY: "${goal.premise}"
${buildIdentityBlock(goal)}
${buildOutlineBlock(chapters, index)}
${buildEstablishedBlock(chapters, index)}
Chapter ${index + 1}'s function in the book is: ${shape[index]}
Write a REPLACEMENT for chapter ${index + 1} only. It must do that function, follow chapter ${index} directly, lead into chapter ${index + 2 <= N ? index + 2 : 'the end'}, and contain events that happen nowhere else in the outline.
"events" lists EXACTLY ${S} external events in order — each names who does what to whom, or what object or document changes hands or state. No reflecting, deciding, preparing, realising or vowing.
Return ONLY JSON, no markdown:
{ "title": "", "goal": "", "revealed": "", "stateAfter": "", "emotionalTarget": "", "hookEnding": "", "events": [${Array.from({ length: S }, () => '""').join(', ')}] }`
    const fixed = await aiGenerateJson(prompt, activeSystemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.8,
      idleTimeout: PLAN_IDLE_TIMEOUT_MS,
      firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
      maxTokens: TOKENS_PER_CHAPTER_STUB * 2 + TOKENS_PER_EVENT * S,
      schema: CHAPTER_FIX_SCHEMA,
      schemaName: 'chapter_fix',
      role: 'utility',
      sessionBudget,
      signal
    }).catch((err) => {
      rethrowIfFatal(err)
      console.warn(`[StoryDirector] chapter re-plan for ${index + 1} failed:`, err)
      return null
    })
    if (fixed && typeof fixed === 'object' && (fixed.goal || fixed.title)) {
      if (fixed.title) ch.title = String(fixed.title)
      if (fixed.goal) ch.goal = String(fixed.goal)
      if (fixed.revealed) ch.revealed = String(fixed.revealed)
      if (fixed.stateAfter) ch.stateAfter = String(fixed.stateAfter)
      if (fixed.emotionalTarget) ch.emotionalTarget = String(fixed.emotionalTarget)
      if (fixed.hookEnding) ch.hookEnding = String(fixed.hookEnding)
      const events = Array.isArray(fixed.events)
        ? fixed.events.map((e: any) => String(e || '').trim()).filter(Boolean)
        : []
      // A new goal with the old events would contradict itself; better none
      // (scene planning then derives beats from the goal) than the wrong ones.
      ch.events = events.length ? events : []
    }
  }

  const dupChapters = findDuplicateChapterGoals(chapters)
  if (dupChapters.length > 0) {
    await runWithConcurrency(
      dupChapters.map(
        ({ index, duplicateOf }) =>
          () =>
            replanChapter(
              index,
              `chapter ${index + 1} ("${chapters[index].title}") repeats chapter ${duplicateOf + 1} ("${chapters[duplicateOf].title}") — same goal, same event.`
            )
      ),
      planConcurrency()
    )
    degradation.duplicateChapterGoals = findDuplicateChapterGoals(chapters).length
  }

  const interiorChapters = findInteriorChapters(chapters)
  if (interiorChapters.length > 0) {
    await runWithConcurrency(
      interiorChapters.map(
        (index) => () =>
          replanChapter(
            index,
            `chapter ${index + 1} ("${chapters[index].title}") has no events — its beats are interior (${(chapters[index].events || []).join('; ')}). Nothing happens that a scene could show.`
          )
      ),
      planConcurrency()
    )
    degradation.interiorChapters = findInteriorChapters(chapters).length
  }

  // 1.5) The cast an arc needs is only knowable once the arc exists. Give the
  //      caller a window here — after the skeleton, before any scene is planned —
  //      to commit new entities and hand back refreshed evidence, so scenes can
  //      cast them by name. Without this the plan can only ever draw on the cast
  //      the synopsis alone produced, and nothing downstream adds to it.
  //
  //      Advisory: a failure here costs the story its new cast, not its plan.
  if (onSkeletonReady) {
    try {
      const refreshedEvidence = await onSkeletonReady({ chapters, storyArc })
      if (typeof refreshedEvidence === 'string' && refreshedEvidence.trim()) {
        activeSystemPrompt = refreshedEvidence
      }
    } catch (err) {
      rethrowIfFatal(err)
      console.warn('[StoryDirector] cast expansion hook failed; planning scenes as-is:', err)
    }
  }

  // 2) Scenes per chapter — independent given the skeleton, so plan them with
  //    bounded, provider-aware concurrency. Each chapter is still linked to the
  //    previous chapter's hook for continuity.
  const sceneTasks = chapters.map((ch: any, i: number) => async () => {
    // Checked per task, not once up front: these run with bounded concurrency,
    // so an abort during chapter 3 must stop chapters 4..N from ever being
    // issued rather than only the one in flight.
    throwIfAborted(signal, 'Scene planning cancelled')
    const prev = chapters[i - 1]
    try {
      onPartialData?.('scene', ch.title || `Chapter ${i + 1}`)
    } catch {
      // Best-effort progress callback; a throwing consumer must not break planning.
    }
    const threadCatalog = buildThreadCatalogBlock(plotThreads)
    const outlineBlock = buildOutlineBlock(chapters, i)
    const establishedBlock = buildEstablishedBlock(chapters, i)
    const notYetBlock = buildNotYetBlock(chapters, i)
    const plannedBlock = buildPlannedScenesBlock(chapters, i)
    const eventsBlock = buildEventsBlock(ch, S)
    const scenePrompt = `Plan EXACTLY ${S} scenes for chapter ${i + 1} of ${chapters.length}.
STORY: "${goal.premise}"
${buildIdentityBlock(goal)}
${outlineBlock}
${establishedBlock ? `\n${establishedBlock}\n` : ''}${plannedBlock ? `\n${plannedBlock}\n` : ''}${notYetBlock ? `\n${notYetBlock}\n` : ''}${threadCatalog ? `${threadCatalog}\n` : ''}CHAPTER ${i + 1}: "${ch.title}"
- This chapter's function in the book: ${ch.storyFunction || storyShapeFor(chapters.length)[i] || ''}
- Chapter goal (what is different when it ends): ${ch.goal || ''}
${eventsBlock}
- What this chapter reveals: ${ch.revealed || '(decide it — something the reader does not yet know)'}
- Emotional target: ${ch.emotionalTarget || ''}
- This chapter must end on: ${ch.hookEnding || 'a hook into the next chapter'}
${prev ? `- The PREVIOUS chapter ended on: "${prev.hookEnding || ''}". Scene 1 must pick up directly from that.` : '- This is the opening chapter.'}

SCENE RULES:
- ${ch.events?.length ? `Scene k realises EVENT k above — that event is the scene's "whatChanges". Do not merge, reorder, skip or replace them.` : `The ${S} scenes together must move the story from this chapter's start to its goal.`} Each scene's "whatChanges" is a concrete event, decision or discovery — never "begins to", "starts to", "becomes aware", "realizes she must".
- Do not re-stage anything in ALREADY ESTABLISHED or in earlier chapters of the outline. A scene may refer to it in a clause; it may not be the scene's event.
- Scene titles must be specific to this chapter's events, not the book's motifs. Do not reuse a title, a location-plus-purpose, or an event from any other chapter in the outline.
- Vary the surface: not every scene is Ines alone thinking. Put other characters in the room; give them wants that collide with hers.

Return ONLY JSON with EXACTLY ${S} scenes, no markdown:
{ "scenes": [ { "sceneNumber": 1, "title": "", "emotionalGoal": "", "whatChanges": "", "obstacle": "", "charactersPresent": [], "characterWants": {}, "pov": "", "location": "", "setup": "", "payoff": "", "sensoryAnchor": "", "arcPosition": "setup", "tension": "medium", "pacing": "medium"${plotThreads?.length ? `, "threadIds": []` : ''} } ] }
"pov" is the ONE character whose head this scene is narrated from. It must be a name from that scene's "charactersPresent".${
      plotThreads?.length
        ? `
"threadIds" lists the ids of the Active plot threads this scene advances (from the thread catalog) — [] when it advances none. Name only threads the scene actually moves.`
        : ''
    }`
    const parsedScenes = await aiGenerateJson(scenePrompt, activeSystemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      idleTimeout: PLAN_IDLE_TIMEOUT_MS,
      firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
      maxTokens: S * TOKENS_PER_SCENE,
      schema: makeScenesSchema(S),
      schemaName: 'chapter_scenes',
      role: 'utility',
      sessionBudget,
      signal,
      // Heartbeat on every token chunk so the stage watchdog knows streaming is alive
      onToken: (_chunk, _full) => {
        try {
          if (onPartialData) onPartialData('structure', 'streaming')
        } catch {
          // Best-effort heartbeat; a throwing consumer must not break streaming.
        }
      }
    }).catch((err) => {
      rethrowIfFatal(err)
      console.warn(`[StoryDirector] scene plan for chapter ${i + 1} failed:`, err)
      return null
    })
    ch.scenes = Array.isArray(parsedScenes?.scenes) ? parsedScenes.scenes : []
    // `enforceStructure` will pad this chapter back to S scenes downstream, so
    // the plan's shape stays right and the loss is invisible unless counted.
    if (ch.scenes.length === 0) degradation.chaptersWithoutScenePlan++
    for (const sc of (ch as any).scenes) {
      try {
        onPartialData?.('scene', sc.title)
      } catch {
        // Best-effort progress callback; a throwing consumer must not break planning.
      }
    }
  })
  // Sequential on purpose: chapter i's prompt lists the scenes chapters 1..i−1
  // actually planned, which only exists if they were planned first. Ollama
  // serialises calls regardless, so this costs nothing locally.
  await runWithConcurrency(sceneTasks, 1)

  // Steering a model is not constraining it: audit the plan for chapters that
  // repeat an earlier chapter's scenes, and re-plan each once with the repeats
  // named. Survivors are counted on the degradation ledger.
  const repeatOffenders = findRepetitiveChapters(chapters)
  if (repeatOffenders.length > 0) {
    const retryTasks = repeatOffenders.map(({ index, repeats }) => async () => {
      throwIfAborted(signal, 'Scene planning cancelled')
      const ch = chapters[index]
      const prev = chapters[index - 1]
      const rejected = repeats.map((r) => `- "${r.title}" (${r.reason})`).join('\n')
      const prompt = `Plan EXACTLY ${S} scenes for chapter ${index + 1} of ${chapters.length}.
STORY: "${goal.premise}"
${buildIdentityBlock(goal)}
${buildOutlineBlock(chapters, index)}
${buildEstablishedBlock(chapters, index)}
${buildNotYetBlock(chapters, index)}
CHAPTER ${index + 1}: "${ch.title}"
- This chapter's function in the book: ${ch.storyFunction || ''}
- Chapter goal: ${ch.goal || ''}
- What this chapter reveals: ${ch.revealed || ''}
- This chapter must end on: ${ch.hookEnding || 'a hook into the next chapter'}
${prev ? `- The PREVIOUS chapter ended on: "${prev.hookEnding || ''}".` : ''}

YOUR PREVIOUS PLAN FOR THIS CHAPTER WAS REJECTED. These scenes repeated earlier chapters:
${rejected}
Plan ${S} DIFFERENT scenes that only this chapter could contain: new events, new decisions, new information. Every "whatChanges" must be something that has not happened anywhere in the outline.

Return ONLY JSON with EXACTLY ${S} scenes, no markdown:
{ "scenes": [ { "sceneNumber": 1, "title": "", "emotionalGoal": "", "whatChanges": "", "obstacle": "", "charactersPresent": [], "characterWants": {}, "pov": "", "location": "", "setup": "", "payoff": "", "sensoryAnchor": "", "arcPosition": "setup", "tension": "medium", "pacing": "medium" } ] }`
      const replanned = await aiGenerateJson(prompt, activeSystemPrompt, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.8,
        idleTimeout: PLAN_IDLE_TIMEOUT_MS,
        firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
        maxTokens: S * TOKENS_PER_SCENE,
        schema: makeScenesSchema(S),
        schemaName: 'chapter_scenes',
        role: 'utility',
        sessionBudget,
        signal
      }).catch((err) => {
        rethrowIfFatal(err)
        console.warn(`[StoryDirector] scene re-plan for chapter ${index + 1} failed:`, err)
        return null
      })
      if (Array.isArray(replanned?.scenes) && replanned.scenes.length > 0) {
        ch.scenes = replanned.scenes
      }
    })
    await runWithConcurrency(retryTasks, planConcurrency())
    degradation.repetitiveChapters = findRepetitiveChapters(chapters).length
  }

  return { chapters, storyArc, degradation }
}

/** Words that carry meaning for comparing two scene beats. */
function beatWords(text: unknown): Set<string> {
  const STOP = new Set(
    'the a an of to in on at and or but is are was were be been being for with from by as that this it its her his she he they them their who what which into out up down over about begins begin starts start becomes become aware realizes realize decides decide feels feel'.split(
      ' '
    )
  )
  // Crude stemming, enough that "chooses"/"choosing" and "belong"/"belongs"
  // count as the same word — inflection is not a different event.
  const stem = (w: string) =>
    w.length > 5 ? w.replace(/(ing|ies|ed|es|s)$/, '') : w.length > 3 ? w.replace(/s$/, '') : w
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem)
  )
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const w of a) if (b.has(w)) inter++
  return inter / (a.size + b.size - inter)
}

/** Chapters whose goal repeats an earlier chapter's, each with the chapter it copies. */
/**
 * Verbs that describe a mind rather than an event. An event built on one of
 * these gives the scene planner nothing to stage; the writer then pads.
 */
const INTERIOR_EVENT_RE =
  /\b(reflect(s|ed|ing)?|gaz(es|ed|ing)|consider(s|ed|ing)?|contemplat(es|ed|ing)|ponder(s|ed|ing)?|wonder(s|ed|ing)?|prepar(es|ed|ing)( herself| himself| themselves)?|decid(es|ed|ing)|resolv(es|ed|ing)|vow(s|ed|ing)?|realiz(es|ed|ing)|realis(es|ed|ing)|steel(s|ed|ing) (herself|himself)|brac(es|ed|ing) (herself|himself)|gather(s|ed|ing) ((her|his|their) )?(strength|courage|resolve|thoughts)|think(s|ing)? about|thought about|remember(s|ed|ing)?|recall(s|ed|ing)?|feel(s|ing)? the weight|weigh(s|ed|ing) (her|his|their) options)\b/i

/** True when an event is only something happening inside a character's head. */
export function isInteriorEvent(event: unknown): boolean {
  const text = String(event || '').trim()
  return text.length > 0 && INTERIOR_EVENT_RE.test(text)
}

/**
 * Chapters whose events are mostly interior — half or more, with at least two
 * events to judge. Returned as indices so the caller can re-ask for each.
 */
export function findInteriorChapters(chapters: any[]): number[] {
  const out: number[] = []
  ;(chapters || []).forEach((ch, index) => {
    const events = Array.isArray(ch?.events) ? ch.events.filter(Boolean) : []
    if (events.length < 2) return
    const interior = events.filter(isInteriorEvent).length
    if (interior * 2 >= events.length) out.push(index)
  })
  return out
}

export function findDuplicateChapterGoals(
  chapters: any[]
): Array<{ index: number; duplicateOf: number }> {
  const out: Array<{ index: number; duplicateOf: number }> = []
  const seen: Array<{ index: number; words: Set<string> }> = []
  ;(chapters || []).forEach((ch, index) => {
    const words = beatWords(`${ch?.goal || ''} ${ch?.revealed || ''}`)
    if (words.size >= 3) {
      const twin = seen.find((e) => jaccard(e.words, words) >= SCENE_REPEAT_THRESHOLD)
      if (twin) out.push({ index, duplicateOf: twin.index })
    }
    seen.push({ index, words })
  })
  return out
}

/** Two scene beats are "the same event" above this word-set overlap. */
export const SCENE_REPEAT_THRESHOLD = 0.5

/**
 * Chapters whose scenes repeat an earlier chapter's — by identical title, or
 * by a `whatChanges` that shares most of its meaningful words with an earlier
 * scene's. Returns each offender once with the repeats named, so a re-plan can
 * be told exactly what not to do.
 */
export function findRepetitiveChapters(
  chapters: any[]
): Array<{ index: number; repeats: Array<{ title: string; reason: string }> }> {
  const seenTitles = new Map<string, number>()
  const seenBeats: Array<{ words: Set<string>; chapter: number; title: string }> = []
  const offenders: Array<{ index: number; repeats: Array<{ title: string; reason: string }> }> = []
  ;(chapters || []).forEach((ch, index) => {
    const repeats: Array<{ title: string; reason: string }> = []
    for (const sc of ch?.scenes || []) {
      const title = String(sc?.title || '').trim()
      const key = title.toLowerCase()
      const words = beatWords(sc?.whatChanges || sc?.goal)
      // A repeated title only counts when the scene carries a real beat —
      // "Scene 3" / "S1" with nothing behind it is a placeholder, not a repeat
      // worth a model call.
      const generic = /^(scene|chapter|part|s)\s*\d*$/i.test(key) || words.size < 3
      if (key && !generic && seenTitles.has(key) && seenTitles.get(key) !== index) {
        repeats.push({
          title,
          reason: `same title as a scene in chapter ${seenTitles.get(key)! + 1}`
        })
      }
      const twin = seenBeats.find(
        (b) => b.chapter !== index && jaccard(b.words, words) >= SCENE_REPEAT_THRESHOLD
      )
      if (twin && words.size >= 3) {
        repeats.push({
          title,
          reason: `same event as "${twin.title}" in chapter ${twin.chapter + 1}`
        })
      }
    }
    // Register this chapter's scenes only after checking it, so a chapter is
    // never compared against itself.
    for (const sc of ch?.scenes || []) {
      const key = String(sc?.title || '')
        .trim()
        .toLowerCase()
      if (key && !seenTitles.has(key)) seenTitles.set(key, index)
      seenBeats.push({
        words: beatWords(sc?.whatChanges || sc?.goal),
        chapter: index,
        title: String(sc?.title || '')
      })
    }
    if (repeats.length > 0) offenders.push({ index, repeats })
  })
  return offenders
}

export function useStoryDirector() {
  const isPlanning = ref(false)
  const planError = ref<any>(null)
  let _sessionBudget: SessionBudget | null = null

  // `research` (optional, from the generator UI) scopes which imported research
  // documents inform the plan:
  //   { enabled?: boolean, documentIds?: number[] }
  // - enabled omitted → fall back to the global RESEARCH_ENABLED preference
  // - documentIds omitted/empty → use every document in the project (current behavior)
  // - documentIds set → restrict retrieval to exactly those documents
  // `onSkeletonReady` (optional) is invoked once the chapter skeleton exists and
  // before scenes are planned, with `{ chapters, storyArc }`. It may commit new
  // story entities and return a replacement system prompt (evidence) for scene
  // planning. Structured plans only — the unstructured path is a single call
  // with no seam to hook, and at its default 4k word target the opening cast is
  // already sized for the story.
  // `signal` (optional in the type, required in practice) is the `structure`
  // stage's abort signal. Planning is the longest chain of provider calls in the
  // run; without it the stage watchdog could declare the stage stuck and then
  // watch it go on issuing chapter after chapter against a provider slot the
  // next stage was already queued for.
  // `plotThreads` (optional) is the bible's thread catalog for scene
  // planning: [{ id, title }]. When present, the scene prompt carries the
  // catalog and the schema asks for per-scene `threadIds`; absent, neither
  // appears (today's behaviour). Callers pass storyBibleStore.plotThreads.
  async function generateStoryPlan({
    goal,
    evidence,
    onPartialData,
    onSkeletonReady,
    research,
    signal,
    plotThreads
  }: {
    goal: any
    evidence: any
    onPartialData: any
    onSkeletonReady?: any
    research: any
    signal?: AbortSignal
    plotThreads?: any[]
  }) {
    isPlanning.value = true
    planError.value = null

    try {
      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = projectStore.getActivePrompts(categoryType)

      const s = goal.structure
      const structureBlock = s
        ? `

### STRUCTURE REQUIREMENTS (MANDATORY — follow these numbers exactly)
- Produce EXACTLY ${s.chapters} chapters.${s.volumes > 1 ? ` These span ${s.volumes} volumes of ${s.chaptersPerVolume} chapters each, in order.` : ''}
- Each chapter must contain EXACTLY ${s.scenesPerChapter || 3} scenes.
- Target ${s.wordsPerChapter} words per chapter (~${Math.round(s.wordsPerChapter / (s.scenesPerChapter || 3))} words per scene).
- LINKAGE: every chapter MUST end with a "hookEnding" that sets up the next chapter, and each chapter's first scene must pick up directly from the previous chapter's hook so the chapters read as one continuous story.`
        : ''

      const userPrompt = `Plan a complete document structure based on this GOAL.

### GOAL
OBJECTIVE/PREMISE: "${goal.premise}"
DOCUMENT TYPE/GENRE: "${goal.genre || 'Standard'}"
TONE: "${goal.tone || 'Professional'}"
TARGET WORD COUNT: ${goal.wordTarget || 4000}${structureBlock}

Generate a complete plan as JSON with "chapters" array and "storyArc" object.`

      let baseDirectorPrompt = activePrompts.director
      if (goal.horizon === 'short_term') {
        baseDirectorPrompt = `You are a story architect and worldbuilder. Your task is to fulfill a targeted short-term GOAL based on the EVIDENCE provided.

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown, no explanation, no code fences.
The JSON must have a "chapters" array. Each chapter object must contain a "scenes" array with the scene details.`
      }

      // Same resolver the scene writer uses, so "which sources inform this run"
      // means one thing at plan time and write time.
      const { enabled: researchEnabled, documentIds: scopedDocIds } = resolveResearchScope(research)
      const selectedDocIds = scopedDocIds.length ? new Set(scopedDocIds.map(String)) : null
      let researchContext = ''
      if (researchEnabled) {
        try {
          let allChunks = await getAllChunksForProject(projectStore.currentProjectId)
          if (selectedDocIds) {
            allChunks = allChunks.filter((c: any) => selectedDocIds.has(String(c.documentId)))
          }
          // Bound the working set so ranking can't block the UI on a huge corpus.
          if (allChunks.length > LEXICAL_SCAN_CAP) {
            console.warn(
              `[StoryDirector] ${allChunks.length} research chunks exceeds scan cap; ranking first ${LEXICAL_SCAN_CAP}.`
            )
            allChunks = allChunks.slice(0, LEXICAL_SCAN_CAP)
          }
          if (allChunks.length > 0) {
            const count = Math.min(allChunks.length, RESEARCH_CHUNKS_DEFAULT)
            const queryText = `Premise: ${goal.premise}. Genre: ${goal.genre || 'Standard'}. Tone: ${goal.tone || 'Professional'}`
            const K = Math.max(10, count * 10)
            const lowerTexts = allChunks.map((c: any) => (c.text || '').toLowerCase())

            // Lexical ranking (TF-IDF), df computed once — O(N·tokens), not O(N²).
            const lexicalScores = rankChunksLexically(queryText, lowerTexts)
            const lexicalRanks = allChunks
              .map((c: any, i: number) => ({ chunk: c, score: lexicalScores[i] }))
              .sort((a: any, b: any) => b.score - a.score)
            const lexicalRankMap = new Map()
            lexicalRanks.forEach((item: any, rank: number) =>
              lexicalRankMap.set(item.chunk.id, rank + 1)
            )

            // Semantic ranking (best-effort)
            const semanticRankMap = new Map()
            try {
              const queryEmbedding = await getEmbedding(queryText)
              // Only chunks whose vector is finished AND lives in the query's
              // vector space. A half-indexed corpus (or one left over from a
              // different embedding model) used to contribute chunks that scored
              // 0 against every query and still occupied ranking slots.
              const withEmb = queryEmbedding
                ? allChunks.filter(
                    (c: any) =>
                      c.embedding &&
                      c.embedding.length === queryEmbedding.length &&
                      (!c.embeddingStatus || c.embeddingStatus === 'READY')
                  )
                : []
              if (withEmb.length > 0) {
                const scored = withEmb
                  .map((c: any) => ({
                    chunk: c,
                    score: cosineSimilarity(queryEmbedding as any, c.embedding as any)
                  }))
                  .sort((a: any, b: any) => b.score - a.score)
                scored.forEach((item: any, rank: number) =>
                  semanticRankMap.set(item.chunk.id, rank + 1)
                )
              }
            } catch {
              // semantic unavailable, lexical-only RRF
            }

            // RRF fusion with dynamic K
            const rrfScores = allChunks.map((chunk: any) => {
              const lr = lexicalRankMap.get(chunk.id) ?? Infinity
              const sr = semanticRankMap.get(chunk.id) ?? Infinity
              const rrf = 1 / (K + lr) + 1 / (K + sr)
              return { chunk, rrf }
            })
            const selected = rrfScores
              .sort((a: any, b: any) => b.rrf - a.rrf)
              .slice(0, count)
              .map((s: any) => s.chunk)

            // Label each excerpt with the document it came from. Unlabelled text
            // dropped into the system prompt reads as the planner's own
            // assumptions; a named source reads as material to plan *from*, and
            // it matches the [source:…] form the scene writer now receives.
            const titles = new Map<string, string>()
            try {
              const docs = await getAllResearchDocuments(projectStore.currentProjectId)
              for (const d of docs) titles.set(String(d.id), d.fileName || d.title || '')
            } catch {
              // Titles are a nicety; the excerpts still carry the content.
            }
            researchContext = selected
              .map((c: any) => {
                const source = titles.get(String(c.documentId)) || c.heading || 'unknown source'
                return `[source:${source}]\n${c.text}`
              })
              .join('\n\n---\n\n')
          }
        } catch {
          researchContext = ''
        }
      }

      const finalSystemPrompt = `${baseDirectorPrompt}\n\n${evidence}${researchContext ? `\n\n## Research Context\n${researchContext}` : ''}`

      let parsed: any
      if (goal.structure) {
        // Large structured plan: build it in small, reliable chunks
        parsed = await planChunked({
          goal,
          plotThreads,
          systemPrompt: finalSystemPrompt,
          onPartialData,
          // Evidence is everything after the base director prompt, so a refreshed
          // bible has to be re-wrapped the same way to keep research attached.
          onSkeletonReady: onSkeletonReady
            ? async (skeleton: any) => {
                const refreshed = await onSkeletonReady(skeleton)
                if (typeof refreshed !== 'string' || !refreshed.trim()) return null
                return `${baseDirectorPrompt}\n\n${refreshed}${researchContext ? `\n\n## Research Context\n${researchContext}` : ''}`
              }
            : undefined,
          sessionBudget: _sessionBudget,
          signal
        })
      } else {
        // Small/default plan: one streaming call with a non-streaming retry
        let accumulated = ''
        const emittedTitles = new Set()
        let scanOffset = 0

        await aiStream(
          userPrompt,
          finalSystemPrompt,
          (chunk) => {
            accumulated += chunk

            // Heartbeat on every chunk so the stage watchdog knows streaming is alive
            try {
              if (onPartialData) onPartialData('structure', 'streaming')
            } catch {
              // Best-effort heartbeat; a throwing consumer must not break streaming.
            }

            const regex = /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g
            regex.lastIndex = Math.max(0, scanOffset - 200)
            let match

            while ((match = regex.exec(accumulated)) !== null) {
              const title = match[1]
              if (!emittedTitles.has(title)) {
                emittedTitles.add(title)
                try {
                  if (onPartialData) onPartialData('scene', title)
                } catch {
                  // Best-effort progress callback; a throwing consumer must not break planning.
                }
              }
            }
            scanOffset = Math.max(0, accumulated.length - 200)
          },
          {
            feature: FEATURES.STORY_GENERATION,
            temperature: 0.7,
            // Bounded by silence, not by elapsed time: a stalled model still
            // fails fast, but one that is simply slow is allowed to finish.
            idleTimeout: PLAN_IDLE_TIMEOUT_MS,
            firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
            sessionBudget: _sessionBudget,
            signal
          }
        )

        // A stream cut short still holds most of the plan; repair it before
        // paying for a second full generation.
        parsed = sanitizeJson(accumulated) || repairTruncatedJson(accumulated)
        if (!parsed) {
          // The repair path is for a truncated stream, not a cancelled one — a
          // second full-length call is the last thing an abandoned stage should do.
          throwIfAborted(signal, 'Story planning cancelled')
          const retryResponse = await aiGenerate(userPrompt, finalSystemPrompt, {
            feature: FEATURES.STORY_GENERATION,
            temperature: 0.5,
            idleTimeout: PLAN_IDLE_TIMEOUT_MS,
            firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
            sessionBudget: _sessionBudget,
            signal
          })
          parsed = sanitizeJson(retryResponse) || repairTruncatedJson(retryResponse)
        }
      }

      if (!parsed) {
        throw new Error(
          'The planning model timed out or returned invalid JSON. Try fewer chapters, a smaller word target, or a larger/faster model.'
        )
      }

      const chapters = parsed.chapters || []
      const storyArc = parsed.storyArc || {}

      if (goal.horizon === 'long_term') {
        if (!Array.isArray(chapters) || chapters.length === 0) {
          throw new Error('Story plan has no chapters.')
        }
      }

      for (const chapter of chapters) {
        if (!chapter.emotionalTarget) chapter.emotionalTarget = 'Unspecified emotion'
        if (!chapter.scenes) chapter.scenes = []

        // Soft fallback for empty scenes
        if (chapter.scenes.length === 0) {
          chapter.scenes.push({
            sceneNumber: 1,
            title: 'Opening',
            arcPosition: 'setup',
            sceneFunction: 'setup',
            emotionalGoal: 'unknown',
            whatChanges: 'unknown',
            obstacle: 'unknown',
            charactersPresent: [],
            characterWants: {},
            location: '',
            setup: '',
            payoff: 'none',
            sensoryAnchor: '',
            tension: 'medium',
            pacing: 'medium',
            estimatedWords: 500
          })
        }

        if (!chapter.estimatedWords || chapter.estimatedWords < 1000) {
          chapter.estimatedWords = Math.max(
            1500,
            Math.floor((goal.wordTarget || 4000) / Math.max(1, chapters.length))
          )
        }

        for (const scene of chapter.scenes) {
          if (!scene.arcPosition) scene.arcPosition = 'setup'
          if (!scene.obstacle) scene.obstacle = 'Unspecified obstacle'
        }
      }

      const validatedChapters = chapters.map((c: any, i: number) => {
        return {
          chapterNumber: c.chapterNumber || i + 1,
          title: c.title || `Chapter ${i + 1}`,
          goal: c.goal || '',
          arcPosition: c.arcPosition || '',
          emotionalTarget: c.emotionalTarget || '',
          hookEnding: c.hookEnding || '',
          // The progression contract the skeleton decided (what this chapter
          // reveals, how things stand after it, its events one per scene).
          // This re-shape used to drop them here, so the spine, the writer and
          // the plan preview never saw them — every chapter read as "she
          // begins to suspect" again because nothing downstream knew what had
          // already happened.
          revealed: c.revealed || '',
          stateAfter: c.stateAfter || '',
          events: Array.isArray(c.events) ? c.events.filter(Boolean) : [],
          storyFunction: c.storyFunction || '',
          ...(c.partOf ? { partOf: c.partOf, partNumber: c.partNumber } : {}),
          estimatedWords: c.estimatedWords || 7000,
          scenes: (c.scenes || []).map((s: any, j: number) => ({
            sceneNumber: s.sceneNumber || j + 1,
            title: s.title || `Scene ${j + 1}`,
            emotionalGoal: s.emotionalGoal || '',
            whatChanges: s.whatChanges || '',
            obstacle: s.obstacle || '',
            sceneFunction: s.sceneFunction || s.arcPosition || 'setup',
            charactersPresent: Array.isArray(s.charactersPresent) ? s.charactersPresent : [],
            threadIds: Array.isArray(s.threadIds)
              ? s.threadIds.filter((t: any) => typeof t === 'string')
              : [],
            characterWants:
              s.characterWants && typeof s.characterWants === 'object' ? s.characterWants : {},
            // This mapper rebuilds scenes field by field, so anything not named
            // here is dropped in transit no matter what the schema asked for.
            // That is how `pov` stayed undefined all the way to the writer even
            // once the director started emitting it.
            pov: s.pov || s.povCharacter || '',
            location: s.location || '',
            setup: s.setup || '',
            payoff: s.payoff || 'none',
            sensoryAnchor: s.sensoryAnchor || '',
            arcPosition: [
              'setup',
              'obstacle',
              'turn',
              'resolution',
              'hook',
              'opening',
              'rising',
              'climax',
              'falling'
            ].includes(s.arcPosition)
              ? s.arcPosition
              : 'setup',
            tension: ['low', 'medium', 'high', 'peak'].includes(s.tension) ? s.tension : 'medium',
            pacing: ['slow', 'medium', 'fast'].includes(s.pacing) ? s.pacing : 'medium',
            estimatedWords:
              typeof s.estimatedWords === 'number'
                ? s.estimatedWords
                : Math.round(c.estimatedWords / Math.max(c.scenes.length, 1))
          }))
        }
      })

      // Honor the user's exact volumes/chapters/words request if one was given
      const finalChapters = goal.structure
        ? enforceStructure(validatedChapters, goal.structure)
        : validatedChapters
      const flatScenes = finalChapters.flatMap((c: any) => c.scenes)

      // The plan names characters and locations the writer will be held to,
      // so phantom entities are caught here rather than scene by scene.
      await guardPlan({ plan: { chapters: finalChapters, scenes: flatScenes } })

      return {
        chapters: finalChapters,
        scenes: flatScenes,
        // What the plan had to invent. Always present, so a consumer can read it
        // without checking which planning path ran; zeroes mean a clean plan.
        degradation: {
          paddedChapters: parsed?.degradation?.paddedChapters || 0,
          chaptersWithoutScenePlan: parsed?.degradation?.chaptersWithoutScenePlan || 0,
          duplicateTitles: parsed?.degradation?.duplicateTitles || 0,
          quotaViolations: parsed?.degradation?.quotaViolations || 0,
          repetitiveChapters: parsed?.degradation?.repetitiveChapters || 0,
          duplicateChapterGoals: parsed?.degradation?.duplicateChapterGoals || 0
        },
        storyArc: {
          premise: storyArc.premise || goal.premise,
          // The AUTHOR'S setting wins; the model may only fill a gap.
          //
          // This was the other way round, and the model's echo is what every
          // downstream prose call reads (useStoryWriter reads storyArc.genre for
          // both the persona block and the scene prompt). So a model that
          // compressed "Dark Fantasy / grim, brutal, psychological" to "Fantasy"
          // silently rewrote the book's identity for every remaining chapter,
          // with the author's actual choice demoted to a fallback that only
          // applied if the model omitted the field entirely.
          genre: goal.genre || storyArc.genre || 'Literary',
          tone: goal.tone || storyArc.tone || 'Atmospheric',
          emotionalJourney: storyArc.emotionalJourney || '',
          centralConflict: storyArc.centralConflict || '',
          resolution: storyArc.resolution || '',
          totalChapters: finalChapters.length,
          totalScenes: flatScenes.length,
          totalEstimatedWords: finalChapters.reduce(
            (sum: number, c: any) => sum + (c.estimatedWords || 0),
            0
          )
        }
      }
    } catch (err: any) {
      planError.value = err.message || 'Story planning failed'
      throw err
    } finally {
      isPlanning.value = false
    }
  }

  return {
    generateStoryPlan,
    isPlanning,
    planError,
    get sessionBudget() {
      return _sessionBudget
    },
    set sessionBudget(v: SessionBudget | null) {
      _sessionBudget = v
    }
  }
}

export { sanitizeJson, enforceStructure }
// Exported for unit tests and for scripts/verify-title-variety.mjs, so the live
// probe scores titles with the same shape logic the prompt is built from rather
// than a copy that can drift.
export {
  titleShape,
  planTitleRepairs,
  satisfiesForm,
  overusedShapes,
  buildTitleVarietyBlock,
  buildSkeletonPrompt,
  assembleTitle,
  makeSkeletonSchema,
  SKELETON_BATCH_SIZE,
  TOKENS_PER_CHAPTER_STUB,
  STORY_ARC_TOKENS,
  SHAPE_BUDGET
}
