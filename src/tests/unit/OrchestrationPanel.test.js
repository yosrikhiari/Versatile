import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/services/ollamaService', () => ({
  getAvailableModels: async () => ['qwen3:8b', 'qwen2.5:3b-instruct', 'gemma3:4b']
}))

const { default: OrchestrationPanel } =
  await import('@/components/orchestration/OrchestrationPanel.vue')
const { useSettingsStore } = await import('@/stores/settingsStore')
const { useOrchestrationStore } = await import('@/stores/orchestrationStore')
const { getRolePlacement, resetRolePlacements, applyRolePreset, MULTI_AGENT_PRESET } =
  await import('@/config/roles')
const { setOllamaModel, setOllamaUtilityModel } = await import('@/config/ollama')

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  resetRolePlacements()
  setOllamaModel('qwen3:8b')
  setOllamaUtilityModel('qwen3:8b')
})

describe('OrchestrationPanel', () => {
  it('shows the legacy state, and switching to LangGraph reveals the run sections with an empty state that leads to the generator', async () => {
    const wrapper = mount(OrchestrationPanel)
    await flush()
    expect(wrapper.text()).toContain('Legacy')
    expect(wrapper.find('[data-test="lane-gpu"]').exists()).toBe(false)

    const settings = useSettingsStore()
    settings.setOrchestrator('langgraph')
    await flush()
    expect(wrapper.text()).toContain('No graph run yet')
    const openGenerator = wrapper.findAll('button').find((b) => /Open the generator/.test(b.text()))
    expect(openGenerator).toBeTruthy()
    await openGenerator.trigger('click')
    expect(wrapper.emitted('navigate')).toEqual([['story-generator']])
  })

  it('renders the live run: agents busy per lane, scenes, and decisions with their source', async () => {
    const settings = useSettingsStore()
    settings.setOrchestrator('langgraph')
    settings.setOrchestratorMode('agentic')
    // The critic lives on the CPU lane in this run (the preset), so the panel
    // attributes the CPU lane's activity to it.
    applyRolePreset(MULTI_AGENT_PRESET)
    const live = useOrchestrationStore()
    live.startRun({
      runId: 'r1',
      projectId: 'p1',
      mode: 'agentic',
      warnings: ['judge is the author']
    })
    live.setStep(3)
    live.setLane('gpu', {
      kind: 'draft',
      role: 'writer',
      sceneIndex: 1,
      sceneTitle: 'Storm',
      attempt: 1
    })
    live.setLane('cpu', {
      kind: 'critique',
      role: 'critic',
      sceneIndex: 0,
      sceneTitle: 'Harbour',
      attempt: 1
    })
    live.setScenes([
      {
        index: 0,
        title: 'Harbour',
        status: 'critiquing',
        attempts: 1,
        score: null,
        pass: null,
        continuity: null,
        topIssues: [],
        gateFailure: null
      },
      {
        index: 1,
        title: 'Storm',
        status: 'drafting',
        attempts: 0,
        score: null,
        pass: null,
        continuity: null,
        topIssues: [],
        gateFailure: null
      }
    ])
    live.pushDecision({
      gpu: { action: 'draft', target: 1 },
      cpu: { action: 'critique', target: 0 },
      why: 'keep both lanes busy',
      source: 'model'
    })

    const wrapper = mount(OrchestrationPanel)
    await flush()
    expect(wrapper.find('[data-test="lane-gpu"]').text()).toContain('draft “Storm”')
    expect(wrapper.find('[data-test="lane-cpu"]').text()).toContain('critique “Harbour”')
    const activities = wrapper.findAll('[data-test="agent-activity"]').map((n) => n.text())
    expect(activities).toContain('Drafting “Storm”')
    expect(activities).toContain('Judging “Harbour”')
    expect(wrapper.find('[data-test="scene-list"]').text()).toContain('critiquing')
    expect(wrapper.find('[data-test="decision-list"]').text()).toContain('model')
    expect(wrapper.find('[data-test="decision-list"]').text()).toContain('keep both lanes busy')
    expect(wrapper.text()).toContain('step 3 · agentic')
    expect(wrapper.text()).toContain('judge is the author')
  })

  it('edits placement in place and applies the preset', async () => {
    const wrapper = mount(OrchestrationPanel)
    await flush()
    await flush()
    const critic = wrapper.find('[data-test="agent-critic"]')
    await critic.find('select[aria-label="Critic device"]').setValue('cpu')
    await flush()
    expect(getRolePlacement('critic').device).toBe('cpu')

    await wrapper.find('[data-test="apply-preset"]').trigger('click')
    await flush()
    expect(getRolePlacement('critic')).toMatchObject({
      model: 'qwen2.5:3b-instruct',
      device: 'cpu'
    })
    expect(wrapper.findAll('[data-test="placement-issue"]')).toHaveLength(0)
  })

  it('toggles AgentOps tracing in place and lists the traces a run reported', async () => {
    const { isAgentOpsTracing } = await import('@/config/agentops')
    const settings = useSettingsStore()
    settings.setOrchestrator('langgraph')
    const wrapper = mount(OrchestrationPanel)
    await flush()
    expect(isAgentOpsTracing()).toBe(false)
    expect(wrapper.find('[data-test="trace-list"]').exists()).toBe(false)

    await wrapper.find('[data-test="tracing-switch"] button').trigger('click')
    expect(isAgentOpsTracing()).toBe(true)

    const live = useOrchestrationStore()
    live.startRun({ runId: 'p1:r', projectId: 'p1', mode: 'workflow', warnings: [] })
    live.pushTrace({
      traceId: 'abc123def4567890',
      clientRef: 'p1:r/1/critic',
      agentRole: 'critic',
      model: 'qwen2.5:3b-instruct',
      at: Date.now(),
      backend: null
    })
    await flush()
    const list = wrapper.find('[data-test="trace-list"]')
    expect(list.text()).toContain('critic')
    expect(list.text()).toContain('abc123de')
    expect(list.find('a').attributes('href')).toBe(
      'http://localhost:8080/#/traces/abc123def4567890'
    )
  })
})
