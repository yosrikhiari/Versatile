import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseTab from '@/components/ui/BaseTab.vue'

describe('BaseTab', () => {
  // The regression this file exists for: the component declared
  // `inheritAttrs: false` and bound nothing, and in Vue 3 listeners arrive via
  // `$attrs` — so every `@click` a parent attached was dropped. The tabs
  // rendered and highlighted on hover but could not be switched, which is what
  // trapped the Settings modal on its first tab.
  it('forwards a click listener from its parent', async () => {
    const w = mount(BaseTab, { slots: { default: 'Goals' } })
    await w.find('button').trigger('click')
    expect(w.emitted('click')).toBeTruthy()
  })

  it('drives a v-model-style selection the way callers use it', async () => {
    const selected = []
    const w = mount(BaseTab, {
      slots: { default: 'AI Providers' },
      attrs: { onClick: () => selected.push('ai') }
    })
    await w.find('button').trigger('click')
    expect(selected).toEqual(['ai'])
  })

  it('keeps its own styling while merging a caller class', () => {
    const w = mount(BaseTab, {
      props: { variant: 'segment', active: true },
      attrs: { class: 'shrink-0' },
      slots: { default: 'Voice' }
    })
    const cls = w.find('button').classes()
    expect(cls).toContain('shrink-0')
    expect(cls).toContain('rounded-md')
    expect(cls.join(' ')).toContain('bg-accent')
  })

  it('marks the active tab for assistive technology', () => {
    const active = mount(BaseTab, { props: { active: true }, slots: { default: 'On' } })
    const idle = mount(BaseTab, { props: { active: false }, slots: { default: 'Off' } })
    expect(active.find('button').attributes('aria-selected')).toBe('true')
    expect(idle.find('button').attributes('aria-selected')).toBe('false')
    expect(active.find('button').attributes('role')).toBe('tab')
  })

  it('does not fire when disabled', async () => {
    const w = mount(BaseTab, { props: { disabled: true }, slots: { default: 'Nope' } })
    expect(w.find('button').attributes('disabled')).toBeDefined()
  })
})
