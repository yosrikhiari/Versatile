/**
 * Working out what a continuation run should do, from what is already on disk.
 *
 * A first-pass run knows its own plan: the director just produced it and every
 * scene brief is in memory. A continuation run has none of that. It arrives at a
 * project that may have been generated weeks ago, half-written, hand-edited, and
 * whose in-memory plan is long gone — and it has to decide, from the manuscript
 * alone, which scenes still need prose and what each one was supposed to be.
 *
 * That reconstruction is pure and DB-shaped, so it lives here where it can be
 * reasoned about (and tested) without a model, a store, or a running pipeline.
 */

/** A scene whose subsection holds fewer words than this is treated as a stub. */
export const SHORT_SCENE_WORDS = 250

export interface ManuscriptScene {
  subsectionId: any
  sectionId: any
  /** Position within the whole manuscript, in reading order. */
  index: number
  title: string
  /** The planner's one-line brief, stored at plan time. */
  brief: string
  prose: string
  wordCount: number
  contentStatus: string
  sceneNumber: number
  /** Title of the chapter this scene belongs to. */
  chapterTitle: string
  chapterSummary: string
}

export interface ContinuationSurvey {
  chapters: number
  scenes: ManuscriptScene[]
  written: ManuscriptScene[]
  unwritten: ManuscriptScene[]
  short: ManuscriptScene[]
  totalWords: number
}

function wordsIn(html: unknown): number {
  const text = String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return text ? text.split(/\s+/).length : 0
}

function hasProse(sub: any): boolean {
  return wordsIn(sub?.content) > 0
}

/**
 * Flatten a project's sections and subsections into reading-ordered scenes.
 *
 * Order matters more than it looks: continuation prose is written against the
 * scenes around it, so a scene handed the wrong neighbours contradicts the book
 * it is supposed to be joining.
 */
export function surveyManuscript(sections: any[], subsections: any[]): ContinuationSurvey {
  const ordered = [...(sections || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
  const scenes: ManuscriptScene[] = []

  for (const section of ordered) {
    const subs = (subsections || [])
      .filter((s: any) => s.sectionId === section.id)
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))

    for (const sub of subs) {
      scenes.push({
        subsectionId: sub.id,
        sectionId: section.id,
        index: scenes.length,
        title: sub.title || `Scene ${sub.sceneNumber || scenes.length + 1}`,
        brief: sub.description || '',
        prose: sub.content || '',
        wordCount: sub.wordCount || wordsIn(sub.content),
        contentStatus: sub.contentStatus || (hasProse(sub) ? 'generated' : 'pending'),
        sceneNumber: sub.sceneNumber || scenes.length + 1,
        chapterTitle: section.title || '',
        chapterSummary: section.summary || ''
      })
    }
  }

  const written = scenes.filter((s) => s.wordCount > 0)
  return {
    chapters: ordered.length,
    scenes,
    written,
    unwritten: scenes.filter((s) => s.wordCount === 0),
    // Written, but so thin it reads as a stub rather than a scene. These are the
    // ones "expand" exists for, and they are invisible in a plain written/unwritten
    // split — which is how a book of 40-word scenes passes for a finished draft.
    short: written.filter((s) => s.wordCount < SHORT_SCENE_WORDS),
    totalWords: scenes.reduce((sum, s) => sum + s.wordCount, 0)
  }
}

/**
 * Rebuild a writable scene brief for a scene that has none in memory.
 *
 * Two sources, in order of fidelity:
 *
 * 1. A checkpointed plan, matched on `subsectionId`. This is the planner's own
 *    structured brief — emotional goal, cast, setup/payoff, POV — and is exactly
 *    what the first pass would have written from.
 * 2. The manuscript row itself. `description` holds the one-line brief stored at
 *    plan time, which is lossy but real; the chapter title and summary supply the
 *    surrounding intent.
 *
 * Falling back rather than refusing matters: a project whose checkpoint was
 * cleared on completion still deserves to be continuable.
 */
export function briefForScene(
  scene: ManuscriptScene,
  checkpointPlan: any[] | null | undefined,
  targetWords: number
): any {
  const planned = (checkpointPlan || []).find((p: any) => p && p.subsectionId === scene.subsectionId)
  if (planned) {
    return { ...planned, estimatedWords: planned.estimatedWords || targetWords }
  }

  // The `goal`/`obstacle` shape, not the `emotionalGoal` one — the writer keys
  // its brief rendering off `emotionalGoal !== undefined`, and claiming a
  // structured brief we do not have would send empty fields as instructions.
  return {
    sceneNumber: scene.sceneNumber,
    title: scene.title,
    goal: scene.brief || scene.title,
    obstacle: '',
    characters: [],
    location: '',
    change: '',
    toneNote: '',
    estimatedWords: targetWords,
    // Chapter framing, so a reconstructed scene still knows what it is part of.
    chapterTitle: scene.chapterTitle
  }
}

/**
 * Prose the model should read before writing at `index`.
 *
 * Continuation is only worth anything if the new text joins the old text, so the
 * scene immediately before is always included when it exists; the rest of the
 * budget goes to the most recent prose before that.
 */
export function neighbourContext(
  survey: ContinuationSurvey,
  index: number,
  maxScenes = 3,
  maxCharsPerScene = 1200
): string {
  const before = survey.scenes
    .slice(0, index)
    .filter((s) => s.wordCount > 0)
    .slice(-maxScenes)

  if (before.length === 0) return ''

  const parts = before.map((s) => {
    const text = String(s.prose)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // The tail, not the head: what a scene has to continue from is how the
    // previous one ended.
    const excerpt =
      text.length > maxCharsPerScene
        ? '…' + text.slice(text.length - maxCharsPerScene).replace(/^\S*\s/, '')
        : text
    return `[${s.chapterTitle} — "${s.title}"]\n${excerpt}`
  })

  return 'IMMEDIATELY PRECEDING PROSE (this is already written and is canon — continue from it):\n' + parts.join('\n\n')
}

export interface ContinuationReport {
  written: number
  failed: number
  skipped: number
  words: number
  /** Set when the run ended before finishing everything it set out to do. */
  stoppedBy?: string
  /** Scenes it did not get to, so the caller can say so honestly. */
  remaining: number
}

export function emptyReport(): ContinuationReport {
  return { written: 0, failed: 0, skipped: 0, words: 0, remaining: 0 }
}

/** One line the UI can show without having to know the pipeline's vocabulary. */
export function describeReport(report: ContinuationReport): string {
  const parts = [`${report.written} scene(s) written`]
  if (report.words) parts.push(`${report.words.toLocaleString()} words`)
  if (report.failed) parts.push(`${report.failed} failed`)
  if (report.remaining) parts.push(`${report.remaining} not reached`)
  const summary = parts.join(' · ')
  return report.stoppedBy ? `${summary} — stopped: ${report.stoppedBy}` : summary
}
