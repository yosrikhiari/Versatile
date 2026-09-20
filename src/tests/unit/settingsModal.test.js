import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/ollamaService', () => ({
  getAvailableModels: async () => [],
  getStoredOpenAIKey: async () => '',
  setStoredOpenAIKey: async () => {}
}))

const { default: SettingsModal } = await import('@/components/layout/SettingsModal.vue')

beforeEach(() => {
  setActivePinia(createPinia())
})

function mountModal() {
  return mount(SettingsModal, {
    props: { show: true },
    global: {
      stubs: {
        AISettingsTab: true,
        ActiveLearningPanel: true,
        VoiceProfileDisplay: true,
        VoiceUploadModal: true
      }
    }
  })
}

describe('SettingsModal', () => {
  it('closes on Escape like every other modal', async () => {
    const wrapper = mountModal()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('ignores Escape once closed', async () => {
    const wrapper = mountModal()
    await wrapper.setProps({ show: false })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close') || []).toHaveLength(0)
  })
})
