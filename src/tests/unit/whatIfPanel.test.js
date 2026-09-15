import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

/**
 * WhatIfPanel after the panel pass: alternatives are a subcomponent with
 * always-visible Insert / Replace actions; the premise the author types is
 * actually sent; the divergence flow moves through timeline → edit; and the
 * empty state points at Sections instead of dead-ending.
 */
const { state } = vi.hoisted(() => ({ state: {} }))

vi.mock('@/composables/useWhatIf', () => ({
  useWhatIf: () => state.whatIf
}))
vi.mock('@/composables/useWhatIfGenerator', () => ({
  useWhatIfGenerator: () => state.forker
}))
vi.mock('@/composables/useStoryDocuments', () => ({
  renderExtractedVoiceGuide: () => ['voice guide line']
}))

import WhatIfPanel from '@/components/whatif/WhatIfPanel.vue'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useProjectStore } from '@/stores/projectStore'

const ALTS = [
  { title: 'She lies', prose: 'Ines lied about the tide.', styleNote: 'terse' },
  { title: 'She runs', prose: 'Ines ran for the customs house.' },
  { title: 'She waits', prose: 'Ines waited.' }
]

function makeWhatIf(alternatives = []) {
  return {
    isGenerating: ref(false),
    alternatives: ref(alternatives),
    error: ref(null),
    generateAlternatives: vi.fn(async () => {}),
    applyAlternative: vi.fn(),
    clear: vi.fn(() => {
      state.whatIf.alternatives.value = []
    })
  }
}

const stubs = {
  BaseIcon: { template: '<i />' },
  WhatIfTimeline: {
    name: 'WhatIfTimeline',
    template: '<div data-test="timeline" />',
    props: ['selectedSectionId', 'selectedSubsectionId'],
    emits: ['select']
  }
}

describe('WhatIfPanel', () => {
  let manuscriptStore
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.whatIf = makeWhatIf()
    state.forker = {
      isGenerating: ref(false),
      progress: ref({ total: 0, done: 0, label: '' }),
      error: ref(null),
      generate: vi.fn(async () => {}),
      reset: vi.fn()
    }
    // The fork needs a project to write the branch under.
    useProjectStore().currentProjectId = 'p1'
    manuscriptStore = useManuscriptStore()
    manuscriptStore.subsections.push({
      id: 's1',
      sectionId: 'sec1',
      title: 'Low tide',
      content: '<p>The body was there.</p>'
    })
    manuscriptStore.sections.push({ id: 'sec1', title: 'One' })
  })

  function mountWithScene(active = true) {
    if (active) manuscriptStore.activeSubsectionId = 's1'
    return mount(WhatIfPanel, {
      global: { stubs, provide: { insertAtCursor: state.insertAtCursor } }
    })
  }

  it('points at Sections when no scene is open instead of dead-ending', () => {
    const w = mountWithScene(false)
    expect(w.text()).toContain('Open one from')
    expect(w.text()).toContain('Sections')
    expect(w.text()).not.toContain('Nothing generated yet')
  })

  it('sends the scene, the chapter log and the voice guide when generating', async () => {
    const w = mountWithScene()
    const generate = w.findAll('button').find((b) => /Generate alternatives/.test(b.text()))
    await generate.trigger('click')
    expect(state.whatIf.generateAlternatives).toHaveBeenCalledTimes(1)
    const args = state.whatIf.generateAlternatives.mock.calls[0][0]
    expect(args.sceneProse).toContain('The body was there')
    expect(args.voiceProfile).toContain('voice guide line')
    expect(Array.isArray(args.chapterLog)).toBe(true)
  })

  it('renders each alternative with always-visible Insert and Replace actions', async () => {
    state.whatIf = makeWhatIf(ALTS)
    state.insertAtCursor = vi.fn()
    const spy = vi.spyOn(manuscriptStore, 'updateSubsectionData').mockResolvedValue(undefined)
    const w = mountWithScene()
    const cards = w.findAllComponents({ name: 'WhatIfAlternative' })
    expect(cards).toHaveLength(3)
    expect(w.text()).toContain('3 alternatives')
    expect(w.text()).toContain('She lies')

    cards[1].vm.$emit('insert', 1)
    expect(state.insertAtCursor).toHaveBeenCalledWith('\n\nInes ran for the customs house.\n\n')

    cards[0].vm.$emit('replace', 0)
    expect(spy).toHaveBeenCalledWith('s1', { content: 'Ines lied about the tide.' })
  })

  it('Clear empties the list', async () => {
    state.whatIf = makeWhatIf(ALTS)
    const w = mountWithScene()
    const clear = w.findAll('button').find((b) => b.text() === 'Clear')
    await clear.trigger('click')
    expect(state.whatIf.clear).toHaveBeenCalledTimes(1)
  })

  it('Diverge opens the timeline; picking a point opens the change editor with the fork disabled until a premise is typed', async () => {
    const w = mountWithScene()
    const diverge = w.findAll('button').find((b) => b.text() === 'Diverge')
    await diverge.trigger('click')
    expect(w.find('[data-test="timeline"]').exists()).toBe(true)
    expect(w.text()).toContain('Divergence point')

    w.findComponent({ name: 'WhatIfTimeline' }).vm.$emit('select', {
      sectionId: 'sec1',
      subsectionId: 's1'
    })
    await w.vm.$nextTick()
    expect(w.find('[data-test="timeline"]').exists()).toBe(false)
    expect(w.text()).toContain('The change')
    const fork = w.findAll('button').find((b) => /Rewrite the rest as a branch/.test(b.text()))
    expect(fork.attributes('disabled')).toBeDefined()

    await w.find('textarea').setValue('Ines never finds the body.')
    expect(fork.attributes('disabled')).toBeUndefined()
    await fork.trigger('click')
    expect(state.forker.generate).toHaveBeenCalledTimes(1)
    expect(state.forker.generate.mock.calls[0][0]).toBe('p1')
    expect(state.forker.generate.mock.calls[0][2]).toBe('Ines never finds the body.')
  })
})
