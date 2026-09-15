import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDelegatorGeneration } from '@/composables/generation/delegator/useDelegatorGeneration'

/**
 * One instance set, one budget. The Delegator used to build its own
 * director/writer/critic and wire the session budget onto them, while the
 * orchestrator called a different set and re-assigned the budget after the
 * fact. Handing the orchestrator's instances in removes the second set.
 */
describe('useDelegatorGeneration instance overrides', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('uses the instances it is handed and wires the budget onto them', () => {
    const director = { name: 'director' }
    const writer = { name: 'writer' }
    const critic = { name: 'critic' }
    const sync = { discoverSync: () => [], commitSync: async () => ({}) }
    const api = useDelegatorGeneration({ director, writer, critic, sync })
    const { instances } = api.memory
    expect(instances.director).toBe(director)
    expect(instances.writer).toBe(writer)
    expect(instances.critic).toBe(critic)
    expect(instances.sync).toBe(sync)
    expect(instances.sessionBudget).toBeTruthy()
    expect(writer.sessionBudget).toBe(instances.sessionBudget)
    expect(director.sessionBudget).toBe(instances.sessionBudget)
    expect(critic.sessionBudget).toBe(instances.sessionBudget)
  })

  it('still builds its own instances when given none', () => {
    const api = useDelegatorGeneration()
    const { instances } = api.memory
    expect(
      typeof instances.writer?.writeSceneStructured === 'function' || instances.writer
    ).toBeTruthy()
    expect(instances.writer.sessionBudget).toBe(instances.sessionBudget)
  })
})
