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
  /** Filled in by the write step. */
  outcome?: 'written' | 'failed' | 'kept' | 'repaired' | 'needs review' | 'dropped'
}

export interface WhatIfPlan {
  premise: string
  /** The change, stated as a fact every later scene must respect. */
  divergenceFact: string
  divergence: BranchScene
  scenes: PlannedScene[]
}

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    divergenceFact: { type: 'string' },
    divergenceBrief: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneNumber: { type: 'number' },
          action: { type: 'string', enum: ['keep', 'revise', 'drop'] },
          brief: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['sceneNumber', 'action']
      }
    }
  },
  required: ['divergenceFact', 'divergenceBrief', 'scenes']
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

export function planPrompt(args: {
  bookTitle: string
  premise: string
  before: BranchScene[]
  divergence: BranchScene
  later: BranchScene[]
}): string {
  const later = args.later
    .map(
      (s) =>
        `${s.sceneNumber}. [${s.chapterTitle}] "${s.title}": ${clip(s.summary || '(not summarised)', 45)}`
    )
    .join('\n')
  return `BOOK: ${args.bookTitle}

THE STORY UP TO THE CHANGE:
${storySoFar(args.before)}

THE SCENE WHERE IT CHANGES (scene ${args.divergence.sceneNumber}, "${args.divergence.title}"):
${args.divergence.summary || '(not summarised)'}

WHAT IF: ${args.premise}

THE SCENES THAT FOLLOW IN THE BOOK AS WRITTEN:
${later || '(none: this is the last scene)'}

Plan the alternate version:
- "divergenceFact": the change as one plain fact that is now true (e.g. "Mattie stays at the farm; Zeena leaves for Bettsbridge alone.").
- "divergenceBrief": what scene ${args.divergence.sceneNumber} must now show, in 1-2 sentences.
- "scenes": one entry for EVERY scene listed above, by its number:
  - "keep" if the scene can stay as written (the change does not reach it);
  - "revise" if it must change, with "brief": what it must now show, in 1-2 sentences;
  - "drop" if it can no longer happen at all.
  Give a short "reason" for each. Change only what the change forces.`
}

/**
 * The model's plan made complete and safe: every later scene gets exactly one
 * decision (a missing or unreadable one is `keep` -- the book as written is
 * the default, and the author sees and can change every row); the scene of
 * the change is always rewritten; a `revise` with no brief gets one built from
 * the scene's own summary and the change.
 */
export function cleanPlan(
  raw: unknown,
  premise: string,
  divergence: BranchScene,
  later: BranchScene[]
): WhatIfPlan {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const fact = str(r.divergenceFact) || premise
  const byNumber = new Map<number, Record<string, unknown>>()
  for (const x of Array.isArray(r.scenes) ? r.scenes : []) {
    const item = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    const n = Number(item.sceneNumber)
    if (Number.isFinite(n) && !byNumber.has(n)) byNumber.set(n, item)
  }
  const fallbackBrief = (s: BranchScene) =>
    `${s.summary || s.title} -- rewritten so it follows from: ${fact}`
  const scenes: PlannedScene[] = later.map((s) => {
    const item = byNumber.get(s.sceneNumber) || {}
    const action = (['keep', 'revise', 'drop'] as const).find((a) => a === item.action) || 'keep'
    return {
      ...s,
      action,
      brief: action === 'revise' ? str(item.brief) || fallbackBrief(s) : '',
      reason:
        str(item.reason) || (byNumber.has(s.sceneNumber) ? '' : 'not planned; kept as written')
    }
  })
  return {
    premise,
    divergenceFact: fact,
    divergence: divergence,
    scenes: [
      {
        ...divergence,
        action: 'revise',
        brief: str(r.divergenceBrief) || `${premise}. ${fallbackBrief(divergence)}`,
        reason: 'the scene where the story changes'
      },
      ...scenes
    ]
  }
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
