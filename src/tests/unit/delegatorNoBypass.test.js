import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { Delegator } from '../../composables/generation/delegator/Delegator'
import { createAgentMemory } from '../../composables/generation/delegator/AgentMemory'
import { SceneInteractionService } from '../../composables/generation/interaction/SceneInteractionService'

const SRC = resolve(process.cwd(), 'src')

/** Every .ts/.vue file under src, excluding the test tree. */
function productionFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'tests') continue
      productionFiles(full, out)
    } else if (/\.(ts|vue)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const PRODUCTION_SOURCE = productionFiles()
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

/** Event names keyed under each phase in ROUTING_TABLE. */
function routedEvents() {
  const src = readFileSync(join(SRC, 'composables/generation/delegator/Delegator.ts'), 'utf8')
  const table = src.slice(
    src.indexOf('const ROUTING_TABLE'),
    src.indexOf('\n}\n', src.indexOf('const ROUTING_TABLE'))
  )
  const events = new Set()
  for (const m of table.matchAll(/^\s{4}([A-Z_]+):\s*\{\s*nextPhase/gm)) events.add(m[1])
  return [...events]
}

describe('routing table has no shadow entries', () => {
  // ERROR and RESET are reachable from every phase by construction (the
  // dispatch fallback), so they are not per-phase claims about wiring.
  const UNIVERSAL = new Set(['ERROR', 'RESET'])

  it('finds the events (guard against the parser silently matching nothing)', () => {
    const events = routedEvents()
    expect(events.length).toBeGreaterThan(15)
    expect(events).toContain('SCENE_WRITTEN')
    expect(events).toContain('SYNC_APPROVED')
  })

  it('every routed event is dispatched by production code', () => {
    // The regression this exists for: eight events — START, VOLUME_CREATED,
    // plan-preview REJECTED, scene-review APPROVED/REJECTED, SYNC_APPROVED,
    // SYNC_REJECTED, FIXED and RETRY — had a route and no dispatcher, because
    // SceneInteractionService moved the phase by assigning to the ref instead.
    // A route nothing dispatches is a claim about the run that is not true.
    const orphans = routedEvents()
      .filter((ev) => !UNIVERSAL.has(ev))
      .filter((ev) => !new RegExp(`(dispatch|advance)\\(\\s*['"]${ev}['"]`).test(PRODUCTION_SOURCE))

    expect(orphans).toEqual([])
  })

  it('nothing outside the delegator assigns to a phase ref', () => {
    // `memory.phase` is now readonly on the way out, but a string search also
    // catches a service that kept its own phase ref in parallel.
    const offenders = productionFiles()
      .filter((f) => !f.includes('AgentMemory'))
      .filter((f) =>
        /phase\.value\s*=\s*['"]/.test(readFileSync(f, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, ''))
      )

    expect(offenders).toEqual([])
  })
})

describe('SceneInteractionService routes through the machine', () => {
  let memory
  let delegator
  let commitSync
  let commitAndStoreScene

  function makeService(overrides = {}) {
    memory = createAgentMemory()
    memory.instances.actLog = { addEntry: vi.fn() }
    delegator = new Delegator(memory)
    commitSync = vi.fn().mockResolvedValue(undefined)
    commitAndStoreScene = vi.fn().mockResolvedValue(undefined)

    const svc = new SceneInteractionService({
      writeParams: { value: { projectId: 'p1', sections: [], storyArc: '', storyContract: '' } },
      scenePlan: { value: [{ sceneNumber: 1 }, { sceneNumber: 2 }, { sceneNumber: 3 }] },
      phase: memory.phase,
      dispatch: (event, payload) => delegator.dispatch(event, payload),
      progress: { statusText: '' },
      writer: {},
      sync: { commitSync },
      actLog: { addEntry: vi.fn() },
      writtenScenes: memory.writtenScenes,
      structuredResults: [{ structured: { summary: 'a' } }],
      hasPendingBatches: memory.hasPendingBatches,
      pendingBatchStart: memory.pendingBatchStart,
      manuscriptStore: {},
      storyBibleStore: { characters: [], locations: [], plotThreads: [] },
      commitService: { commitAndStoreScene },
      rejectedPatterns: memory.rejectedPatterns,
      autoMode: memory.autoMode,
      sceneReviewMode: memory.sceneReviewMode,
      currentSceneResult: memory.currentSceneResult,
      currentWriteIndex: memory.currentWriteIndex,
      lastSyncedResultIndex: memory.lastSyncedResultIndex,
      syncPreview: memory.syncPreview,
      currentTaskId: { value: 't1' },
      volumeId: memory.volumeId,
      consistencyService: {},
      ...overrides
    })
    svc.onWriteNextBatch = vi.fn().mockResolvedValue(undefined)
    svc.onCompleteGeneration = vi.fn().mockResolvedValue(undefined)
    return svc
  }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('approveScene dispatches APPROVED and the transition lands in history', async () => {
    const svc = makeService()
    memory.setPhase('scene-review')
    memory.currentWriteIndex.value = 2
    memory.currentSceneResult.value = {
      scene: { sceneNumber: 2 },
      sceneIndex: 1,
      fullProse: 'words',
      sectionIdx: 0,
      structured: {}
    }

    await svc.approveScene()

    expect(memory.phase.value).toBe('writing')
    expect(commitAndStoreScene).toHaveBeenCalledTimes(1)
    const hop = delegator.getHistory().find((h) => h.event === 'APPROVED')
    expect(hop).toMatchObject({ from: 'scene-review', to: 'writing' })
  })

  it('rejectScene records the pattern through the handler, not inline', async () => {
    const svc = makeService()
    memory.setPhase('scene-review')
    memory.currentWriteIndex.value = 2
    memory.writtenScenes.value = [{ prose: 'one' }, { prose: 'two' }]
    memory.currentSceneResult.value = {
      scene: { sceneNumber: 2, title: 'The Ford' },
      fullProse: 'rejected prose'
    }

    await svc.rejectScene()

    expect(memory.phase.value).toBe('writing')
    // Exactly one pattern — the handler's. An inline push alongside it was the
    // double-record this rewire removes.
    expect(memory.rejectedPatterns.value).toHaveLength(1)
    expect(memory.rejectedPatterns.value[0].title).toBe('The Ford')
    // The rejected slot is cleared and the cursor rewound onto it.
    expect(memory.writtenScenes.value[1]).toBeNull()
    expect(memory.currentWriteIndex.value).toBe(1)
    expect(svc.onWriteNextBatch).toHaveBeenCalledWith(1)
  })

  it('rerequestScene rewinds without repudiating the scene', async () => {
    const svc = makeService()
    memory.setPhase('scene-review')
    memory.currentWriteIndex.value = 2
    memory.writtenScenes.value = [{ prose: 'one' }, { prose: 'two' }]
    memory.currentSceneResult.value = { scene: { sceneNumber: 2 }, fullProse: 'x' }

    await svc.rerequestScene('more tension please')

    expect(memory.phase.value).toBe('writing')
    expect(memory.currentWriteIndex.value).toBe(1)
    // Unlike a rejection: nothing nulled, nothing learned as a bad pattern.
    expect(memory.writtenScenes.value[1]).not.toBeNull()
    expect(memory.rejectedPatterns.value).toHaveLength(0)
    expect(svc.scenePlan.value[1].reRequestInstruction).toBe('more tension please')
  })

  it('confirmSync commits exactly once and clears the preview', async () => {
    // The handler used to commit too. Routing through it without moving the
    // commit out would have applied every batch twice.
    const svc = makeService()
    memory.setPhase('sync-preview')
    memory.syncPreview.value = [{ type: 'character', name: 'Mara' }]
    memory.hasPendingBatches.value = true
    memory.pendingBatchStart.value = 3

    await svc.confirmSync({
      acceptedEntities: [{ name: 'Mara' }],
      projectId: 'p1',
      volumeId: 'v1',
      chapterId: null
    })

    expect(commitSync).toHaveBeenCalledTimes(1)
    expect(memory.phase.value).toBe('writing')
    expect(memory.syncPreview.value).toBeNull()
    expect(memory.hasPendingBatches.value).toBe(false)
    expect(svc.onWriteNextBatch).toHaveBeenCalledWith(3)
  })

  it('confirmSync with no pending batch finishes the run instead of resuming', async () => {
    const svc = makeService()
    memory.setPhase('sync-preview')
    memory.hasPendingBatches.value = false

    await svc.confirmSync({
      acceptedEntities: [],
      projectId: 'p1',
      volumeId: 'v1',
      chapterId: null
    })

    expect(memory.phase.value).toBe('writing')
    expect(svc.onWriteNextBatch).not.toHaveBeenCalled()
    expect(svc.onCompleteGeneration).toHaveBeenCalledWith('p1')
  })

  it('regenerateScene has a real route out of complete', () => {
    makeService()
    memory.setPhase('complete')
    // Previously reachable only by assigning the ref: `complete` had no route
    // to `writing` at all.
    expect(delegator.canDispatch('REGENERATE')).toBe(true)
  })
})
