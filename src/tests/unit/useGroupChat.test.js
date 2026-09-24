import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../../composables/useAiService', () => ({
  aiStream: vi.fn(async (_prompt, _system, onChunk) => {
    if (onChunk) onChunk('Hello', 'Hello')
    return 'Hello'
  }),
  aiGenerateStructured: vi.fn()
}))

vi.mock('../../services/generation/digestContext', () => ({
  buildEarlierChaptersBlock: vi.fn(async () => '')
}))

const { aiStream, aiGenerateStructured } = await import('../../composables/useAiService')
const { buildEarlierChaptersBlock } = await import('../../services/generation/digestContext')
const { SessionBudgetExceededError } = await import('@/services/aiProviderBudget')
const { useCharacterChatStore } = await import('@/stores/characterChatStore')
const { useStoryBibleStore } = await import('@/stores/storyBibleStore')
const { useCharacterChat } = await import('@/composables/useCharacterChat')

const CHARACTERS = [
  { id: 'c-nina', name: 'Nina', role: 'protagonist', goal: 'freedom', voice: 'dry' },
  { id: 'c-leo', name: 'Leo', role: 'father', goal: 'quiet', voice: 'few words' },
  { id: 'c-mara', name: 'Mara', role: 'friend', goal: 'peace', voice: 'warm' }
]

// The group branch lazily imports groupChatGraph, which pulls in LangGraph.
// Cold, under full-suite load, that import alone took the first group test
// past the 15 s test timeout (2 of 4 full runs on 2026-09-24, passing in 2.4 s
// alone). Load it here, under the 60 s hook timeout, so the tests time the
// behaviour and not the module load.
beforeAll(async () => {
  await import('@/composables/generation/chat/groupChatGraph')
})

beforeEach(async () => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  useStoryBibleStore().characters = CHARACTERS.map((c) => ({ ...c }))
})

async function startChat(ids) {
  const chatStore = useCharacterChatStore()
  await chatStore.startSession(ids, 'p1')
  return chatStore
}

describe('useCharacterChat group branch', () => {
  it('solo chat answers as the single character without directing', async () => {
    const chatStore = await startChat(['c-nina'])
    await useCharacterChat().sendMessage('hi')

    const messages = chatStore.activeMessages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hi' })
    expect(messages[1]).toMatchObject({ role: 'assistant', characterId: 'c-nina' })
    expect(messages[1].content).toBe('Hello')
    expect(chatStore.isStreaming).toBe(false)
    expect(chatStore.streamError).toBeNull()
    expect(aiGenerateStructured).not.toHaveBeenCalled()
    expect(aiStream).toHaveBeenCalledTimes(1)
  })

  it('group chat voices each picked speaker in order with a labeled surprise', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Leo', 'Mara'], surprise: true })
    const chatStore = await startChat(['c-nina', 'c-leo', 'c-mara'])
    await useCharacterChat().sendMessage('hi all')

    const messages = chatStore.activeMessages
    expect(messages).toHaveLength(3)
    expect(messages[1]).toMatchObject({ role: 'assistant', characterId: 'c-leo' })
    expect(messages[2]).toMatchObject({ role: 'assistant', characterId: 'c-mara' })
    expect(messages[1].directorNote).toBe('Leo interrupts')
    expect(messages[2].directorNote).toBeUndefined()
    expect(aiStream).toHaveBeenCalledTimes(2)
  })

  it('the real director filter drops a repeat of the last speaker', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Leo', 'Nina'], surprise: false })
    const chatStore = await startChat(['c-nina', 'c-leo'])
    chatStore.addMessage('assistant', 'prev', 'c-leo')
    await useCharacterChat().sendMessage('again')

    const replies = chatStore.activeMessages.filter((m) => m.role === 'assistant')
    expect(replies.map((m) => m.characterId)).toEqual(['c-leo', 'c-nina'])
  })

  it('an empty pick falls back to the first profile', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: [], surprise: false })
    const chatStore = await startChat(['c-nina', 'c-leo'])
    await useCharacterChat().sendMessage('hi')

    const replies = chatStore.activeMessages.filter((m) => m.role === 'assistant')
    expect(replies.map((m) => m.characterId)).toEqual(['c-nina'])
  })

  it('draws the director and every speaker from one session budget', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Leo', 'Mara'], surprise: false })
    const chatStore = await startChat(['c-nina', 'c-leo', 'c-mara'])
    await useCharacterChat().sendMessage('hi all')

    const directorBudget = aiGenerateStructured.mock.calls[0][2].sessionBudget
    expect(directorBudget).toBeDefined()
    expect(typeof directorBudget.check).toBe('function')
    for (const call of aiStream.mock.calls) {
      expect(call[3].sessionBudget).toBe(directorBudget)
    }
    expect(chatStore.activeMessages.filter((m) => m.role === 'assistant')).toHaveLength(2)
  })

  it('a spent budget stops the turn, keeps streamed replies and names the stall', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Leo', 'Mara'], surprise: false })
    aiStream
      .mockImplementationOnce(async (_prompt, _system, onChunk) => {
        if (onChunk) onChunk('Hello', 'Hello')
        return 'Hello'
      })
      .mockRejectedValueOnce(new SessionBudgetExceededError('session cap reached'))
    const chatStore = await startChat(['c-nina', 'c-leo', 'c-mara'])
    await useCharacterChat().sendMessage('hi all')

    const replies = chatStore.activeMessages.filter((m) => m.role === 'assistant')
    expect(replies).toHaveLength(2)
    expect(replies[0].content).toBe('Hello')
    expect(chatStore.streamError).toContain('session cap reached')
    expect(chatStore.isStreaming).toBe(false)
    expect(replies[1].content).not.toContain('[Error:')
  })

  it('keeps numeric bible ids on replies so names resolve', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Leo'], surprise: false })
    useStoryBibleStore().characters = [
      { id: 1, name: 'Nina' },
      { id: 2, name: 'Leo' }
    ]
    const chatStore = await startChat([1, 2])
    await useCharacterChat().sendMessage('hi')

    const replies = chatStore.activeMessages.filter((m) => m.role === 'assistant')
    expect(replies).toHaveLength(1)
    // Strict equality, like getMessageCharacterName's find.
    expect(replies[0].characterId).toBe(2)
    expect(useStoryBibleStore().characters.find((c) => c.id === replies[0].characterId)?.name).toBe(
      'Leo'
    )
  })

  it('appends the chapter digest to the responder prompt when digests exist', async () => {
    buildEarlierChaptersBlock.mockResolvedValue('Chapter 1: Mara left the harbour.')
    await startChat(['c-nina'])
    await useCharacterChat().sendMessage('hi')

    expect(buildEarlierChaptersBlock).toHaveBeenCalledWith(
      expect.objectContaining({ budgetTokens: 150 })
    )
    const systemPrompt = aiStream.mock.calls[0][1]
    expect(systemPrompt).toContain('Chapter 1: Mara left the harbour.')
  })
})
