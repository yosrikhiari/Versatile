import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RevisionDeltaPanel from '@/components/eval/RevisionDeltaPanel.vue'

const revisionResult = {
  originalProse: '<p>Kael docks at dawn. The harbor is quiet.</p>',
  revisedProse: '<p>Kael docks at dusk. The harbor is quiet.</p>',
  delta: 1,
  degradation: { dimensions: [], hasRegressions: false, hasMajorRegressions: false }
}

describe('RevisionDeltaPanel word diff', () => {
  it('renders added and removed words with distinct classes', () => {
    const wrapper = mount(RevisionDeltaPanel, {
      props: { revisionResult, compact: true }
    })
    const block = wrapper.find('.word-diff')
    expect(block.exists()).toBe(true)
    expect(block.findAll('.word-removed').length).toBeGreaterThan(0)
    expect(block.findAll('.word-added').length).toBeGreaterThan(0)
    expect(block.text()).not.toContain('<p>')
  })

  it('renders the diff block in non-compact mode too', () => {
    const wrapper = mount(RevisionDeltaPanel, {
      props: { revisionResult, compact: false }
    })
    const block = wrapper.find('.word-diff')
    expect(block.exists()).toBe(true)
    expect(block.findAll('.word-removed').length).toBeGreaterThan(0)
    expect(block.findAll('.word-added').length).toBeGreaterThan(0)
  })

  it('hides the diff block with no revision', () => {
    const wrapper = mount(RevisionDeltaPanel, {
      props: { revisionResult: null }
    })
    expect(wrapper.find('.word-diff').exists()).toBe(false)
  })
})
