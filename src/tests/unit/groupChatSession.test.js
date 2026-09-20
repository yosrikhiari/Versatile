import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

vi.mock('@/services/ollamaService', () => ({
  getAvailableModels: async () => [],
  getStoredOpenAIKey: async () => '',
  setStoredOpenAIKey: async () => {}
}))

const { default: CharacterChatSession } =
  await import('@/components/characterchat/CharacterChatSession.vue')
const { useCharacterChatStore } = await import('@/stores/characterChatStore')
const { useStoryBibleStore } = await import('@/stores/storyBibleStore')

const CHARACTERS = [
  { id: 'c-nina', name: 'Nina' },
  { id: 'c-leo', name: 'Leo' }
]

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  setActivePinia(createPinia())
  useStoryBibleStore().characters = CHARACTERS.map((c) => ({ ...c }))
})

async function mountSession(ids) {
  const wrapper = mount(CharacterChatSession, {
    props: { characterIds: ids, projectId: 'p1' }
  })
  await flush()
  await nextTick()
  return wrapper
}

describe('CharacterChatSession group UI', () => {
  it('shows the intensity control only for group chats', async () => {
    const group = await mountSession(['c-nina', 'c-leo'])
    expect(group.find('[aria-label="Surprise intensity"]').exists()).toBe(true)
    expect(group.findAll('[role="radio"]').map((n) => n.text())).toEqual([
      'Calm',
      'Lively',
      'Chaotic'
    ])

    const solo = await mountSession(['c-nina'])
    expect(solo.find('[aria-label="Surprise intensity"]').exists()).toBe(false)
  })

  it('defaults to lively and persists the picked energy', async () => {
    const wrapper = await mountSession(['c-nina', 'c-leo'])
    const chatStore = useCharacterChatStore()
    expect(chatStore.activeSession.energy).toBe('lively')

    await wrapper.findAll('[role="radio"]')[2].trigger('click')
    expect(chatStore.activeSession.energy).toBe('chaotic')
  })

  it('shows the speaker name for numeric bible ids', async () => {
    useStoryBibleStore().characters = [
      { id: 1, name: 'Nina' },
      { id: 2, name: 'Leo' }
    ]
    const wrapper = await mountSession([1, 2])
    const chatStore = useCharacterChatStore()
    chatStore.addMessage('assistant', 'Hello', 2)
    await nextTick()

    expect(wrapper.text()).toContain('Leo')
  })

  it('renders the director surprise note as a divider', async () => {
    const wrapper = await mountSession(['c-nina', 'c-leo'])
    const chatStore = useCharacterChatStore()
    chatStore.addMessage('assistant', 'Hello', 'c-leo')
    const messages = chatStore.activeMessages
    messages[messages.length - 1].directorNote = 'Leo interrupts'
    await nextTick()

    expect(wrapper.text()).toContain('Leo interrupts')
  })
})
