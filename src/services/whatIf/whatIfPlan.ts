/**
 * The pure part of a What If (WHATIF-AND-IMPORT-PLAN.md, step 4): what the
 * model is asked, how its plan is made complete and safe, and the canon the
 * writer gets -- the story as it stood BEFORE the change, never after it.
 *
 * The old branch mode rewrote the whole book from the whole book's notes, so
 * the "canon" it was told not to contradict included the future the change was
 * meant to replace.
 */
import { escapeHtml } from '../import/blocks'

export type SceneAction = 'keep' | 'revise' | 'drop'

export interface BranchScene {
  /** The scene's id in the branch. */
  subsectionId: string | number
  /** The scene it was copied from (merge target). */
  sourceSubsectionId: string | number | null
  sceneNumber: number
  chapterNumber: number
  chapterTitle: string
  title: string
  /** What happens in it, from its digest or summary column ('' if never read). */
  summary: string
  keyFacts: string[]
}

export interface PlannedScene extends BranchScene {
  action: SceneAction
  /** For `revise`: what the scene must now do. */
  brief: string
  reason: string
  /** Missing events the who-is-where check found in this scene (§39). */
  presenceIssues?: Array<{ who: string; sentence: string; fact: string; fromKept?: boolean }>
  /**
   * Where each tracked person was last shown before this scene, as the
   * who-is-where walk found it: lets one rewritten scene be checked again
   * without re-reading every scene before it.
   */
  lastSeen?: Record<
    string,
    { present: boolean; where: string; scene: string; kept?: boolean } | null
  >
  /** The scene's text before "Rewrite this scene", for undo (§40). */
  previousContent?: string
  /** Filled in by the write step. */
  outcome?:
    | 'written'
    | 'written, repaired'
    | 'written, needs review'
    | 'failed'
    | 'kept'
    | 'repaired'
    | 'needs review'
    | 'dropped'
}

export interface WhatIfPlan {
  premise: string
  /** The change, stated as a fact every later scene must respect. */
  divergenceFact: string
  divergence: BranchScene
  scenes: PlannedScene[]
}

export const PLAN_SYSTEM =
  'You are a story editor planning an alternate version of a novel. You change only what the ' +
  'change forces, and keep everything else. Return ONLY valid JSON.'

const clip = (s: string, words: number) => {
  const w = String(s || '')
    .split(/\s+/)
    .filter(Boolean)
  return w.length > words ? w.slice(0, words).join(' ') + '…' : w.join(' ')
}

/** The story up to the change, in the fewest words that still carry it. */
export function storySoFar(before: BranchScene[], maxFacts = 15): string {
  const byChapter = new Map<number, { title: string; lines: string[] }>()
  for (const s of before) {
    if (!byChapter.has(s.chapterNumber))
      byChapter.set(s.chapterNumber, { title: s.chapterTitle, lines: [] })
    if (s.summary) byChapter.get(s.chapterNumber)!.lines.push(s.summary)
  }
  const chapters = [...byChapter.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, c]) => `Chapter ${n} (${c.title}): ${clip(c.lines.join(' '), 90)}`)
  const facts = [...new Set(before.flatMap((s) => s.keyFacts))].slice(-maxFacts)
  return [
    chapters.length ? chapters.join('\n') : '(the change happens in the opening scene)',
    facts.length ? `\nESTABLISHED BY THEN:\n${facts.map((f) => `- ${f}`).join('\n')}` : ''
  ].join('')
}

// ── the per-scene planner (what runs on a local model) ─────────────────────
//
// One call planning every later scene at once was the first live attempt on
// Ethan Frome: an 8B model dropped every scene after the change and wrote a
// brief ("free from Zeena's presence") that contradicted the change it had
// just stated. The gate work found the same: one small question per call
// beats one big judgement (§16-17). So: the change first, then one question
// per scene, then a brief only for the scenes that change.
//
// The per-scene question is answered reason-first (what the scene needs, what
// the change makes false, then the decision) and NOT as a one-letter choice
// read from probabilities: on the live read the one-letter version said
// "keep" with probability 1.00 for every scene -- including the evening that
// only happens because Zeena is away -- and kept saying it when the options
// were reordered. A look-up question ("do these two quotes contradict?")
// works as one token (§33); this one needs a step of reasoning first.

