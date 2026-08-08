import { createAgentMemory } from './AgentMemory'
import { buildGenerationContext } from '../context/index'
import { SessionBudget, SessionBudgetExceededError } from '../../../services/aiProviderBudget'
import { useEvalStore } from '../../../stores/evalStore'

/**
 * ROUTING_TABLE[phase][event] = { nextPhase, handler }
 *
 * Each handler receives (memory, payload) and may return
 * { event, payload } to chain into the next dispatch, or
 * void if the caller owns the next event.
 */
const ROUTING_TABLE = {
  idle: {
    BOOTSTRAP_START: { nextPhase: 'bootstrapping', handler: handleBootstrapping },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  bootstrapping: {
    BOOTSTRAPPED: { nextPhase: 'planning', handler: handlePlanGenerated },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  planning: {
    PLAN_READY: { nextPhase: 'plan-preview', handler: handlePlanReady },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'plan-preview': {
    CONFIRMED: { nextPhase: 'spine-generation', handler: handleConfirmed },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'spine-generation': {
    SPINE_GENERATED: { nextPhase: 'writing', handler: handleSpineGenerated },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  writing: {
    SCENE_WRITTEN: { nextPhase: 'scene-review', handler: handleSceneWritten },
    BATCH_COMPLETE: { nextPhase: 'sync-preview', handler: handleBatchComplete },
    ALL_WRITTEN: { nextPhase: 'repairing', handler: handleAllWritten },
    WRITING_DONE: { nextPhase: 'complete', handler: handleWritingDone },
    PAUSED: { nextPhase: 'paused', handler: handlePaused },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  // Held at a scene boundary with the run's state intact. The only ways out are
  // continuing (RESUMED), a stop that unwinds the loop (ERROR), or a teardown
  // (RESET) — writing events have no route from here on purpose, so a scene
  // completing after the hold cannot slip past the pause.
  paused: {
    RESUMED: { nextPhase: 'writing', handler: handleResumed },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'scene-review': {
    APPROVED: { nextPhase: 'writing', handler: handleSceneApproved },
    REJECTED: { nextPhase: 'writing', handler: handleSceneRejected },
    REREQUESTED: { nextPhase: 'writing', handler: handleSceneRerequested },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'sync-preview': {
    SYNC_APPROVED: { nextPhase: 'writing', handler: handleSyncApproved },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  repairing: {
    REPAIRED: { nextPhase: 'consistency-check', handler: handleRepairFailed },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'consistency-check': {
    HAS_ISSUES: { nextPhase: 'consistency-fix', handler: handleConsistencyIssues },
    NO_ISSUES: { nextPhase: 'committing', handler: handleConsistencyClean },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'consistency-fix': {
    MAX_ROUNDS: { nextPhase: 'committing', handler: handleConsistencyMaxRounds },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  committing: {
    COMMITTED: { nextPhase: 'complete', handler: handleCommitted },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  complete: {
    // A finished run is not frozen: the author can send one scene back to the
    // writer, which re-enters `writing` for exactly that scene and returns
    // through the normal terminal sequence.
    REGENERATE: { nextPhase: 'writing', handler: handleRegenerate },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  error: {
    RESET: { nextPhase: 'idle', handler: handleReset }
  }
}

// ─── Phase transition helpers ────────────────────────────────

function transitionTo(memory: any, phase: any, reason: any) {
  memory.setPhase(phase)
  memory.setProgress(phase, 0)
  memory.instances.actLog?.addEntry?.('phase', { phase, reason })
}

// ─── Route Handlers ──────────────────────────────────────────

/**
 * IDLE ──BOOTSTRAP_START──► BOOTSTRAPPING
 * Stub — inline code owns entity bootstrapping for now.
 * In the final state this handler would call bootstrapper.bootstrapEntities.
 */
async function handleBootstrapping(memory: any, payload: any) {
  const { projectId, volumeId } = payload
  memory.projectId.value = projectId
  memory.volumeId.value = volumeId
  memory.setProgress('Bootstrapping entities...', 10)
  memory.instances.actLog?.addEntry?.('bootstrap', { projectId, volumeId })
}

/**
 * BOOTSTRAPPING ──BOOTSTRAPPED──► PLANNING
 * Accept plan from payload (inline mode) or generate via director (final mode).
 */
async function handlePlanGenerated(memory: any, payload: any) {
  memory.setProgress('Generating plan...', 15)

  if (!payload.plan && !payload.writerParams) {
    return
  }

  const plan =
    payload.plan ?? (await memory.instances.director.generateStoryPlan(payload.writerParams))
  memory.scenePlan.value = plan.scenes ?? []
  memory.chapterPlan.value = plan.chapters ?? []
  memory.spineArray.value = plan.spine ?? []
  memory.instances.actLog?.addEntry?.('plan', { sceneCount: plan.scenes?.length })
}

/**
 * REPAIRING ──REPAIRED──► CONSISTENCY_AUDIT
 * Post-writing repair of failed/weak scenes.
 */
async function handleRepairFailed(memory: any, payload: any) {
  memory.setProgress('Repairing ragged scenes...', 82)
  memory.instances.actLog?.addEntry?.('repair', {
    sceneCount: payload.failedScenes?.length
  })
}

/**
 * PLANNING ──PLAN_READY──► PLAN_PREVIEW
 * Pre-seed graph edges and build retrieval context for every scene.
 */
async function handlePlanReady(memory: any, payload: any) {
  const { projectId, volumeId, plan } = payload
  memory.setProgress('Bootstrapping context...', 10)

  await memory.instances.graphBuilder?.buildPreliminaryEdges?.(projectId, volumeId, plan)

  const context = await buildGenerationContext({
    entityType: 'scene',
    manuscriptContext: null
  })
  memory.spineContext.value = context.manuscript ?? ''
}

/**
 * PLAN_PREVIEW ──CONFIRMED──► SPINE_GENERATION
 * User approved the plan — prepare writing state.
 */
async function handleConfirmed(memory: any, payload: any) {
  memory.currentWriteIndex.value = 0
  memory.writtenScenes.value = []
  memory.structuredResults.value = []
  memory.autoMode.value = payload.autoMode ?? true
  memory.sceneReviewMode.value = payload.sceneReviewMode ?? 'auto'
  memory.inlineEvalEnabled.value = payload.inlineEval ?? false
  memory.setProgress('Writing scenes...', 20)
}

/**
 * SPINE_GENERATION ──SPINE_GENERATED──► WRITING
 * Spine has been generated — writing phase is ready to begin.
 */
async function handleSpineGenerated(memory: any, _payload: any) {
  memory.setProgress('Spine generated, starting scene writing...', 20)
}

/**
 * WRITING ──SCENE_WRITTEN──► SCENE_REVIEW
 * One scene was written — route to critic for evaluation.
 */
async function handleSceneWritten(memory: any, payload: any) {
  const { sceneResult, sceneIndex } = payload
  const idx = sceneIndex ?? memory.currentWriteIndex.value

  memory.writtenScenes.value[idx] = sceneResult
  memory.currentSceneResult.value = sceneResult
  memory.currentWriteIndex.value = idx + 1
  memory.setProgress(
    `Scene ${idx + 1} of ${memory.derived.totalSceneCount.value} written`,
    20 + Math.round(60 * (idx / memory.derived.totalSceneCount.value))
  )
}

/**
 * SCENE_REVIEW ──APPROVED──► WRITING
 * Scene passed review — write the next scene.
 *
 * The caller has already committed the prose; what it cannot do from outside
 * the machine is record the verdict against the run. `sceneIndex` comes in on
 * the payload because `currentWriteIndex` has already advanced past the
 * reviewed scene by the time this runs.
 */
async function handleSceneApproved(memory: any, payload: any) {
  const index = payload?.sceneIndex ?? memory.currentWriteIndex.value - 1
  const evalStore = useEvalStore()
  evalStore.addResult({ ...payload, index, verdict: 'approved' })
  memory.instances.actLog?.addEntry?.('scene-approved', { index })
}

/**
 * SCENE_REVIEW ──REJECTED──► WRITING
 * Scene failed review — clear it and queue the slot for a rewrite.
 *
 * The rejected pattern is recorded HERE rather than by the caller. It used to
 * be pushed inline while this handler sat unreachable, so the pattern reached
 * the writer but the rejection never reached the eval history or the run log.
 */
async function handleSceneRejected(memory: any, payload: any) {
  const rejectedIdx = payload?.sceneIndex ?? memory.currentWriteIndex.value - 1
  if (payload?.pattern) {
    memory.rejectedPatterns.value = [...memory.rejectedPatterns.value, payload.pattern]
  }
  memory.writtenScenes.value[rejectedIdx] = null
  memory.currentWriteIndex.value = rejectedIdx
  const evalStore = useEvalStore()
  evalStore.addResult({ ...payload, index: rejectedIdx, verdict: 'rejected' })
  memory.setProgress(`Re-writing scene ${rejectedIdx + 1}...`, 20)
}

/**
 * SCENE_REVIEW ──REREQUESTED──► WRITING
 * Scene sent back with revision notes.
 *
 * Distinct from a rejection: the prose was not repudiated, so nothing is nulled
 * and no rejected pattern is learned from it. The plan entry already carries
 * the author's instruction; this rewinds the write cursor onto it.
 */
async function handleSceneRerequested(memory: any, payload: any) {
  const index = payload?.sceneIndex ?? memory.currentWriteIndex.value - 1
  memory.currentWriteIndex.value = index
  memory.instances.actLog?.addEntry?.('scene-rerequest', { index, edits: payload?.edits })
  memory.setProgress(`Rewriting scene ${index + 1} with revisions...`, 20)
}

/**
 * COMPLETE ──REGENERATE──► WRITING
 * One scene of a finished run is being written again.
 */
async function handleRegenerate(memory: any, payload: any) {
  memory.instances.actLog?.addEntry?.('scene-regenerate', { index: payload?.sceneIndex })
  memory.setProgress(`Re-generating scene ${(payload?.sceneIndex ?? 0) + 1}...`, 20)
}

/**
 * WRITING ──BATCH_COMPLETE──► SYNC_PREVIEW
 * A batch of scenes reached its boundary — the next chapter end, or the
 * MAX_SYNC_BATCH_SIZE cap on a long chapter. See `batchEndIndex`.
 */
async function handleBatchComplete(memory: any, payload: any) {
  memory.hasPendingBatches.value = true
  memory.pendingBatchStart.value = payload.batchStart
  memory.lastSyncedResultIndex.value = payload.batchEnd

  // The caller has already run discovery over the batch it just wrote, so it
  // passes the result in. Re-deriving it here used to slice `memory.structuredResults`
  // — an array the inline pipeline never populates — with batch bounds taken
  // from a different index space, which produced a wrong preview at best.
  if (payload.preview) {
    memory.syncPreview.value = payload.preview
  } else if (memory.instances.sync?.discoverSync) {
    memory.syncPreview.value = await memory.instances.sync.discoverSync(
      memory.structuredResults.value.slice(payload.batchStart, payload.batchEnd)
    )
  }
  memory.setProgress('Reviewing batch sync changes...', 75)
}

/**
 * WRITING ──PAUSED──► PAUSED
 * The writing loop reached a scene boundary and is holding there.
 */
async function handlePaused(memory: any, payload: any) {
  memory.setProgress('Paused', payload?.percent ?? 0)
  memory.instances.actLog?.addEntry?.('pause', {
    sceneIndex: payload?.sceneIndex ?? memory.currentWriteIndex.value
  })
}

/**
 * PAUSED ──RESUMED──► WRITING
 * The user released the hold — the same loop carries on from where it stopped.
 */
async function handleResumed(memory: any, payload: any) {
  memory.setProgress('Resuming…', payload?.percent ?? 0)
  memory.instances.actLog?.addEntry?.('resume', {
    sceneIndex: payload?.sceneIndex ?? memory.currentWriteIndex.value
  })
}

/**
 * WRITING ──ALL_WRITTEN──► REPAIRING
 * Every scene has an initial draft — run post-writing repair.
 */
async function handleAllWritten(memory: any, _payload: any) {
  memory.setProgress('Auditing cross-scene consistency...', 85)
}

/**
 * SYNC_PREVIEW ──SYNC_APPROVED──► WRITING
 * The batch's entity changes were accepted — clear the preview and carry on.
 *
 * This deliberately does NOT commit. `SceneInteractionService.confirmSync`
 * holds the structured outputs and the accepted entities and has already
 * written them by the time it dispatches; committing again here would apply
 * the batch twice. Same division of labour as `handleBatchComplete`, which
 * takes the caller's already-computed preview rather than re-deriving one.
 */
async function handleSyncApproved(memory: any, payload: any) {
  memory.syncPreview.value = null
  memory.hasPendingBatches.value = false
  memory.instances.actLog?.addEntry?.('sync-approved', {
    accepted: payload?.acceptedCount ?? null
  })
}

/**
 * CONSISTENCY_AUDIT ──HAS_ISSUES──► CONSISTENCY_FIX
 * Contradictions found — enter fix loop.
 */
async function handleConsistencyIssues(memory: any, payload: any) {
  memory.sceneInconsistencies.value = payload.issues
  memory.setProgress(`Fixing ${payload.issues.length} inconsistencies...`, 90)
}

/**
 * CONSISTENCY_AUDIT ──NO_ISSUES──► COMMITTING
 * No contradictions found — proceed to finalize.
 */
async function handleConsistencyClean(memory: any, _payload: any) {
  memory.setProgress('Committing...', 95)
}

/**
 * CONSISTENCY_FIX ──MAX_ROUNDS──► COMMITTING
 * Hit CONSISTENCY_FIX_ROUNDS ceiling — force proceed.
 */
async function handleConsistencyMaxRounds(memory: any, payload: any) {
  memory.setProgress('Committing (consistency max rounds reached)...', 95)
  memory.instances.actLog?.addEntry?.('consistency-max-rounds', {
    rounds: payload.round,
    remainingIssues: payload.remaining
  })
}

/**
 * WRITING_DONE from writing phase (direct transition to complete)
 * Used when the inline generation pipeline finishes all work.
 */
async function handleWritingDone(memory: any, _payload: any) {
  memory.setProgress('Generation complete', 100)
}

/**
 * COMMITTING ──COMMITTED──► COMPLETE
 * Finalize: build manuscript, checkpoint, sync, persist.
 */
async function handleCommitted(memory: any, _payload: any) {
  await memory.instances.commitService?.buildManuscript?.(
    memory.scenePlan.value,
    memory.writtenScenes.value
  )
  await memory.instances.commitService?.finalize?.(memory.currentTaskId.value)
  memory.setProgress('Complete', 100)
}

/**
 * ERROR ──ERROR──► (stay in error)
 * Generic error handler — logs the error and flags it on memory.
 */
async function handleError(memory: any, payload: any) {
  const msg = payload?.error?.message || payload?.message || payload?.error || 'Unknown error'
  memory.setProgress(`Error: ${msg}`, 0)
}

/**
 * ERROR ──RESET──► IDLE
 * Full reset — calls memory.reset().
 */
async function handleReset(memory: any, _payload: any) {
  memory.instances.sessionBudget?.reset()
  memory.reset()
}

// ─── Delegator Class ─────────────────────────────────────────

export class Delegator {
  memory: any
  history: any

  constructor(memory: any) {
    this.memory = memory ?? createAgentMemory()
    this.history = []
  }

  /**
   * Route an event through the state machine.
   *
   * @param {string} event     — uppercase event name (e.g. 'START', 'PLAN_READY')
   * @param {object} [payload] — data forwarded to the handler
   * @returns {Promise<{ nextPhase: string|null, handler: string, result?: any }>}
   */
  async dispatch(event: any, payload: any = {}) {
    const currentPhase = this.memory.phase.value
    const route = (ROUTING_TABLE as any)[currentPhase]?.[event]

    if (!route) {
      // ERROR and RESET must be reachable from every phase, routed or not.
      // Throwing here replaced the caller's real failure with a routing error —
      // the original cause was lost, `error.value` was never set, and the run
      // reported a state machine complaint instead of what actually went wrong.
      if (event === 'ERROR') {
        this.history.push({ from: currentPhase, event, to: 'error', handler: 'handleError' })
        transitionTo(this.memory, 'error', `${event} (unrouted from ${currentPhase})`)
        await handleError(this.memory, payload)
        return { nextPhase: 'error', handler: 'handleError' }
      }
      if (event === 'RESET') {
        this.history.push({ from: currentPhase, event, to: 'idle', handler: 'handleReset' })
        transitionTo(this.memory, 'idle', `${event} (unrouted from ${currentPhase})`)
        await handleReset(this.memory, payload)
        return { nextPhase: 'idle', handler: 'handleReset' }
      }
      throw new Error(
        `Delegator: no route for event "${event}" in phase "${currentPhase}". ` +
          `Available events: [${Object.keys((ROUTING_TABLE as any)[currentPhase] ?? {}).join(', ')}]`
      )
    }

    const { nextPhase, handler } = route
    const handlerName = handler.name

    this.history.push({ from: currentPhase, event, to: nextPhase, handler: handlerName })

    if (nextPhase) {
      transitionTo(this.memory, nextPhase, `${event}→${nextPhase}`)
    }

    // Reporting a failure and tearing a run down must not themselves need
    // budget. When the budget is what ran out, this check fired *inside* the
    // caller's catch block and threw a second time — replacing the real error,
    // leaving `error.value` unset, and letting an exhausted run present itself
    // as a finished one. Only work-doing transitions are gated.
    if (event !== 'ERROR' && event !== 'RESET') {
      const check = this.memory.instances.sessionBudget?.check()
      if (check && !check.allowed) {
        throw new SessionBudgetExceededError(check.reason)
      }
    }

    const result = await handler(this.memory, payload)

    return { nextPhase, handler: handlerName, result }
  }

  /**
   * Whether `event` has a route out of the current phase.
   *
   * The terminal sequence (repair → audit → commit) is driven by the inline
   * pipeline, which can be entered from several phases depending on how the run
   * got there. Asking first is how it walks the table instead of guessing and
   * throwing halfway through.
   */
  canDispatch(event: any) {
    return Boolean((ROUTING_TABLE as any)[this.memory.phase.value]?.[event])
  }

  /**
   * Put the machine back into a known phase without replaying the work that
   * normally leads there.
   *
   * Crash recovery is the case this exists for: a resumed run has already been
   * bootstrapped, planned and spined, so walking the events forward from `idle`
   * would re-run those handlers' side effects (re-seeding graph edges, rebuilding
   * context) to reach a state we already know we are in. Resume previously
   * dispatched SPINE_GENERATED straight out of `idle`, which has no such route —
   * so it threw and resuming silently did nothing.
   */
  restore(phase: any, reason = 'restored') {
    if (!(ROUTING_TABLE as any)[phase]) {
      throw new Error(`Delegator: cannot restore unknown phase "${phase}"`)
    }
    this.history.push({ from: this.memory.phase.value, event: 'RESTORE', to: phase, handler: null })
    transitionTo(this.memory, phase, reason)
    return phase
  }

  get phase() {
    return this.memory.phase.value
  }

  get currentPhase() {
    return this.memory.phase.value
  }

  getHistory() {
    return [...this.history]
  }

  getBudgetState() {
    return this.memory.instances.sessionBudget?.asState() ?? null
  }

  setBudget(budget: SessionBudget | null) {
    this.memory.instances.sessionBudget = budget
  }
}
