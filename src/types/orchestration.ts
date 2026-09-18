/**
 * Shapes shared by the Editor agent (`composables/useStoryEditor.ts`), the
 * LangGraph writing strategy and the Orchestration store/panel. They live here
 * rather than in the composable so a store can import them without importing
 * a composable (the layering rule in eslint.config.js).
 */
/** What the graph knows about one scene, as the Editor sees it. */
export interface EditorSceneSummary {
  index: number
  title: string
  /** planned → drafting → drafted → critiquing → critiqued → committed */
  status: 'planned' | 'drafting' | 'drafted' | 'critiquing' | 'critiqued' | 'committed' | 'failed'
  attempts: number
  score: number | null
  pass: boolean | null
  continuity: number | null
  topIssues: string[]
  gateFailure: string | null
}

export interface EditorBudget {
  maxAttempts: number
  lookahead: number
  /** The session budget's current warning ("Soft token cap reached"), if any. */
  budgetNote: string | null
}

export interface EditorState {
  scenes: EditorSceneSummary[]
  budget: EditorBudget
  /** Whether a Writer / Critic call is in flight right now (one per lane). */
  gpuBusy: boolean
  cpuBusy: boolean
  /** The last few decisions, newest last. */
  recent: EditorDecision[]
}

export type EditorActionName = 'draft' | 'critique' | 'revise' | 'commit' | 'stop' | 'wait'

export interface EditorAction {
  action: EditorActionName
  /** Scene index the action applies to; null for `stop` / `wait`. */
  target: number | null
  /** Free-text guidance for `revise`, injected as focus instructions. */
  instructions?: string
}

export interface EditorDecision {
  /** One action per lane; `wait` means "nothing to do on this lane this step". */
  gpu: EditorAction
  cpu: EditorAction
  why: string
  /** Who made it: the model, the workflow policy, or the fallback after a rejected model answer. */
  source: 'model' | 'workflow' | 'fallback'
  /** The model's raw answer when it was rejected, for the decision log. */
  rejected?: { raw: unknown; reason: string }
}

export interface LegalMoves {
  gpu: EditorAction[]
  cpu: EditorAction[]
}