export const DIVERGENCE_SCHEMA = {
  type: 'object',
  properties: { divergenceFact: { type: 'string' }, divergenceBrief: { type: 'string' } },
  required: ['divergenceFact', 'divergenceBrief']
}

export function divergencePrompt(args: {
  bookTitle: string
  premise: string
  before: BranchScene[]
  divergence: BranchScene
}): string {
  return `BOOK: ${args.bookTitle}

THE STORY SO FAR:
${storySoFar(args.before)}

THE SCENE WHERE IT CHANGES ("${args.divergence.title}", ${args.divergence.chapterTitle}):
${args.divergence.summary || '(not summarised)'}

WHAT IF: ${args.premise}

- "divergenceFact": the change as one plain fact that is now true from this scene on: only what is different, in the premise's own terms. Do not add consequences.
- "divergenceBrief": what this scene must now show, in 1-2 sentences, given that fact.`
}

/** "What if Zeena stays home?" -> "Zeena stays home." : the author's premise as a statement. */
export function premiseAsFact(premise: string): string {
  const t = premise
    .trim()
    .replace(/^what\s+if\s+/i, '')
    .replace(/\?+\s*$/, '')
    .trim()
  if (!t) return premise.trim()
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!]$/.test(t) ? '' : '.')
}

const FACT_STOPWORDS = new Set(
  'what when where which while with would could should there their them they this that than then have been were from into onto upon about after before never ever also only just even still some'.split(
    ' '
  )
)
const contentWords = (s: string) =>
  new Set((s.toLowerCase().match(/[a-zÀ-ɏ]{4,}/g) || []).filter((w) => !FACT_STOPWORDS.has(w)))

/**
 * The change as the writer and the checker will hold it. The model's
 * one-line version is used only if it keeps most of the premise's own words;
 * otherwise the premise itself, as a statement. On the live read the model
 * turned "stays home the night Ethan and Mattie were to be alone" into "stays
 * home instead of going to Bettsbridge" -- and against that, chapter VIII's
 * "after Zeena left" was not a contradiction the checker would call.
 */
export function chooseDivergenceFact(modelFact: string | undefined, premise: string): string {
  const fromPremise = premiseAsFact(premise)
  const fact = (modelFact || '').trim()
  if (!fact) return fromPremise
  const want = contentWords(premise)
  if (!want.size) return fact
  const have = contentWords(fact)
  const kept = [...want].filter((w) => have.has(w)).length / want.size
  return kept >= 0.7 ? fact : fromPremise
}

export const FATE_SCHEMA = {
  type: 'object',
  properties: {
    needs: { type: 'string' },
    conflict: { type: 'string' },
    action: { type: 'string', enum: ['keep', 'revise', 'drop'] }
  },
  required: ['needs', 'conflict', 'action']
}

/**
 * Whether the change reaches one ORIGINAL scene. It sees the change and the
 * scene only -- not the alternate version so far: on the live read one odd
 * brief ("Zeena remains awake and present") leaked into every later reason.
 */
export function sceneFatePrompt(args: { divergenceFact: string; scene: BranchScene }): string {
  return `In an alternate version of a novel, one thing changed: ${args.divergenceFact}

A scene from the ORIGINAL book ("${args.scene.title}", ${args.scene.chapterTitle}):
${args.scene.summary || args.scene.title}

Answer in order:
- "needs": what this scene needs to be true (who is where, who knows what, what has happened).
- "conflict": which of those the change makes false, or "none".
- "action": "keep" if the conflict is none; "revise" if the scene can still happen in a changed form (prefer this); "drop" only if nothing in it can happen at all.`
}

