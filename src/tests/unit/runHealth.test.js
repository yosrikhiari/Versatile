/**
 * Tests for the run health ledger.
 *
 * The final test replays the actual live failure from
 * planning/LIVE-MANUSCRIPT-AUDIT.md and asserts the run would have been halted
 * after five scenes instead of writing thirteen.
 */
import { describe, it, expect } from 'vitest'
import {
  RunHealth,
  describeRunHealth,
  ABORT_BUDGET,
  MAX_DEGRADED_SCENE_RATIO,
  MAX_RUN_DUPLICATE_RATIO
} from '@/services/generation/runHealth'

describe('recording', () => {
  it('records events with a monotonic sequence and no wall-clock', () => {
    const h = new RunHealth()
    h.record('prose_rejected', { stage: 'writer', sceneIndex: 0, detail: 'looped' })
    h.record('metadata_skipped', { stage: 'writer', sceneIndex: 0 })

    const events = h.getEvents()
    expect(events.map((e) => e.seq)).toEqual([0, 1])
    // Determinism: nothing here may vary between two identical runs.
    for (const e of events) expect(e).not.toHaveProperty('timestamp')
  })

  it('never throws, even on nonsense input', () => {
    const h = new RunHealth()
    expect(() => h.record('prose_rejected', { detail: undefined })).not.toThrow()
    expect(() => h.record('prose_rejected', null)).not.toThrow()
    expect(h.getEvents()).toHaveLength(2)
  })

  it('defaults sceneIndex to null rather than 0', () => {
    // 0 is a real scene index; conflating "no scene" with "scene 0" would
    // corrupt the degraded-scene count.
    const h = new RunHealth()
    h.record('artifact_failed', { stage: 'finalize' })
    expect(h.getEvents()[0].sceneIndex).toBeNull()
    expect(h.degradedScenes()).toBe(0)
  })
})

describe('abort budget', () => {
  it('halts after the configured consecutive failures', () => {
    const h = new RunHealth()
    for (let i = 0; i < ABORT_BUDGET.prose_rejected - 1; i++) {
      h.record('prose_rejected', { sceneIndex: i })
      expect(h.shouldAbort()).toBe(false)
    }
    h.record('prose_rejected', { sceneIndex: 99 })
    expect(h.shouldAbort()).toBe(true)
    expect(h.getAbortReason()).toMatch(/consecutive/)
  })

  it('a clean scene resets the streak', () => {
    const h = new RunHealth()
    h.record('prose_rejected', { sceneIndex: 0 })
    h.record('prose_rejected', { sceneIndex: 1 })
    h.recordSuccess()
    h.record('prose_rejected', { sceneIndex: 2 })
    // Three failures total, but never three in a row.
    expect(h.shouldAbort()).toBe(false)
  })

  it('does not halt on kinds that cannot compound', () => {
    const h = new RunHealth()
    for (let i = 0; i < 20; i++) h.record('prefetch_failed', { sceneIndex: i })
    // A dead prefetch cache does not degrade the next scene's input.
    expect(h.shouldAbort()).toBe(false)
    expect(h.countByKind('prefetch_failed')).toBe(20)
  })

  it('keeps the first abort reason rather than overwriting it', () => {
    const h = new RunHealth()
    for (let i = 0; i < 5; i++) h.record('prose_rejected', { sceneIndex: i })
    const first = h.getAbortReason()
    for (let i = 0; i < 5; i++) h.record('metadata_failed', { sceneIndex: i })
    expect(h.getAbortReason()).toBe(first)
  })
})

describe('degraded scene counting', () => {
  it('counts distinct scenes, not events', () => {
    const h = new RunHealth()
    h.record('prose_rejected', { sceneIndex: 3 })
    h.record('metadata_skipped', { sceneIndex: 3 })
    h.record('gate_failed', { sceneIndex: 3 })
    expect(h.degradedScenes()).toBe(1)
  })
})

