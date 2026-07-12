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
    START: { nextPhase: 'planning', handler: handleStart },
  },
  planning: {
    PLAN_READY: { nextPhase: 'bootstrapping', handler: handlePlanReady },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  bootstrapping: {
    BOOTSTRAPPED: { nextPhase: 'confirming', handler: handleBootstrapped },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  confirming: {
    CONFIRMED: { nextPhase: 'writing', handler: handleConfirmed },
    REJECTED: { nextPhase: 'planning', handler: handleRejected },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  writing: {
    SCENE_WRITTEN: { nextPhase: 'scene-review', handler: handleSceneWritten },
    BATCH_COMPLETE: { nextPhase: 'sync-preview', handler: handleBatchComplete },
    ALL_WRITTEN: { nextPhase: 'consistency-audit', handler: handleAllWritten },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  'scene-review': {
    APPROVED: { nextPhase: 'writing', handler: handleSceneApproved },
    REJECTED: { nextPhase: 'writing', handler: handleSceneRejected },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  'sync-preview': {
    SYNC_APPROVED: { nextPhase: 'writing', handler: handleSyncApproved },
    SYNC_REJECTED: { nextPhase: 'writing', handler: handleSyncRejected },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  'consistency-audit': {
    HAS_ISSUES: { nextPhase: 'consistency-fix', handler: handleConsistencyIssues },
    NO_ISSUES: { nextPhase: 'committing', handler: handleConsistencyClean },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  'consistency-fix': {
    FIXED: { nextPhase: 'consistency-audit', handler: handleConsistencyFixed },
    MAX_ROUNDS: { nextPhase: 'committing', handler: handleConsistencyMaxRounds },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  committing: {
    COMMITTED: { nextPhase: 'complete', handler: handleCommitted },
    ERROR: { nextPhase: 'error', handler: handleError },
  },
  complete: {},
  error: {
    RETRY: { nextPhase: null, handler: handleRetry },
    RESET: { nextPhase: 'idle', handler: handleReset },
  },
}

// ─── Phase transition helpers ────────────────────────────────

function transitionTo(memory, phase, reason) {
  memory.setPhase(phase)
  memory.setProgress(phase, 0)
  memory.instances.actLog?.addEntry?.('phase', { phase, reason })
}

// ─── Route Handlers ──────────────────────────────────────────

/**
 * IDLE ──START──► PLANNING
 * Director agent generates the scene/chapter plan from write params.
 */
async function handleStart(memory, payload) {
  const { projectId, volumeId, writeParams, writerParams } = payload
  memory.projectId.value = projectId
  memory.volumeId.value = volumeId
  memory.writeParams.value = writeParams
  memory.setProgress('Generating plan...', 5)

  const plan = await memory.instances.director.generatePlan(writerParams)
  memory.scenePlan.value = plan.scenes ?? []
  memory.chapterPlan.value = plan.chapters ?? []
  memory.spineArray.value = plan.spine ?? []
  memory.instances.actLog?.addEntry?.('plan', { sceneCount: plan.scenes?.length })
}

/**
 * PLANNING ──PLAN_READY──► BOOTSTRAPPING
 * Pre-seed graph edges and build retrieval context for every scene.
 */
async function handlePlanReady(memory, payload) {
  const { projectId, volumeId, plan } = payload
  memory.setProgress('Bootstrapping context...', 10)

  await memory.instances.graphBuilder?.buildPreliminaryEdges?.(projectId, volumeId, plan)

  const context = await buildGenerationContext({
    entityType: 'scene',
    manuscriptContext: null,
  })
  memory.spineContext.value = context.manuscript ?? ''
}

/**
 * BOOTSTRAPPING ──BOOTSTRAPPED──► CONFIRMING
 * Wait for human confirmation of the spine / plan.
 */
async function handleBootstrapped(memory, _payload) {
  memory.setProgress('Awaiting confirmation...', 15)
}

/**
 * CONFIRMING ──CONFIRMED──► WRITING
 * User approved the plan — begin scene-by-scene writing.
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
 * CONFIRMING ──REJECTED──► PLANNING
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
    20 + Math.round(60 * (idx / memory.derived.totalSceneCount.value)),
  )
}

/**
 * SCENE_REVIEW ──APPROVED──► WRITING
 * Scene passed evaluation — write the next scene.
 */
async function handleSceneApproved(memory, payload) {
  memory.sceneEvalResults.value = [
    ...memory.sceneEvalResults.value,
    { ...payload, index: memory.currentWriteIndex.value - 1 },
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
    { ...payload, index: rejectedIdx, verdict: 'rejected' },
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
    memory.structuredResults.value.slice(payload.batchStart, payload.batchEnd),
  )
  memory.syncPreview.value = preview
  memory.setProgress('Reviewing batch sync changes...', 75)
}

/**
 * WRITING ──ALL_WRITTEN──► CONSISTENCY_AUDIT
 * Every scene has an initial draft — run cross-scene audit.
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
    chapterId: payload.chapterId,
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
    fixedCount: payload.fixedCount,
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
    remainingIssues: payload.remaining,
  })
}

/**
 * COMMITTING ──COMMITTED──► COMPLETE
 * Finalize: build manuscript, checkpoint, sync, persist.
 */
async function handleCommitted(memory, _payload) {
  await memory.instances.commitService.buildManuscript?.(
    memory.scenePlan.value,
    memory.writtenScenes.value,
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
        `Available events: [${Object.keys(ROUTING_TABLE[currentPhase] ?? {}).join(', ')}]`,
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
