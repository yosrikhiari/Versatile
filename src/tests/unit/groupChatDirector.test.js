import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../composables/useAiService', () => ({
  aiGenerateStructured: vi.fn()
}))

const { aiGenerateStructured } = await import('../../composables/useAiService')
const { pickSpeakers, buildDirectorPrompt, SURPRISE_ODDS, MAX_SPEAKERS_PER_TURN } =
  await import('../../composables/useGroupChatDirector')

const PROFILES = [
  { id: 'c-nina', name: 'Nina', stakes: 'guarded, avoids her father' },
  { id: 'c-leo', name: 'Leo', stakes: 'stubborn, few words' },
  { id: 'c-mara', name: 'Mara', stakes: 'mediator, warm' }
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('group chat director', () => {
  it('returns the model speakers and surprise flag', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Leo', 'Mara'], surprise: true })
    const pick = await pickSpeakers({ transcript: 'User: hello', profiles: PROFILES })
    expect(pick.speakers).toEqual(['c-leo', 'c-mara'])
    expect(pick.surprise).toBe(true)
  })

  it('drops unknown names, dedupes and caps at three', async () => {
    aiGenerateStructured.mockResolvedValue({
      speakers: ['Nina', 'Ghost', 'Nina', 'Leo', 'Mara', 'Leo'],
      surprise: false
    })
    const four = [...PROFILES, { id: 'c-ivan', name: 'Ivan', stakes: 'quiet' }]
    const pick = await pickSpeakers({ transcript: 'User: hi all', profiles: four })
    expect(pick.speakers).toEqual(['c-nina', 'c-leo', 'c-mara'])
    expect(pick.speakers.length).toBeLessThanOrEqual(MAX_SPEAKERS_PER_TURN)
  })

  it('avoids repeating the last speaker unless they are the only pick', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Nina', 'Leo'], surprise: false })
    const pick = await pickSpeakers({
      transcript: 'User: hi',
      profiles: PROFILES,
      lastSpeakerId: 'c-nina'
    })
    expect(pick.speakers).toEqual(['c-leo'])
  })

  it('falls back to the first profile when the model call fails', async () => {
    aiGenerateStructured.mockRejectedValue(new Error('rate limited'))
    const pick = await pickSpeakers({ transcript: 'User: hi', profiles: PROFILES })
    expect(pick.speakers).toEqual(['c-nina'])
    expect(pick.surprise).toBe(false)
  })

  it('falls back to the first profile on an empty pick', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: [], surprise: false })
    const pick = await pickSpeakers({ transcript: 'User: hi', profiles: PROFILES })
    expect(pick.speakers).toEqual(['c-nina'])
  })

  it('asks on the utility lane with a small budget and names the odds', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Mara'], surprise: false })
    await pickSpeakers({ transcript: 'User: hi', profiles: PROFILES, energy: 'chaotic' })
    const options = aiGenerateStructured.mock.calls[0][2]
    expect(options.role).toBe('utility')
    expect(options.maxTokens).toBeLessThanOrEqual(256)
    const prompt = aiGenerateStructured.mock.calls[0][0]
    expect(prompt).toContain('Nina')
    expect(prompt).toContain(String(Math.round(SURPRISE_ODDS.chaotic * 100)))
  })

  it('preserves numeric bible ids so the strict render lookup keeps working', async () => {
    aiGenerateStructured.mockResolvedValue({ speakers: ['Nina'], surprise: false })
    const numeric = [
      { id: 1, name: 'Nina', stakes: 'guarded' },
      { id: 2, name: 'Leo', stakes: 'stubborn' }
    ]
    const pick = await pickSpeakers({ transcript: 'User: hi', profiles: numeric })
    // Dexie auto-ids are numbers; a String() coercion here unnames every
    // reply downstream (storyBibleStore find uses ===).
    expect(pick.speakers).toEqual([1])
  })

  it('buildDirectorPrompt names every character and the surprise odds', () => {
    const prompt = buildDirectorPrompt('User: hi', PROFILES, 'calm')
    expect(prompt).toContain('Nina')
    expect(prompt).toContain('Leo')
    expect(prompt).toContain('Mara')
    expect(prompt).toContain(String(Math.round(SURPRISE_ODDS.calm * 100)))
  })
})
