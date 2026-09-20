import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

vi.mock('@/services/ollamaService', () => ({
  getAvailableModels: async () => [],
  getStoredOpenAIKey: async () => '',
  setStoredOpenAIKey: async () => {}
}))

const { default: StoryBiblePanel } = await import('@/components/storybible/StoryBiblePanel.vue')
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

function mountPanel() {
  return mount(StoryBiblePanel, {
    global: {
      stubs: {
        CharacterPortrait: true,
        EntityPropertiesPanel: true,
        TraitSuggestionsPopover: true,
        GenerateCharacterModal: true,
        StoryQueryView: true,
        StoryBibleDocumentEditor: true,
        CharacterChatSession: true,
        Modal: { template: '<div class="modal-stub"><slot /></div>' }
      }
    }
  })
}

describe('StoryBible group chat entry', () => {
  it('offers group chat once two characters are selected', async () => {
    const wrapper = mountPanel()
    await flush()
    await nextTick()

    expect(wrapper.text()).not.toContain('Group chat (2)')
    const boxes = wrapper.findAll('input[type="checkbox"]')
    expect(boxes.length).toBeGreaterThanOrEqual(2)

    await boxes[0].setValue(true)
    await boxes[1].setValue(true)
    await nextTick()

    expect(wrapper.text()).toContain('Group chat (2)')
  })

  it('opens the chat modal with both ids and clears the selection', async () => {
    const wrapper = mountPanel()
    await flush()
    await nextTick()

    const boxes = wrapper.findAll('input[type="checkbox"]')
    await boxes[0].setValue(true)
    await boxes[1].setValue(true)
    await nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Group chat'))
      .trigger('click')
    await nextTick()

    const session = wrapper.findComponent({ name: 'CharacterChatSession' })
    expect(session.props('characterIds')).toEqual(['c-nina', 'c-leo'])
    expect(wrapper.text()).not.toContain('Group chat (2)')
  })
})
