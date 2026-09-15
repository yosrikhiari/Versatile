import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed } from 'vue'

/**
 * ConsistencyPanel after the panel pass: one header, findings grouped by
 * severity, honest empty states ("Not checked yet" vs "Everything lines up"),
 * and a result's action bubbling up as `navigate`.
 */
const { state } = vi.hoisted(() => ({ state: {} }))

vi.mock('@/composables/useConsistencyChecker', () => ({
  useConsistencyChecker: () => state.checker
}))

const { bible, toasts } = vi.hoisted(() => ({
  bible: { addCharacterData: vi.fn(async () => 'c9') },
  toasts: { addToast: vi.fn() }
}))
vi.mock('@/stores/storyBibleStore', () => ({ useStoryBibleStore: () => bible }))
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({ currentProjectId: 'p1' })
}))
vi.mock('@/composables/useNotifications', () => ({ useNotifications: () => toasts }))

import ConsistencyPanel from '@/components/consistency/ConsistencyPanel.vue'

function makeChecker(results = [], { scanning = false, lastScan = null } = {}) {
  const r = ref(results)
  const checker = {
    results: r,
    isScanning: ref(scanning),
    lastScan: ref(lastScan),
    counts: computed(() => ({
      errors: r.value.filter((x) => x.severity === 'error').length,
      warnings: r.value.filter((x) => x.severity === 'warning').length,
      info: r.value.filter((x) => x.severity === 'info').length
    })),
    resultsBySeverity: computed(() => ({
      errors: r.value.filter((x) => x.severity === 'error'),
      warnings: r.value.filter((x) => x.severity === 'warning'),
      info: r.value.filter((x) => x.severity === 'info')
    })),
    scan: vi.fn(),
    clearResults: vi.fn(() => {
      r.value = []
    })
  }
  return checker
}

const stubs = { BaseIcon: { template: '<i />' } }

describe('ConsistencyPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('scans on mount when it has nothing, and says so honestly', async () => {
    state.checker = makeChecker([])
    const w = mount(ConsistencyPanel, { global: { stubs } })
    expect(state.checker.scan).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('Not checked yet')
    expect(w.text()).not.toContain('Everything lines up')
  })

  it('reports a clean scan only after a scan has run', async () => {
    state.checker = makeChecker([], { lastScan: Date.now() })
    const w = mount(ConsistencyPanel, { global: { stubs } })
    expect(w.text()).toContain('Everything lines up')
  })

  it('groups findings by severity with counts in the header meta', async () => {
    state.checker = makeChecker([
      { id: 1, severity: 'error', title: 'Orphan edge', message: 'edge to nobody' },
      { id: 2, severity: 'warning', title: 'Unused location', message: 'never visited' },
      { id: 3, severity: 'warning', title: 'Unused character', message: 'never cast' },
      { id: 4, severity: 'info', title: 'Note', message: 'fyi' }
    ])
    const w = mount(ConsistencyPanel, { global: { stubs } })
    expect(state.checker.scan).not.toHaveBeenCalled()
    const text = w.text()
    expect(text).toContain('1 error · 2 warnings · 1 note')
    expect(text).toContain('Errors')
    expect(text).toContain('Warnings')
    expect(text).toContain('Notes')
    expect(w.findAll('li').length).toBe(4)
    expect(text).toContain('Recheck')
  })

  it('Recheck clears then scans again', async () => {
    state.checker = makeChecker([{ id: 1, severity: 'error', title: 'x', message: 'y' }])
    const w = mount(ConsistencyPanel, { global: { stubs } })
    await w.find('button').trigger('click')
    expect(state.checker.clearResults).toHaveBeenCalledTimes(1)
    expect(state.checker.scan).toHaveBeenCalledTimes(1)
  })

  it('emits navigate with the finding action', async () => {
    state.checker = makeChecker([
      {
        id: 1,
        severity: 'error',
        title: 'Missing character',
        message: 'x',
        action: { type: 'open-entity', id: 'c1' }
      }
    ])
    const w = mount(ConsistencyPanel, { global: { stubs } })
    const item = w.findComponent({ name: 'ConsistencyResultItem' })
    item.vm.$emit('action', { type: 'open-entity', id: 'c1' })
    expect(w.emitted('navigate')?.[0]?.[0]).toEqual({ type: 'open-entity', id: 'c1' })
  })

  it('"Add to bible" creates the character here and rechecks, without navigating', async () => {
    state.checker = makeChecker([
      {
        id: 1,
        severity: 'error',
        category: 'undefined_mention',
        title: 'Undefined mention: "Zorath"',
        action: { label: 'Add to bible', type: 'add-character', payload: 'Zorath' }
      }
    ])
    const w = mount(ConsistencyPanel, { global: { stubs } })
    const item = w.findComponent({ name: 'ConsistencyResultItem' })
    item.vm.$emit('action', { label: 'Add to bible', type: 'add-character', payload: 'Zorath' })
    await new Promise((r) => setTimeout(r, 0))
    expect(bible.addCharacterData).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Zorath' })
    )
    expect(toasts.addToast).toHaveBeenCalled()
    expect(state.checker.clearResults).toHaveBeenCalled()
    expect(w.emitted('navigate')).toBeUndefined()
  })

  it('renders a secondary action next to the primary one', () => {
    state.checker = makeChecker([
      {
        id: 1,
        severity: 'error',
        category: 'undefined_mention',
        title: 'Undefined mention: "Zorath"',
        action: { label: 'Add to bible', type: 'add-character', payload: 'Zorath' },
        secondaryAction: {
          label: 'Open scene',
          type: 'open-section',
          payload: { subsectionId: 's1' }
        }
      }
    ])
    const w = mount(ConsistencyPanel, { global: { stubs } })
    const labels = w.findAll('button').map((b) => b.text())
    expect(labels).toContain('Add to bible')
    expect(labels).toContain('Open scene')
  })
})