/** A scene's fate from the model's reason-first answer; null when it gave none. */
export function decideFate(answer: unknown): { action: SceneAction; reason: string } | null {
  const a = (answer && typeof answer === 'object' ? answer : null) as Record<string, unknown> | null
  if (!a) return null
  const conflict = typeof a.conflict === 'string' ? a.conflict.trim() : ''
  const none = !conflict || /^(none|no conflict|nothing)\b/i.test(conflict)
  const action = (['keep', 'revise', 'drop'] as const).find((x) => x === a.action)
  if (!action) return null
  // A decision that contradicts its own reason follows the reason.
  if (none) return { action: 'keep', reason: 'the change does not reach it' }
  return { action: action === 'keep' ? 'revise' : action, reason: conflict }
}

export const BRIEF_SCHEMA = {
  type: 'object',
  properties: { brief: { type: 'string' } },
  required: ['brief']
}

/**
 * A changed scene's new brief, from the change and the ORIGINAL scene only.
 * On the live read, any view of the alternate version so far -- all of it,
 * or just the last three scenes marked "do not repeat" -- made an 8B model
 * write every brief from chapter V on as a copy of the first one ("a charged,
 * intimate moment in the kitchen"). Without it, each brief grew out of its own
 * scene (the hired girl, the money, Mattie leaving alone). Continuity between
 * scenes is the writer's job: it writes each one against the prose before it.
 */
export function sceneBriefPrompt(args: { divergenceFact: string; scene: BranchScene }): string {
  return `In an alternate version of a novel, one thing changed: ${args.divergenceFact}

THIS SCENE IN THE ORIGINAL BOOK ("${args.scene.title}", ${args.scene.chapterTitle}):
${args.scene.summary || args.scene.title}

"brief": 1-2 sentences: what this scene shows in the alternate version. Keep its own events, place and people from the original wherever the change allows, and change only what the change forces. It must agree with the change (if someone stayed, they are there).`
}

/**
 * What the writer is told is canon for the branch: the story up to the change,
 * the change itself as a fact, and nothing from after it.
 */
export function branchCanon(plan: WhatIfPlan, before: BranchScene[]): string {
  return `STORY CANON FOR THIS VERSION (everything up to the change, and the change itself):

${storySoFar(before, 25)}

THE CHANGE -- this is now true, and every later scene follows from it:
${plan.divergenceFact}`
}

/**
 * The brief for "Rewrite this scene" (§40): what the scene is for, plus every
 * missing event the who-is-where check found, as a rule the writer must hold.
 * A one-sentence repair could not fix these (it kept the absence in new
 * words); the whole scene is written again knowing the person never left.
 */
export function rewriteBrief(scene: PlannedScene): string {
  const base =
    (scene.action === 'revise' && scene.brief.trim()) ||
    scene.summary.trim() ||
    `The scene "${scene.title}" of ${scene.chapterTitle}.`
  // A flag whose last sighting is a kept scene is not a rule for this scene:
  // the kept scene may be the one that is wrong (§42).
  const byWho = new Map(
    (scene.presenceIssues || []).filter((p) => !p.fromKept).map((p) => [p.who, p])
  )
  const rules = [...byWho.values()].map(
    (p) =>
      `- ${p.fact} So in this scene ${p.who} is not gone, absent or returning: keep ${p.who} where the story left them, or show ${p.who} leave.`
  )
  return rules.length ? `${base}\nMUST HOLD:\n${rules.join('\n')}` : base
}

/**
 * Put `replacement` where `sentence` stands in a scene's HTML. The sentence
 * is matched on its plain text; a sentence broken by inline markup (an <em>
 * inside it) is not found, and the caller marks the scene for review rather
 * than guessing. An empty replacement deletes the sentence.
 */
export function replaceSentenceInHtml(
  html: string,
  sentence: string,
  replacement: string
): { html: string; replaced: boolean } {
  const target = sentence.trim()
  if (!target) return { html, replaced: false }
  for (const form of [escapeHtml(target), target]) {
    const at = html.indexOf(form)
    if (at >= 0) {
      const after = replacement.trim() ? escapeHtml(replacement.trim()) : ''
      let out = html.slice(0, at) + after + html.slice(at + form.length)
      if (!after) out = out.replace(/ {2,}/g, ' ').replace(/<p>\s*<\/p>/g, '')
      return { html: out, replaced: true }
    }
  }
  return { html, replaced: false }
}
