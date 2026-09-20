import { describe, it, expect, vi } from 'vitest'

const { runGroupTurn } = await import('../../composables/generation/chat/groupChatGraph')

const BASE = {
  profiles: [
    { id: 'c-nina', name: 'Nina', stakes: 'guarded' },
    { id: 'c-leo', name: 'Leo', stakes: 'stubborn' }
  ],
  transcript: 'User: hello',
  energy: 'lively',
  lastSpeakerId: null,
  sessionBudget: null
}

describe('group chat graph', () => {
  it('speaks each picked character in order and reports them', async () => {
    const order = []
    const result = await runGroupTurn({
      ...BASE,
      pick: async () => ({ speakers: ['c-leo', 'c-nina'], surprise: true }),
      respond: async (id) => {
        order.push(id)
        return id
      }
    })
    expect(order).toEqual(['c-leo', 'c-nina'])
    expect(result).toEqual({ speakers: ['c-leo', 'c-nina'], surprise: true })
  })

  it('never calls respond when the pick is empty', async () => {
    const respond = vi.fn(async () => null)
    const result = await runGroupTurn({
      ...BASE,
      pick: async () => ({ speakers: [], surprise: false }),
      respond
    })
    expect(respond).not.toHaveBeenCalled()
    expect(result).toEqual({ speakers: [], surprise: false })
  })

  it('keeps earlier replies when a later speaker fails', async () => {
    const order = []
    await expect(
      runGroupTurn({
        ...BASE,
        pick: async () => ({ speakers: ['c-nina', 'c-leo'], surprise: false }),
        respond: async (id) => {
          order.push(id)
          if (id === 'c-leo') throw new Error('provider down')
          return id
        }
      })
    ).rejects.toThrow('provider down')
    expect(order).toEqual(['c-nina', 'c-leo'])
  })
})
