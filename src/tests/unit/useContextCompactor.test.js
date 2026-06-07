import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vue', () => ({
  ref: (v) => ({ value: v })
}))

describe('useContextCompactor', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function create() {
    const mod = await import('../../composables/useContextCompactor')
    return mod.useContextCompactor()
  }

  it('starts with empty conversations', async () => {
    const compactor = await create()
    expect(compactor.conversations.value).toEqual({})
    expect(compactor.isCompacting.value).toBe(false)
  })

  it('startConversation initializes an empty array', async () => {
    const compactor = await create()
    compactor.startConversation('call-1')
    expect(compactor.conversations.value['call-1']).toEqual([])
  })

  it('startConversation does not overwrite existing', async () => {
    const compactor = await create()
    compactor.startConversation('call-1')
    compactor.addTurn('call-1', 'user', 'hello')
    compactor.startConversation('call-1')
    expect(compactor.getTurns('call-1')).toHaveLength(1)
  })

  it('addTurn adds a turn and returns length', async () => {
    const compactor = await create()
    compactor.startConversation('call-1')
    const len = compactor.addTurn('call-1', 'user', 'Hello')
    expect(len).toBe(1)
    expect(compactor.getTurns('call-1')).toHaveLength(1)
    expect(compactor.getTurns('call-1')[0].role).toBe('user')
    expect(compactor.getTurns('call-1')[0].content).toBe('Hello')
  })

  it('addTurn auto-starts conversation if not started', async () => {
    const compactor = await create()
    compactor.addTurn('call-1', 'user', 'test')
    expect(compactor.getTurns('call-1')).toHaveLength(1)
  })

  it('getTurns returns empty array for unknown callId', async () => {
    const compactor = await create()
    expect(compactor.getTurns('unknown')).toEqual([])
  })

  it('clearConversation removes conversation', async () => {
    const compactor = await create()
    compactor.addTurn('call-1', 'user', 'test')
    compactor.clearConversation('call-1')
    expect(compactor.getTurns('call-1')).toEqual([])
  })

  it('shouldSuggestCompact returns false when below threshold', async () => {
    const compactor = await create()
    for (let i = 0; i < 7; i++) {
      compactor.addTurn('call-1', 'user', `turn ${i}`)
    }
    expect(compactor.shouldSuggestCompact('call-1')).toBe(false)
  })

  it('shouldSuggestCompact returns true when above threshold', async () => {
    const compactor = await create()
    for (let i = 0; i < 9; i++) {
      compactor.addTurn('call-1', 'user', `turn ${i}`)
    }
    expect(compactor.shouldSuggestCompact('call-1')).toBe(true)
  })
})
