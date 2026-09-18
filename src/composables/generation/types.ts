/**
 * The shapes that cross the generation seam: planner → writer → gate → commit.
 *
 * These were `any` at every boundary, so a field renamed in the planner
 * (`characters` vs `charactersPresent`, `change` vs `whatChanges`) reached the
 * writer as `undefined` with nothing objecting. The optional fields here are
 * the ones some path really leaves empty; the writer defaults them. Fields
 * carried by one strategy only are still optional rather than a union, so a
 * brief from any planner is a `SceneBrief`.
 */

export interface SceneBrief {
  /** Plan-local id; the committed scene's subsection id is separate. */
  id?: string | number
  title?: string
  /** 1-based across the run. */
  sceneNumber?: number
  /** 0-based position in the plan. */
  sceneIndex?: number
  /** Which chapter (0-based) and how many the plan has. */
  sectionIndex?: number
  totalSections?: number
  /** 'opening' | 'middle' | 'closing' — where the scene sits in its chapter. */
  sectionRole?: string
  chapterTitle?: string
  /** The target the writer honours (85–130 % band). */
  estimatedWords?: number
  pov?: string
  location?: string
  /** Older planners wrote `characters`; newer ones `charactersPresent`. Readers take either. */
  characters?: string[]
  charactersPresent?: string[]
  goal?: string
  obstacle?: string
  /** Older planners wrote `change`; newer ones `whatChanges`. */
  change?: string
  whatChanges?: string
  emotionalGoal?: string
  characterWants?: string
  tension?: string
  pacing?: string
  arcPosition?: string
  toneNote?: string
  sensoryAnchor?: string
  setup?: string
  payoff?: string
  /** Free-form brief text some continuation paths carry instead of fields. */
  brief?: string
  /** Set once the plan is committed: where the prose lands. */
  subsectionId?: string | number
}

export interface StoryArc {
  genre?: string
  tone?: string
  centralConflict?: string
  premise?: string
  themes?: string[]
  [key: string]: unknown
}

/** What the writer hands back for one scene. */
export interface WrittenScene {
  prose: string
  structured: Record<string, unknown> & { prose?: string }
}

/** Stream callback from the writer: the chunk and the scene so far. */
export type ChunkHandler = (chunk: string, soFar: string) => void

/**
 * What the quality gate hands back for one scene. `chosenProse` is never
 * empty on a normal return (a scene that failed every attempt still commits
 * its best try as `review`); `gateFailure` names why the gate gave up.
 */
export interface GatedScene {
  chosenProse: string
  chosenStructured: Record<string, unknown> | null
  chosenEval: Record<string, unknown> | null
  gateFailure?: string | null
}

/**
 * The critic's verdict on one draft, as the gate consumes it. Everything is
 * optional because a parse failure yields `{ evalUnavailable: true }` and the
 * gate must still make a decision.
 */
export interface CriticVerdict {
  score?: number | null
  pass?: boolean
  evalUnavailable?: boolean
  dimensionScores?: Record<string, number> | null
  issues?: Array<{ severity?: string; type?: string; description?: string; text?: string }>
  verdictReason?: string
  [extra: string]: unknown
}

/** One writer attempt before the gate has looked at it. */
export interface DraftedScene {
  prose: string
  structured: (Record<string, unknown> & { metadataStatus?: string; keyFacts?: unknown[] }) | null
}

/** Arguments to the gated writer, one scene at a time. */
export interface WriteSceneWithGateArgs {
  scene: SceneBrief
  sceneIndex: number
  /** Activity-log phase id for this scene. */
  scenePhase?: number | string
  storyArc: StoryArc | null | undefined
  chapterLog?: string
  storyBible?: string
  storyContract?: string
  existingEntitiesJson?: string
  embeddingContext?: string
  extraRejected?: string[]
  pastEvalResults?: string | null
  focusInstructions?: string
  anchorRole?: string
  anchorConstraints?: string
  emitChunk?: (chunk: string, soFar: string) => void
}