describe('invariants', () => {
  const clean = {
    scenesWritten: 10,
    scenesWithMetadata: 10,
    bibleChangesCommitted: 8,
    duplicateRatio: 0.02
  }

  it('passes a healthy run', () => {
    expect(new RunHealth().checkInvariants(clean)).toEqual([])
  })

  it('is silent when nothing was written', () => {
    // A run that produced nothing has already failed elsewhere; piling on
    // invariant violations would bury the real error.
    expect(new RunHealth().checkInvariants({ ...clean, scenesWritten: 0 })).toEqual([])
  })

  it('blocks when no scene produced metadata — the live failure shape', () => {
    const v = new RunHealth().checkInvariants({ ...clean, scenesWithMetadata: 0 })
    expect(v.find((x) => x.code === 'no_metadata')?.severity).toBe('block')
    expect(v.find((x) => x.code === 'no_metadata')?.message).toMatch(/story bible/)
  })

  it('blocks when too many scenes degraded', () => {
    const h = new RunHealth()
    const overBudget = Math.ceil(10 * MAX_DEGRADED_SCENE_RATIO) + 1
    for (let i = 0; i < overBudget; i++) h.record('gate_failed', { sceneIndex: i })
    expect(h.checkInvariants(clean).find((x) => x.code === 'degraded_rate')?.severity).toBe('block')
  })

  it('blocks on majority-duplicate prose', () => {
    const v = new RunHealth().checkInvariants({
      ...clean,
      duplicateRatio: MAX_RUN_DUPLICATE_RATIO + 0.3
    })
    expect(v.find((x) => x.code === 'duplicate_prose')?.severity).toBe('block')
  })

  it('warns — not blocks — when metadata lands but the bible never grows', () => {
    const v = new RunHealth().checkInvariants({ ...clean, bibleChangesCommitted: 0 })
    // A story can genuinely introduce nothing new for a scene or two, so this
    // is suspicious rather than wrong.
    expect(v.find((x) => x.code === 'bible_static')?.severity).toBe('warn')
  })

  it('does not raise bible_static when metadata never ran', () => {
    // no_metadata already explains it; two violations for one cause is noise.
    const v = new RunHealth().checkInvariants({
      ...clean,
      scenesWithMetadata: 0,
      bibleChangesCommitted: 0
    })
    expect(v.find((x) => x.code === 'bible_static')).toBeUndefined()
  })

  it('skips duplicateRatio when it was not measured', () => {
    const v = new RunHealth().checkInvariants({ ...clean, duplicateRatio: undefined })
    expect(v.find((x) => x.code === 'duplicate_prose')).toBeUndefined()
  })
})

describe('serialization', () => {
  it('round-trips events through the checkpoint', () => {
    const h = new RunHealth()
    h.record('prose_rejected', { stage: 'writer', sceneIndex: 2, detail: 'looped' })
    const restored = RunHealth.fromJSON(JSON.parse(JSON.stringify(h.toJSON())))
    expect(restored.countByKind('prose_rejected')).toBe(1)
    expect(restored.getEvents()[0].detail).toBe('looped')
  })

  it('does not inherit an abort state on resume', () => {
    const h = new RunHealth()
    for (let i = 0; i < 5; i++) h.record('prose_rejected', { sceneIndex: i })
    expect(h.shouldAbort()).toBe(true)

    // A resume is a fresh attempt. Inheriting the streak would abort it before
    // it wrote a single scene.
    const restored = RunHealth.fromJSON(h.toJSON())
    expect(restored.shouldAbort()).toBe(false)
    expect(restored.countByKind('prose_rejected')).toBe(5)
  })

  it('survives malformed checkpoint data', () => {
    for (const bad of [null, undefined, {}, { events: 'nope' }, { events: [null, 7] }]) {
      expect(() => RunHealth.fromJSON(bad)).not.toThrow()
    }
  })
})

describe('reporting', () => {
  it('says nothing when the run was clean', () => {
    expect(new RunHealth().summary()).toBe('')
    expect(describeRunHealth(new RunHealth(), [])).toMatch(/No degradation/)
  })

  it('surfaces violations in the description', () => {
    const h = new RunHealth()
    h.record('prose_rejected', { sceneIndex: 0 })
    const text = describeRunHealth(
      h,
      h.checkInvariants({
        scenesWritten: 2,
        scenesWithMetadata: 0,
        bibleChangesCommitted: 0
      })
    )
    expect(text).toMatch(/FAILED/)
    expect(text).toMatch(/prose rejected/)
  })
})

describe('replay of the live 13-scene failure', () => {
  it('halts after five scenes instead of writing thirteen', () => {
    // planning/LIVE-MANUSCRIPT-AUDIT.md: scenes 0, 3 and 4 looped badly
    // (70%, 76%, 60% duplicate); each rejection skipped metadata extraction,
    // which left the bible untouched.
    const h = new RunHealth()
    const looped = new Set([0, 3, 4])
    let scenesWritten = 0

    for (let scene = 0; scene < 13; scene++) {
      if (h.shouldAbort()) break
      scenesWritten++
      if (looped.has(scene)) {
        h.record('prose_rejected', { stage: 'writer', sceneIndex: scene })
        h.record('metadata_skipped', { stage: 'writer', sceneIndex: scene })
        h.record('sync_empty', { stage: 'sync', sceneIndex: scene })
      } else {
        // Even the "clean" scenes committed nothing, because the bible had
        // nothing to attach to — but they did not reset the prose streak,
        // since only a fully successful scene does that.
        h.record('sync_empty', { stage: 'sync', sceneIndex: scene })
      }
    }

    expect(h.shouldAbort()).toBe(true)
    expect(scenesWritten).toBe(5)
    expect(scenesWritten).toBeLessThan(13)

    const violations = h.checkInvariants({
      scenesWritten,
      scenesWithMetadata: 0,
      bibleChangesCommitted: 0,
      duplicateRatio: 0.45
    })
    expect(violations.map((v) => v.code).sort()).toEqual([
      'degraded_rate',
      'duplicate_prose',
      'no_metadata'
    ])
    expect(violations.every((v) => v.severity === 'block')).toBe(true)
  })
})
