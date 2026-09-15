import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed } from 'vue'

/**
 * BetaReaderPanel after the panel pass. The two regressions it guards:
 * the summary used to REPLACE the findings list (a reader with an overall
 * impression hid every finding behind it), and a chapter-only manuscript
 * used to be told it "reads clean" when nothing had been read at all.
 */
const { state } = vi.hoisted(() => ({ state: {} }))

vi.mock('@/composables/betareader/useBetaReader', () => ({
  useBetaReader: () => state.reader
}))

import BetaReaderPanel from '@/components/betareader/BetaReaderPanel.vue'

function makeReader(
  results = [],
  { scanning = false, lastScan = null, noScenes = false, summary = '', cloud = {} } = {}
) {
  const r = ref(results)
  const bySev = (sev) => r.value.filter((x) => x.severity === sev)
  return {
    results: r,
    isScanning: ref(scanning),
    lastScan: ref(lastScan),
    noScenes: ref(noScenes),
    counts: computed(() => ({
      errors: bySev('error').length,
      warnings: bySev('warning').length,
      info: bySev('info').length
    })),
    resultsBySeverity: computed(() => ({
      errors: bySev('error'),
      warnings: bySev('warning'),
      info: bySev('info')
    })),
    summary: ref(summary),
    currentPhase: ref(''),
    progress: ref(0),
    cloudRunOptIn: ref(false),
    cloudTier: ref(cloud.tier || 'local'),
    cloudAvailable: ref(!!cloud.available),
    cloudDisclosure: ref(cloud.disclosure || null),
    scan: vi.fn(),
    clearResults: vi.fn(() => {
      r.value = []
    })
  }
}

const stubs = { BaseIcon: { template: '<i />' } }

describe('BetaReaderPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the summary AND every finding, not one or the other', () => {
    state.reader = makeReader(
      [
        { id: 1, severity: 'error', title: 'Timeline', message: 'Tuesday twice' },
        { id: 2, severity: 'info', title: 'Pacing', message: 'slow middle' }
      ],
      { lastScan: Date.now(), summary: 'A taut opening that loses its footing in the middle.' }
    )
    const w = mount(BetaReaderPanel, { global: { stubs } })
    const text = w.text()
    expect(text).toContain('A taut opening')
    expect(w.findAll('li').length).toBe(2)
    expect(text).toContain('1 error · 1 note')
    expect(text).toContain('Reread')
  })

  it('a chapter-only manuscript is told there is nothing to read — never "reads clean"', () => {
    state.reader = makeReader([], { noScenes: true, lastScan: Date.now() })
    const w = mount(BetaReaderPanel, { global: { stubs } })
    expect(w.text()).toContain('Nothing to read yet')
    expect(w.text()).not.toContain('Reads clean')
  })

  it('distinguishes "not read yet" from a clean read', () => {
    state.reader = makeReader([])
    let w = mount(BetaReaderPanel, { global: { stubs } })
    expect(w.text()).toContain('Not read yet')
    // Four model passes must not start because a panel opened.
    expect(state.reader.scan).not.toHaveBeenCalled()
    expect(w.text()).toContain('Read the manuscript')

    state.reader = makeReader([], { lastScan: Date.now() })
    w = mount(BetaReaderPanel, { global: { stubs } })
    expect(w.text()).toContain('Reads clean')
  })

  it('offers the cloud opt-in only when the tier is on-demand and the cloud is reachable', () => {
    state.reader = makeReader([], { cloud: { available: true, tier: 'cloud-on-demand' } })
    let w = mount(BetaReaderPanel, { global: { stubs } })
    expect(w.text()).toContain('Use cloud AI')

    state.reader = makeReader([], { cloud: { available: true, tier: 'local' } })
    w = mount(BetaReaderPanel, { global: { stubs } })
    expect(w.text()).not.toContain('Use cloud AI')
  })

  it('Reread clears then reads again, and a finding action navigates', async () => {
    state.reader = makeReader([
      {
        id: 1,
        severity: 'warning',
        title: 'x',
        message: 'y',
        action: { type: 'open-scene', id: 's1' }
      }
    ])
    const w = mount(BetaReaderPanel, { global: { stubs } })
    const item = w.findComponent({ name: 'BetaResultItem' })
    item.vm.$emit('action', { type: 'open-scene', id: 's1' })
    expect(w.emitted('navigate')?.[0]?.[0]).toEqual({ type: 'open-scene', id: 's1' })
    // Reread empties the list before reading again.
    await w.find('button').trigger('click')
    expect(state.reader.clearResults).toHaveBeenCalledTimes(1)
    expect(state.reader.scan).toHaveBeenCalledTimes(1)
  })
})

describe('betaReport presentation helpers', () => {
  it('turns the summary object into one line and a category key into a word', async () => {
    const { summarySentence, humanizeCategory } =
      await import('@/composables/betareader/betaReport')
    expect(
      summarySentence({
        totalScenes: 1,
        contradictionsFound: 0,
        droppedThreadsFound: 2,
        orphanedSetups: 1,
        repetitionsFound: 0
      })
    ).toBe('1 scene read · 0 contradictions · 2 dropped threads · 1 unpaid setup · 0 repetitions')
    // The panel used to print this object raw: { "totalScenes": 1, ... }.
    expect(summarySentence(null)).toBe('')
    expect(summarySentence('A taut opening.')).toBe('A taut opening.')
    expect(humanizeCategory('dropped_thread')).toBe('Dropped thread')
    expect(humanizeCategory('pacing')).toBe('Pacing')
  })
})
