import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { Delegator } from '../../composables/generation/delegator/Delegator'
import { createAgentMemory } from '../../composables/generation/delegator/AgentMemory'

function makeDelegator() {
  const memory = createAgentMemory()
  memory.instances.actLog = { addEntry() {} }
  return { delegator: new Delegator(memory), memory }
}

describe('Delegator routing', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reaches complete through the real terminal sequence', async () => {
    const { delegator, memory } = makeDelegator()
    await delegator.dispatch('BOOTSTRAP_START', { projectId: 1, volumeId: 2 })
    await delegator.dispatch('BOOTSTRAPPED', {})
    await delegator.dispatch('PLAN_READY', { projectId: 1, volumeId: 2, plan: [] })
    await delegator.dispatch('CONFIRMED', {})
    await delegator.dispatch('SPINE_GENERATED', {})
    expect(memory.phase.value).toBe('writing')

    // The stages the UI renders — repair, continuity, saving — are real phases
    // and have to be entered, not skipped over on the way to complete.
    await delegator.dispatch('ALL_WRITTEN', {})
    expect(memory.phase.value).toBe('repairing')
    await delegator.dispatch('REPAIRED', {})
    expect(memory.phase.value).toBe('consistency-check')
    await delegator.dispatch('NO_ISSUES', {})
    expect(memory.phase.value).toBe('committing')
    await delegator.dispatch('COMMITTED', {})
    expect(memory.phase.value).toBe('complete')
  })

  it('routes a consistency-issue run through the fix phase to committing', async () => {
    const { delegator, memory } = makeDelegator()
    memory.setPhase('consistency-check')
    await delegator.dispatch('HAS_ISSUES', { issues: [{ text: 'eye colour' }] })
    expect(memory.phase.value).toBe('consistency-fix')
    await delegator.dispatch('MAX_ROUNDS', { round: 1, remaining: 1 })
    expect(memory.phase.value).toBe('committing')
  })

  it('canDispatch reports whether an event has a route out of the current phase', () => {
    const { delegator, memory } = makeDelegator()
    memory.setPhase('writing')
    expect(delegator.canDispatch('ALL_WRITTEN')).toBe(true)
    expect(delegator.canDispatch('COMMITTED')).toBe(false)
    memory.setPhase('consistency-check')
    expect(delegator.canDispatch('WRITING_DONE')).toBe(false)
    expect(delegator.canDispatch('NO_ISSUES')).toBe(true)
  })

  it('ERROR reaches the error phase from a phase that does not route it', async () => {
    // Regression: an unrouted ERROR used to throw, replacing the caller's real
    // failure with a state-machine complaint and leaving the run mid-phase.
    const { delegator, memory } = makeDelegator()
    memory.setPhase('complete')
    expect(delegator.canDispatch('ERROR')).toBe(false)
    const result = await delegator.dispatch('ERROR', { message: 'disk full' })
    expect(result.nextPhase).toBe('error')
    expect(memory.phase.value).toBe('error')
    expect(memory.progress.value.statusText).toContain('disk full')
  })

  it('RESET reaches idle from any phase', async () => {
    const { delegator, memory } = makeDelegator()
    memory.setPhase('repairing')
    await delegator.dispatch('RESET', {})
    expect(memory.phase.value).toBe('idle')
  })

  it('still throws for a genuinely unroutable non-recovery event', async () => {
    const { delegator, memory } = makeDelegator()
    memory.setPhase('complete')
    await expect(delegator.dispatch('SPINE_GENERATED', {})).rejects.toThrow(/no route/)
  })

  it('restore() puts a resumed run straight into writing', async () => {
    // Regression: resume dispatched SPINE_GENERATED out of `idle`, which has no
    // route, so it threw before the first scene and Resume did nothing.
    const { delegator, memory } = makeDelegator()
    expect(memory.phase.value).toBe('idle')
    expect(delegator.canDispatch('SPINE_GENERATED')).toBe(false)
    delegator.restore('writing', 'resumed from checkpoint')
    expect(memory.phase.value).toBe('writing')
    expect(delegator.canDispatch('ALL_WRITTEN')).toBe(true)
  })

  it('restore() rejects a phase that is not in the routing table', () => {
    const { delegator } = makeDelegator()
    expect(() => delegator.restore('not-a-phase')).toThrow(/unknown phase/)
  })

  it('uses the caller-supplied sync preview instead of re-deriving it', async () => {
    const { delegator, memory } = makeDelegator()
    memory.setPhase('writing')
    const preview = [{ type: 'character', name: 'Mara' }]
    await delegator.dispatch('BATCH_COMPLETE', { batchStart: 0, batchEnd: 3, preview })
    expect(memory.phase.value).toBe('sync-preview')
    expect(memory.syncPreview.value).toEqual(preview)
  })
})
