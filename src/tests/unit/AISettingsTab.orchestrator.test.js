import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/ollamaService', () => ({
  getAvailableModels: async () => ['qwen3:8b', 'qwen2.5:3b-instruct', 'gemma3:4b'],
  getStoredOpenAIKey: async () => '',
  setStoredOpenAIKey: async () => {}
}))

const { default: AISettingsTab } = await import('@/components/layout/AISettingsTab.vue')
const { useSettingsStore } = await import('@/stores/settingsStore')
const { getRolePlacement, resetRolePlacements } = await import('@/config/roles')
const { setOllamaModel, setOllamaUtilityModel } = await import('@/config/ollama')

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  resetRolePlacements()
  setOllamaModel('qwen3:8b')
  setOllamaUtilityModel('qwen3:8b')
})

describe('AISettingsTab — orchestrator and role placement', () => {
  it('switches the orchestrator and the editor mode through the store', async () => {
    const wrapper = mount(AISettingsTab)
    await flush()
    const store = useSettingsStore()
    expect(store.orchestrator).toBe('legacy')

    const orchestrator = wrapper.find('#orchestrator')
    await orchestrator.setValue('langgraph')
    expect(store.orchestrator).toBe('langgraph')

    const mode = wrapper.find('#orchestrator-mode')
    expect(mode.attributes('disabled')).toBeUndefined()
    await mode.setValue('agentic')
    expect(store.orchestratorMode).toBe('agentic')
    // Persisted the way the rest of the settings are.
    expect(JSON.parse(localStorage.getItem('versatile_settings'))).toMatchObject({
      orchestrator: 'langgraph',
      orchestratorMode: 'agentic'
    })
  })

  it('shows the judge-is-author warning by default and the preset clears it', async () => {
    const wrapper = mount(AISettingsTab)
    await flush()
    const issues = () => wrapper.findAll('[data-test="placement-issue"]').map((n) => n.text())
    expect(issues().some((t) => /judge is the author/.test(t))).toBe(true)

    await wrapper.find('[data-test="apply-multi-agent-preset"]').trigger('click')
    await flush()
    expect(issues()).toEqual([])
    expect(getRolePlacement('critic')).toMatchObject({
      model: 'qwen2.5:3b-instruct',
      device: 'cpu'
    })
    expect(getRolePlacement('editor')).toMatchObject({ device: 'cpu' })
  })

  it('placing a second model on the GPU shows the eviction error while editing', async () => {
    const wrapper = mount(AISettingsTab)
    // The parent panel calls loadModels() when the tab opens; do the same.
    await wrapper.vm.loadModels()
    await flush()
    const criticRow = wrapper.find('[data-test="role-critic"]')
    const select = criticRow.find('select[aria-label="Critic model"]')
    expect(select.findAll('option').map((o) => o.text())).toContain('gemma3:4b')
    await select.setValue('gemma3:4b')
    await flush()
    const issues = wrapper.findAll('[data-test="placement-issue"]').map((n) => n.text())
    expect(getRolePlacement('critic')).toMatchObject({ model: 'gemma3:4b', device: 'gpu' })
    expect(issues.some((t) => /✕/.test(t) && /evicts the first/.test(t))).toBe(true)
  })
})
