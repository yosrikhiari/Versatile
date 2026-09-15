import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

/**
 * StoryNetwork's Phase-5 controls, with VueFlow and the heavy children
 * stubbed: the relationship-type list comes from the store's edges, toggling
 * a type drops only those edges from what VueFlow is handed, clicking a
 * node enters local mode with that focus, and Clear resets.
 */
vi.mock('@vue-flow/core', () => ({
  VueFlow: {
    name: 'VueFlow',
    props: ['nodes', 'edges'],
    emits: ['node-click'],
    template:
      '<div data-test="vueflow" :data-edges="edges.length" :data-nodes="nodes.length"><slot /></div>'
  },
  useVueFlow: () => ({
    onNodeDragStop: vi.fn(),
    onNodeDrag: vi.fn(),
    onViewportChange: vi.fn(),
    fitView: vi.fn(),
    screenToFlowCoordinate: vi.fn((p) => p),
    onPaneClick: vi.fn(),
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 }))
  }),
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  Handle: { template: '<span />' }
}))
vi.mock('@vue-flow/background', () => ({ Background: { template: '<div />' } }))
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { template: '<div />' } }))
vi.mock('@vue-flow/controls', () => ({ Controls: { template: '<div />' } }))
vi.mock('@vue-flow/core/dist/style.css', () => ({}))
vi.mock('@vue-flow/core/dist/theme-default.css', () => ({}))
vi.mock('@vue-flow/minimap/dist/style.css', () => ({}))
vi.mock('@vue-flow/controls/dist/style.css', () => ({}))

import StoryNetwork from '@/components/storybible/StoryNetwork.vue'
import { useStoryGraphStore } from '@/stores/storyGraphStore'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useProjectStore } from '@/stores/projectStore'

const stubs = {
  EntitySidebar: true,
  AddConnectionModal: true,
  SuggestionsModal: true,
  ApplySuggestionsModal: true,
  AutoGenerateModal: true,
  BaseIcon: { template: '<i />' },
  BasePopover: {
    name: 'BasePopover',
    template: '<div><slot name="trigger" :toggle="() => {}" /><slot :close="() => {}" /></div>'
  }
}

function seed() {
  useProjectStore().currentProjectId = 'p1'
  const bible = useStoryBibleStore()
  bible.characters.push(
    { id: '1', name: 'Halden', role: 'officer' },
    { id: '2', name: 'Ines', role: 'inspector' }
  )
  bible.locations.push({ id: '1', name: 'The Docks' })
  const graph = useStoryGraphStore()
  graph.nodeInstances = { 'char-1': ['char-1'], 'char-2': ['char-2'], 'loc-1': ['loc-1'] }
  graph.edges.push(
    {
      id: 'e1',
      projectId: 'p1',
      sourceId: '1',
      sourceType: 'character',
      targetId: '2',
      targetType: 'character',
      relationshipType: 'ally'
    },
    {
      id: 'e2',
      projectId: 'p1',
      sourceId: '2',
      sourceType: 'character',
      targetId: '1',
      targetType: 'location',
      relationshipType: 'lives_in'
    }
  )
  return graph
}

describe('StoryNetwork filters, local graph and search', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lists the relationship types present and hides only the toggled type', async () => {
    seed()
    const w = mount(StoryNetwork, { global: { stubs } })
    await flushPromises()
    const flow = w.find('[data-test="vueflow"]')
    expect(flow.exists()).toBe(true)
    expect(flow.attributes('data-edges')).toBe('2')
    expect(w.find('[data-test="reltype-ally"]').exists()).toBe(true)
    expect(w.find('[data-test="reltype-lives_in"]').exists()).toBe(true)

    await w.find('[data-test="reltype-ally"]').trigger('change')
    expect(w.vm.disabledRelTypes.has('ally')).toBe(true)
    expect(w.find('[data-test="vueflow"]').attributes('data-edges')).toBe('1')
    expect(w.vm.visibleEdges.map((e) => e.data.relationshipType)).toEqual(['lives_in'])
  })

  it('clicking a node enters local mode focused on it; the neighbourhood is what stays', async () => {
    seed()
    const w = mount(StoryNetwork, { global: { stubs } })
    await flushPromises()
    w.findComponent({ name: 'VueFlow' }).vm.$emit('node-click', { node: { id: 'loc-1' } })
    await flushPromises()
    expect(w.vm.localGraphMode).toBe(true)
    expect(w.vm.focusNodeId).toBe('loc-1')
    // Depth 1 from the Docks: Ines and the lives_in edge; Halden's ally edge is out.
    expect(w.vm.isNodeIncluded('char-2')).toBe(true)
    expect(w.vm.isNodeIncluded('char-1')).toBe(false)
    expect(w.vm.visibleEdges.map((e) => e.data.relationshipType)).toEqual(['lives_in'])
    w.vm.localDepth = 2
    await flushPromises()
    expect(w.vm.isNodeIncluded('char-1')).toBe(true)
    await w.find('[data-test="clear-focus"]').trigger('click')
    expect(w.vm.localGraphMode).toBe(false)
    expect(w.vm.focusNodeId).toBeNull()
  })

  it('search lists matching nodes', async () => {
    seed()
    const w = mount(StoryNetwork, { global: { stubs } })
    await flushPromises()
    await w.find('[data-test="focus-query"]').setValue('hal')
    expect(w.vm.focusMatches.map((n) => n.id)).toEqual(['char-1'])
    expect(w.find('[data-test="focus-char-1"]').exists()).toBe(true)
  })
})
