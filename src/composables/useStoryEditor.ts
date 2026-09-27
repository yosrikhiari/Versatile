/**
 * The Editor: the agent that decides what the writing stage does next.
 *
 * The Director plans, the Writer drafts, the Critic judges — none of them
 * chooses the next step. In the legacy strategies code does, in a fixed order.
 * The LangGraph strategy (`generation/writing/graphStrategy.ts`) asks this
 * composable instead, once per superstep, and it answers one of two ways:
 *
 *   - `workflow` mode: the deterministic policy below — the same order the
 *     parallel strategy takes, expressed as a function over the run state. No
 *     model call. This is the baseline every A/B run compares against.
 *   - `agentic` mode: a small model (the `editor` role, a CPU-placed model by
 *     preset) sees a compact summary of the run and the *legal* moves for each
 *     lane, and picks. Its choice is validated against that legal set; anything
 *     else — an illegal action, a missing target, unparsable JSON — falls back
 *     to the workflow choice and is logged as such. The model can therefore
 *     choose *among* moves the state machine allows (accept a 6.5 instead of
 *     spending a rewrite; revise scene 7 with a specific instruction; stop
 *     early) and can never invent a move.
 *
 * Why the Editor is not the Critic: the Critic grades; the Editor spends the
 * budget. Keeping "how good is it" and "what do we do about it" in separate
 * prompts — and, by placement, separate models — is the same separation
 * between judge and interviewer that keeps an LLM judge honest.
 */
import { aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'
import type { SessionBudget } from '../services/aiProviderBudget'
import type {
  EditorAction,
  EditorActionName,
  EditorBudget,
  EditorDecision,
  EditorSceneSummary,
  EditorState,
  LegalMoves
} from '../types/orchestration'

export type {
  EditorAction,
  EditorActionName,
  EditorBudget,
  EditorDecision,
  EditorSceneSummary,
  EditorState,
  LegalMoves
}

export const EDITOR_PROMPT_VERSION = 'editor-v3'

/**
 * Every move the state allows on each lane. The workflow policy picks the
 * first of each list; the agentic policy may pick any entry. This function is
 * the fence: nothing outside its output can be executed.
 *
 * Order encodes the workflow's priorities:
 *   GPU lane — revise a failed scene before drafting a new one (keeps the
 *              chapter log honest), then draft the next planned scene while
 *              fewer than `lookahead` drafts wait for a verdict.
 *   CPU lane — critique the oldest waiting draft; commit any judged scene.
 */
export function legalMoves(state: EditorState): LegalMoves {
  const { scenes, budget } = state
  const gpu: EditorAction[] = []
  const cpu: EditorAction[] = []

  const judged = scenes.filter((s) => s.status === 'critiqued')
  const waitingForVerdict = scenes.filter((s) => s.status === 'drafted')
  const inFlight = scenes.filter((s) => s.status === 'drafting' || s.status === 'critiquing')
  const pendingCount = waitingForVerdict.length + inFlight.length

  if (!state.gpuBusy) {
    // Failed verdicts with attempts left: revise (the workflow default) …
    for (const s of judged) {
      if (!s.pass && s.attempts < budget.maxAttempts) {
        gpu.push({ action: 'revise', target: s.index })
      }
    }
    // … then the next planned scene, bounded by the lookahead.
    const next = scenes.find((s) => s.status === 'planned')
    if (next && pendingCount < budget.lookahead) {
      gpu.push({ action: 'draft', target: next.index })
    }
    // Declining a revise must be expressible, or "accept #k for review" on the
    // CPU lane could never be chosen without also revising #k on this one.
    if (gpu.length > 0 && gpu.every((m) => m.action === 'revise')) {
      gpu.push({ action: 'wait', target: null })
    }
  }

  if (!state.cpuBusy) {
    const oldest = waitingForVerdict[0]
    if (oldest) cpu.push({ action: 'critique', target: oldest.index })
  }

  // Settled scenes (a clean pass, an exhausted retry budget) are committed by
  // the graph itself, not by choice. What remains a choice is a FAILED verdict
  // with attempts left: `revise` (above, the workflow default) or `commit` —
  // accept the best attempt for review instead of spending a rewrite. Only the
  // agentic policy ever picks this; it is listed on the CPU lane because a
  // commit is a code step that does not occupy the GPU.
  for (const s of judged) {
    if (!s.pass && s.attempts < budget.maxAttempts) {
      cpu.push({ action: 'commit', target: s.index })
    }
  }

  const everythingCommitted = scenes.every((s) => s.status === 'committed' || s.status === 'failed')
  if (everythingCommitted && inFlight.length === 0) {
    gpu.push({ action: 'stop', target: null })
  }

  if (gpu.length === 0) gpu.push({ action: 'wait', target: null })
  if (cpu.length === 0) cpu.push({ action: 'wait', target: null })
  return { gpu, cpu }
}

/** The deterministic policy: the first legal move on each lane. */
export function workflowDecision(state: EditorState): EditorDecision {
  const legal = legalMoves(state)
  // The workflow never accepts a failed scene early: on the CPU lane it
  // critiques if there is anything to critique, otherwise it waits.
  const cpu = legal.cpu.find((m) => m.action === 'critique') ?? { action: 'wait', target: null }
  return {
    gpu: legal.gpu[0],
    cpu,
    why: 'workflow order',
    source: 'workflow'
  }
}

export const EDITOR_SYSTEM_PROMPT = `You are the editor running a novel-writing pipeline. A Writer drafts scenes on one lane and a Critic judges them on another; both can work at the same time. Each step you choose ONE action for each lane from the legal moves you are given. You may only choose listed moves. Prefer finishing the book within budget over perfection: revise when the critic's issues are specific and fixable, commit a scene for review when they are vague or the score is close to passing, and never leave a lane idle when it has a legal move. Reply with JSON only.`

/** How a move is written to the model and read back: "draft #3", "wait". */
export function moveLabel(m: EditorAction): string {
  return m.target == null ? m.action : `${m.action} #${m.target}`
}

/**
 * Every legal (gpu, cpu) pair: each lane's legal moves, minus pairs that put
 * one scene on both lanes with different actions ("revise #1" + "commit #1"),
 * which `validateEditorAnswer` rejects.
 */
export function legalPairs(legal: LegalMoves): Array<{ gpu: EditorAction; cpu: EditorAction }> {
  const pairs: Array<{ gpu: EditorAction; cpu: EditorAction }> = []
  for (const gpu of legal.gpu) {
    for (const cpu of legal.cpu) {
      if (gpu.target != null && gpu.target === cpu.target && gpu.action !== cpu.action) continue
      pairs.push({ gpu, cpu })
    }
  }
  return pairs
}

/** How a pair is written to the model and read back. */
export function planLabel(p: { gpu: EditorAction; cpu: EditorAction }): string {
  return `gpu: ${moveLabel(p.gpu)} / cpu: ${moveLabel(p.cpu)}`
}

/**
 * The answer schema, built per call (editor-v3). A fixed schema (`action` any
 * of six, `target` any integer or null) let the 3B Editor answer 17 of 24
 * probe states illegally ("critique #1" not offered, a bare "draft"); a
 * per-lane enum of legal moves (v2) removed every illegal move but still let
 * it pick "revise #1" on one lane and "commit #1" on the other (13/24). The
 * answer is now ONE choice among the legal pairs, so constrained decoding can
 * only produce an executable plan; `validateEditorAnswer` stays the fence.
 */
export function buildEditorSchema(legal: LegalMoves) {
  return {
    type: 'object',
    properties: {
      plan: { type: 'string', enum: legalPairs(legal).map(planLabel) },
      instructions: { type: 'string' },
      why: { type: 'string' }
    },
    required: ['plan', 'why']
  }
}

function describeScene(s: EditorSceneSummary): string {
  const score = s.score == null ? '' : ` score ${s.score}${s.pass ? ' pass' : ' FAIL'}`
  const cont = s.continuity == null ? '' : ` continuity ${s.continuity}`
  const issues = s.topIssues.length ? ` issues: ${s.topIssues.join('; ')}` : ''
  return `#${s.index} "${s.title}" [${s.status}, attempts ${s.attempts}]${score}${cont}${issues}`
}

function describeMoves(moves: EditorAction[]): string {
  return moves.map(moveLabel).join(' | ')
}

export function buildEditorPrompt(state: EditorState, legal: LegalMoves): string {
  const lines = state.scenes.map(describeScene)
  const recent = state.recent
    .slice(-3)
    .map(
      (d) =>
        `${d.gpu.action}${d.gpu.target != null ? ` #${d.gpu.target}` : ''} / ${d.cpu.action}${d.cpu.target != null ? ` #${d.cpu.target}` : ''} — ${d.why}`
    )
  return [
    'SCENES:',
    ...lines,
    '',
    `BUDGET: max ${state.budget.maxAttempts} attempts per scene, lookahead ${state.budget.lookahead}${state.budget.budgetNote ? `, note: ${state.budget.budgetNote}` : ''}.`,
    recent.length ? `RECENT DECISIONS:\n${recent.join('\n')}` : '',
    '',
    `LEGAL MOVES — gpu lane: ${describeMoves(legal.gpu)}`,
    `LEGAL MOVES — cpu lane: ${describeMoves(legal.cpu)}`,
    '',
    'LEGAL PLANS (one move per lane, together):',
    ...legalPairs(legal).map((p) => `- ${planLabel(p)}`),
    '',
    'Choose one plan. If it revises a scene, add one sentence of instructions naming what to fix.',
    'Reply as JSON: {"plan": one plan exactly as listed, "instructions"?: "...", "why": "one sentence"}'
  ]
    .filter((l) => l !== '')
    .join('\n')
}

function sameMove(a: EditorAction, b: EditorAction): boolean {
  return a.action === b.action && (a.target ?? null) === (b.target ?? null)
}

/**
 * Accept the model's answer only if every lane's move is in the legal set.
 * Returns the reason for rejection, or null when it is valid.
 */
export function validateEditorAnswer(
  raw: unknown,
  legal: LegalMoves
): { decision: Omit<EditorDecision, 'source'> | null; reason: string | null } {
  if (!raw || typeof raw !== 'object') return { decision: null, reason: 'not an object' }
  const r = raw as {
    gpu?: unknown
    cpu?: unknown
    why?: unknown
    plan?: unknown
    instructions?: unknown
  }
  const why0 =
    typeof r.why === 'string' && r.why.trim() ? r.why.trim().slice(0, 300) : 'no reason given'
  if (typeof r.plan === 'string') {
    // editor-v3: one plan among the legal pairs.
    const pair = legalPairs(legal).find((p) => planLabel(p) === (r.plan as string).trim())
    if (!pair) return { decision: null, reason: `${r.plan} is not a legal plan` }
    const gpu: EditorAction = { ...pair.gpu }
    if (gpu.action === 'revise' && typeof r.instructions === 'string' && r.instructions.trim()) {
      gpu.instructions = r.instructions.trim().slice(0, 400)
    }
    return { decision: { gpu, cpu: { ...pair.cpu }, why: why0 }, reason: null }
  }
  const pick = (lane: 'gpu' | 'cpu'): EditorAction | string => {
    const v = r[lane]
    if (!v || typeof v !== 'object') return `${lane}: missing`
    const { move, action, target, instructions } = v as {
      move?: unknown
      action?: unknown
      target?: unknown
      instructions?: unknown
    }
    let candidate: EditorAction
    if (typeof move === 'string') {
      // editor-v2: the move as its label, e.g. "draft #3".
      const byLabel = legal[lane].find((m) => moveLabel(m) === move.trim())
      if (!byLabel) return `${lane}: ${move} is not a legal move`
      candidate = { action: byLabel.action, target: byLabel.target }
    } else {
      if (typeof action !== 'string') return `${lane}: no action`
      const tgt = typeof target === 'number' && Number.isInteger(target) ? target : null
      candidate = { action: action as EditorActionName, target: tgt }
      const match = legal[lane].find((m) => sameMove(m, candidate))
      if (!match) return `${lane}: ${action}${tgt != null ? ` #${tgt}` : ''} is not a legal move`
    }
    if (candidate.action === 'revise' && typeof instructions === 'string' && instructions.trim()) {
      candidate.instructions = instructions.trim().slice(0, 400)
    }
    return candidate
  }
  const gpu = pick('gpu')
  if (typeof gpu === 'string') return { decision: null, reason: gpu }
  const cpu = pick('cpu')
  if (typeof cpu === 'string') return { decision: null, reason: cpu }
  if (gpu.target != null && gpu.target === cpu.target && gpu.action !== cpu.action) {
    return {
      decision: null,
      reason: `scene #${gpu.target} on both lanes (${gpu.action} and ${cpu.action})`
    }
  }
  const why =
    typeof r.why === 'string' && r.why.trim() ? r.why.trim().slice(0, 300) : 'no reason given'
  return { decision: { gpu, cpu, why }, reason: null }
}

export function useStoryEditor() {
  let _sessionBudget: SessionBudget | null = null

  /**
   * The agentic policy. Never throws: a model failure of any kind yields the
   * workflow decision marked `fallback`, with the rejection recorded so the
   * decision log shows what the model tried to do.
   */
  async function decideAgentic(state: EditorState, signal?: AbortSignal): Promise<EditorDecision> {
    const legal = legalMoves(state)
    const fallback = workflowDecision(state)
    // Nothing to decide: one legal move per lane. Skip the call — it would only
    // cost a model round trip to confirm the obvious.
    if (legal.gpu.length <= 1 && legal.cpu.length <= 1) {
      return { ...fallback, why: 'only one legal move per lane', source: 'workflow' }
    }
    let raw: unknown
    try {
      raw = await aiGenerateJson(buildEditorPrompt(state, legal), EDITOR_SYSTEM_PROMPT, {
        feature: FEATURES.STORY_GENERATION,
        role: 'editor',
        temperature: 0.2,
        maxTokens: 300,
        schema: buildEditorSchema(legal),
        schemaName: 'editor_decision',
        sessionBudget: _sessionBudget,
        signal
      })
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err)
      return {
        ...fallback,
        source: 'fallback',
        rejected: { raw: null, reason: `call failed: ${reason}` }
      }
    }
    const { decision, reason } = validateEditorAnswer(raw, legal)
    if (!decision) {
      return { ...fallback, source: 'fallback', rejected: { raw, reason: reason || 'invalid' } }
    }
    return { ...decision, source: 'model' }
  }

  function decideWorkflow(state: EditorState): EditorDecision {
    return workflowDecision(state)
  }

  return {
    decideAgentic,
    decideWorkflow,
    legalMoves,
    get sessionBudget() {
      return _sessionBudget
    },
    set sessionBudget(v: SessionBudget | null) {
      _sessionBudget = v
    }
  }
}
