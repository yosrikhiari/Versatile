/**
 * Live view of the writing orchestrator: what each agent is doing right now.
 *
 * The LangGraph strategy (`composables/generation/writing/graphStrategy.ts`)
 * reports into this store at every superstep — which lane is busy with which
 * scene, the Editor's decision and where it came from, every scene's status —
 * and the Orchestration panel renders it. Nothing here is persisted: the
 * durable record is `agentDecisions` (Dexie) and the run checkpoint; this is
 * the window onto the run while it happens.
 *
 * Settings that change the run (orchestrator, mode, placement) are NOT held
 * here — they live in `settingsStore` and `config/roles.ts`, so the panel and
 * the Settings tab can never disagree.
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { EditorDecision, EditorSceneSummary } from '../types/orchestration'
import { ROLE_NAMES, resolveRolePlacement, type RoleName, type RoleRuntime } from '../config/roles'

export type LaneName = 'gpu' | 'cpu'

export interface LaneActivity {
  /** What the lane is doing: a draft, a revise, a critique — or idle. */
  kind: 'draft' | 'revise' | 'critique' | 'idle'
  role: RoleName | null
  sceneIndex: number | null
  sceneTitle: string | null
  attempt: number | null
  since: number | null
}

export interface RunSnapshot {
  runId: string | null
  projectId: string | null
  mode: 'workflow' | 'agentic' | null
  startedAt: number | null
  finishedAt: number | null
  step: number
  lanes: Record<LaneName, LaneActivity>
  scenes: EditorSceneSummary[]
  decisions: EditorDecision[]
  /** The placement the run started with, resolved (model + device per role). */
  roles: Record<RoleName, RoleRuntime> | null
  warnings: string[]
  error: string | null
}

const idle = (): LaneActivity => ({
  kind: 'idle',
  role: null,
  sceneIndex: null,
  sceneTitle: null,
  attempt: null,
  since: null
})

const MAX_DECISIONS = 60

export const useOrchestrationStore = defineStore('orchestration', () => {
  const run = ref<RunSnapshot>({
    runId: null,
    projectId: null,
    mode: null,
    startedAt: null,
    finishedAt: null,
    step: 0,
    lanes: { gpu: idle(), cpu: idle() },
    scenes: [],
    decisions: [],
    roles: null,
    warnings: [],
    error: null
  })

  const active = computed(() => !!run.value.runId && run.value.finishedAt == null)

  /** The placement as it stands now (re-read on demand; the panel edits it live). */
  function currentRoles(): Record<RoleName, RoleRuntime> {
    const out = {} as Record<RoleName, RoleRuntime>
    for (const role of ROLE_NAMES) out[role] = resolveRolePlacement(role)
    return out
  }

  function startRun(args: {
    runId: string
    projectId: string
    mode: 'workflow' | 'agentic'
    warnings: string[]
  }) {
    run.value = {
      runId: args.runId,
      projectId: args.projectId,
      mode: args.mode,
      startedAt: Date.now(),
      finishedAt: null,
      step: 0,
      lanes: { gpu: idle(), cpu: idle() },
      scenes: [],
      decisions: [],
      roles: currentRoles(),
      warnings: args.warnings,
      error: null
    }
  }

  function setScenes(scenes: EditorSceneSummary[]) {
    run.value.scenes = scenes
  }

  function setStep(step: number) {
    run.value.step = step
  }

  function setLane(lane: LaneName, activity: Omit<LaneActivity, 'since'>) {
    run.value.lanes[lane] = { ...activity, since: activity.kind === 'idle' ? null : Date.now() }
  }

  function clearLanes() {
    run.value.lanes = { gpu: idle(), cpu: idle() }
  }

  function pushDecision(decision: EditorDecision) {
    const next = run.value.decisions.concat(decision)
    run.value.decisions = next.length > MAX_DECISIONS ? next.slice(-MAX_DECISIONS) : next
  }

  function endRun(error: string | null = null) {
    run.value.finishedAt = Date.now()
    run.value.error = error
    clearLanes()
  }

  function reset() {
    run.value = {
      runId: null,
      projectId: null,
      mode: null,
      startedAt: null,
      finishedAt: null,
      step: 0,
      lanes: { gpu: idle(), cpu: idle() },
      scenes: [],
      decisions: [],
      roles: null,
      warnings: [],
      error: null
    }
  }

  return {
    run,
    active,
    currentRoles,
    startRun,
    setScenes,
    setStep,
    setLane,
    clearLanes,
    pushDecision,
    endRun,
    reset
  }
})
