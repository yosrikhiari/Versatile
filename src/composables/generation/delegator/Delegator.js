import { createAgentMemory } from './AgentMemory'
import { buildGenerationContext } from '../context/index'

/**
 * ROUTING_TABLE[phase][event] = { nextPhase, handler }
 *
 * Each handler receives (memory, payload) and may return
 * { event, payload } to chain into the next dispatch, or
 * void if the caller owns the next event.
 */
const ROUTING_TABLE = {
  idle: {
    START: { nextPhase: 'volume-creating', handler: handleCreateVolume },
    BOOTSTRAP_START: { nextPhase: 'bootstrapping', handler: handleBootstrapping },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'volume-creating': {
    VOLUME_CREATED: { nextPhase: 'bootstrapping', handler: handleBootstrapping },
    ERROR: { nextPhase: 'error', handler: handleError },
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
    REJECTED: { nextPhase: 'planning', handler: handleRejected },
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
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'scene-review': {
    APPROVED: { nextPhase: 'writing', handler: handleSceneApproved },
    REJECTED: { nextPhase: 'writing', handler: handleSceneRejected },
    ERROR: { nextPhase: 'error', handler: handleError },
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  'sync-preview': {
    SYNC_APPROVED: { nextPhase: 'writing', handler: handleSyncApproved },
    SYNC_REJECTED: { nextPhase: 'writing', handler: handleSyncRejected },
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
    FIXED: { nextPhase: 'consistency-check', handler: handleConsistencyFixed },
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
    RESET: { nextPhase: 'idle', handler: handleReset }
  },
  error: {
    RETRY: { nextPhase: null, handler: handleRetry },
    RESET: { nextPhase: 'idle', handler: handleReset }
  }
}

// ─── Phase transition helpers ────────────────────────────────

function transitionTo(memory, phase, reason) {
  memory.setPhase(phase)
  memory.setProgress(phase, 0)
  memory.instances.actLog?.addEntry?.('phase', { phase, reason })
}

// ─── Route Handlers ──────────────────────────────────────────

/**
 * VOLUME_CREATING ──VOLUME_CREATED──► BOOTSTRAPPING
 * Stub — inline code owns entity bootstrapping for now.
 * In the final state this handler would call bootstrapper.bootstrapEntities.
 */
async function handleBootstrapping(memory, payload) {
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
async function handlePlanGenerated(memory, payload) {
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
 * IDLE ──START──► VOLUME_CREATING
 * Create the volume record and assign it to memory.
 */
async function handleCreateVolume(memory, payload) {
  const { projectId, volumeId, writeParams } = payload
  memory.projectId.value = projectId
  memory.volumeId.value = volumeId
  memory.writeParams.value = writeParams
  memory.setProgress('Creating volume...', 2)

  memory.instances.actLog?.addEntry?.('volume', { projectId, volumeId })
}

/**
 * REPAIRING ──REPAIRED──► CONSISTENCY_AUDIT
 * Post-writing repair of failed/weak scenes.
 */
async function handleRepairFailed(memory, payload) {
  memory.setProgress('Repairing ragged scenes...', 82)
  memory.instances.actLog?.addEntry?.('repair', {
    sceneCount: payload.failedScenes?.length
  })
}

/**
 * PLANNING ──PLAN_READY──► PLAN_PREVIEW
 * Pre-seed graph edges and build retrieval context for every scene.
 */
async function handlePlanReady(memory, payload) {
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
async function handleConfirmed(memory, payload) {
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
async function handleSpineGenerated(memory, _payload) {
  memory.setProgress('Spine generated, starting scene writing...', 20)
}

/**
 * PLAN_PREVIEW ──REJECTED──► PLANNING
 * User rejected the plan — re-enter planning.
 */
async function handleRejected(memory, payload) {
  memory.setPhase('planning')
  memory.setProgress('Re-planning...', 5)
  memory.instances.actLog?.addEntry?.('reject', { reason: payload.reason })
}

/**
 * WRITING ──SCENE_WRITTEN──► SCENE_REVIEW
 * One scene was written — route to critic for evaluation.
 */
async function handleSceneWritten(memory, payload) {
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
 * Scene passed evaluation — write the next scene.
 */
async function handleSceneApproved(memory, payload) {
  memory.sceneEvalResults.value = [
    ...memory.sceneEvalResults.value,
    { ...payload, index: memory.currentWriteIndex.value - 1 }
  ]
}

/**
 * SCENE_REVIEW ──REJECTED──► WRITING
 * Scene failed — queue for rewrite.
 */
async function handleSceneRejected(memory, payload) {
  const rejectedIdx = memory.currentWriteIndex.value - 1
  if (payload.pattern) {
    memory.rejectedPatterns.value = [...memory.rejectedPatterns.value, payload.pattern]
  }
  memory.writtenScenes.value[rejectedIdx] = null
  memory.currentWriteIndex.value = rejectedIdx
  memory.sceneEvalResults.value = [
    ...memory.sceneEvalResults.value,
    { ...payload, index: rejectedIdx, verdict: 'rejected' }
  ]
  memory.setProgress(`Re-writing scene ${rejectedIdx + 1}...`, 20)
}

/**
 * WRITING ──BATCH_COMPLETE──► SYNC_PREVIEW
 * A batch of scenes crossed the SYNC_BATCH_SIZE threshold.
 */
async function handleBatchComplete(memory, payload) {
  memory.hasPendingBatches.value = true
  memory.pendingBatchStart.value = payload.batchStart
  memory.lastSyncedResultIndex.value = payload.batchEnd

  const preview = await memory.instances.sync.discoverSync(
    memory.structuredResults.value.slice(payload.batchStart, payload.batchEnd)
  )
  memory.syncPreview.value = preview
  memory.setProgress('Reviewing batch sync changes...', 75)
}

/**
 * WRITING ──ALL_WRITTEN──► REPAIRING
 * Every scene has an initial draft — run post-writing repair.
 */
async function handleAllWritten(memory, _payload) {
  memory.setProgress('Auditing cross-scene consistency...', 85)
}

/**
 * SYNC_PREVIEW ──SYNC_APPROVED──► WRITING
 * User approved the sync preview — commit changes and continue.
 */
async function handleSyncApproved(memory, payload) {
  await memory.instances.sync.commitSync({
    structuredOutputs: payload.structuredOutputs,
    acceptedEntities: payload.acceptedEntities,
    projectId: memory.projectId.value,
    volumeId: memory.volumeId.value,
    chapterId: payload.chapterId
  })
  memory.syncPreview.value = null
  memory.hasPendingBatches.value = false
}

/**
 * SYNC_PREVIEW ──SYNC_REJECTED──► WRITING
 * User rejected sync — continue writing without committing this batch.
 */
async function handleSyncRejected(memory, payload) {
  memory.syncPreview.value = null
  memory.hasPendingBatches.value = false
  if (payload.reason) {
    memory.instances.actLog?.addEntry?.('sync-reject', { reason: payload.reason })
  }
}

/**
 * CONSISTENCY_AUDIT ──HAS_ISSUES──► CONSISTENCY_FIX
 * Contradictions found — enter fix loop.
 */
async function handleConsistencyIssues(memory, payload) {
  memory.sceneInconsistencies.value = payload.issues
  memory.setProgress(`Fixing ${payload.issues.length} inconsistencies...`, 90)
}

/**
 * CONSISTENCY_AUDIT ──NO_ISSUES──► COMMITTING
 * No contradictions found — proceed to finalize.
 */
async function handleConsistencyClean(memory, _payload) {
  memory.setProgress('Committing...', 95)
}

/**
 * CONSISTENCY_FIX ──FIXED──► CONSISTENCY_AUDIT
 * A fix round completed — re-audit.
 */
async function handleConsistencyFixed(memory, payload) {
  memory.instances.actLog?.addEntry?.('consistency-fix', {
    round: payload.round,
    fixedCount: payload.fixedCount
  })
}

/**
 * CONSISTENCY_FIX ──MAX_ROUNDS──► COMMITTING
 * Hit CONSISTENCY_FIX_ROUNDS ceiling — force proceed.
 */
async function handleConsistencyMaxRounds(memory, payload) {
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
async function handleWritingDone(memory, _payload) {
  memory.setProgress('Generation complete', 100)
}

/**
 * COMMITTING ──COMMITTED──► COMPLETE
 * Finalize: build manuscript, checkpoint, sync, persist.
 */
async function handleCommitted(memory, _payload) {
  await memory.instances.commitService.buildManuscript?.(
    memory.scenePlan.value,
    memory.writtenScenes.value
  )
  await memory.instances.commitService.finalize?.(memory.currentTaskId.value)
  memory.setProgress('Complete', 100)
}

/**
 * ERROR ──RETRY──► (previous phase)
 * Resume from the phase stored in payload.resumePhase.
 */
async function handleRetry(memory, payload) {
  const resume = payload.resumePhase ?? 'planning'
  memory.setPhase(resume)
  memory.setProgress(`Resuming from ${resume}...`, 0)
  memory.instances.actLog?.addEntry?.('retry', { resumePhase: resume })
}

/**
 * ERROR ──ERROR──► (stay in error)
 * Generic error handler — logs the error and flags it on memory.
 */
async function handleError(memory, payload) {
  const msg = payload?.error?.message || payload?.message || payload?.error || 'Unknown error'
  memory.setProgress(`Error: ${msg}`, 0)
}

/**
 * ERROR ──RESET──► IDLE
 * Full reset — calls memory.reset().
 */
async function handleReset(memory, _payload) {
  memory.reset()
}

// ─── Delegator Class ─────────────────────────────────────────

export class Delegator {
  constructor(memory) {
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
  async dispatch(event, payload = {}) {
    const currentPhase = this.memory.phase.value
    const route = ROUTING_TABLE[currentPhase]?.[event]

    if (!route) {
      throw new Error(
        `Delegator: no route for event "${event}" in phase "${currentPhase}". ` +
          `Available events: [${Object.keys(ROUTING_TABLE[currentPhase] ?? {}).join(', ')}]`
      )
    }

    const { nextPhase, handler } = route
    const handlerName = handler.name

    this.history.push({ from: currentPhase, event, to: nextPhase, handler: handlerName })

    if (nextPhase) {
      transitionTo(this.memory, nextPhase, `${event}→${nextPhase}`)
    }

    const result = await handler(this.memory, payload)

    return { nextPhase, handler: handlerName, result }
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
}
