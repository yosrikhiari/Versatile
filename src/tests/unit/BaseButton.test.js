import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseButton from '@/components/ui/BaseButton.vue'

const global = { stubs: { BaseIcon: false } }

describe('BaseButton right-icon loading guard', () => {
  it('shows right icon when not loading', () => {
    const w = mount(BaseButton, {
      props: { icon: 'copy', iconPosition: 'right', loading: false },
      slots: { default: 'Click' },
      global
    })
    const icons = w.findAllComponents({ name: 'BaseIcon' })
    expect(icons.length).toBe(1)
    expect(icons[0].props('name')).toBe('copy')
  })

  it('hides right icon when loading', () => {
    const w = mount(BaseButton, {
      props: { icon: 'copy', iconPosition: 'right', loading: true },
      slots: { default: 'Click' },
      global
    })
    const icons = w.findAllComponents({ name: 'BaseIcon' })
    expect(icons.length).toBe(1)
    expect(icons[0].props('name')).toBe('loader-2')
  })

  it('shows left icon when not loading', () => {
    const w = mount(BaseButton, {
      props: { icon: 'copy', iconPosition: 'left', loading: false },
      slots: { default: 'Click' },
      global
    })
    const icons = w.findAllComponents({ name: 'BaseIcon' })
    expect(icons.length).toBe(1)
    expect(icons[0].props('name')).toBe('copy')
  })

  it('hides left icon when loading', () => {
    const w = mount(BaseButton, {
      props: { icon: 'copy', iconPosition: 'left', loading: true },
      slots: { default: 'Click' },
      global
    })
    const icons = w.findAllComponents({ name: 'BaseIcon' })
    expect(icons.length).toBe(1)
    expect(icons[0].props('name')).toBe('loader-2')
  })

  it('shows no icon when no icon prop set', () => {
    const w = mount(BaseButton, {
      props: { loading: false },
      slots: { default: 'Click' },
      global
    })
    const icons = w.findAllComponents({ name: 'BaseIcon' })
    expect(icons.length).toBe(0)
  })

  it('shows only spinner when loading with no icon', () => {
    const w = mount(BaseButton, {
      props: { loading: true },
      slots: { default: 'Click' },
      global
    })
    const icons = w.findAllComponents({ name: 'BaseIcon' })
    expect(icons.length).toBe(1)
    expect(icons[0].props('name')).toBe('loader-2')
  })

  it('renders slot content regardless of loading state', () => {
    const w = mount(BaseButton, {
      props: { icon: 'copy', iconPosition: 'right', loading: true },
      slots: { default: 'My Button Text' },
      global
    })
    expect(w.text()).toContain('My Button Text')
  })
})
