import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GuardrailIndicator from '@/guardrails/reporting/components/GuardrailIndicator.vue'
import GuardrailFeed from '@/guardrails/reporting/components/GuardrailFeed.vue'
import { GuardrailRegistry } from '@/guardrails/registry'
import { clearGuardrailNotifications } from '@/guardrails/reporting/useGuardrailReporting'

/** Emits a failing guard result through the registry, which feeds the reporting store. */
function emit({
  kind = 'entity',
  severity = 'blocking',
  message = 'Unknown entity name(s): Ghost'
} = {}) {
  GuardrailRegistry.clear()
  GuardrailRegistry.register(kind, (ctx) => [
    {
      kind,
      passed: false,
      severity,
      message,
      details: { unknownNames: ['Ghost'] },
      layer: ctx.layer,
      timestamp: Date.now()
    }
  ])
  return GuardrailRegistry.runSync({ layer: 'ai_output', data: {}, entryPoint: 'test' })
}

describe('GuardrailIndicator', () => {
  beforeEach(() => {
    GuardrailRegistry.clear()
    clearGuardrailNotifications()
  })

  afterEach(() => {
    GuardrailRegistry.clear()
    clearGuardrailNotifications()
  })

  it('renders a clear state when nothing has been flagged', () => {
    const wrapper = mount(GuardrailIndicator)
    expect(wrapper.text()).toContain('Clear')
  })

  it('shows a count once a guard fails', async () => {
    const wrapper = mount(GuardrailIndicator)
    emit()
    await flushPromises()

    expect(wrapper.text()).toContain('1')
    expect(wrapper.find('button').attributes('title')).toContain('1 blocking')
  })

  it('distinguishes blocking from advisory in its title', async () => {
    const wrapper = mount(GuardrailIndicator)
    emit({ kind: 'quality', severity: 'detective', message: 'Output is very short' })
    await flushPromises()

    expect(wrapper.find('button').attributes('title')).toContain('1 advisory')
  })

  it('expands to list findings and dismisses one', async () => {
    const wrapper = mount(GuardrailIndicator)
    emit()
    await flushPromises()

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('Unknown entity name(s): Ghost')
    expect(wrapper.text()).toContain('entity')

    // The dismiss control is the second button — the first toggles the popover.
    const buttons = wrapper.findAll('button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Clear')
  })

  it('reports an empty state when expanded with nothing flagged', async () => {
    const wrapper = mount(GuardrailIndicator)
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('Nothing flagged this session')
  })
})

describe('GuardrailFeed', () => {
  beforeEach(() => {
    GuardrailRegistry.clear()
    clearGuardrailNotifications()
  })

  afterEach(() => {
    GuardrailRegistry.clear()
    clearGuardrailNotifications()
  })

  it('renders an empty state', () => {
    const wrapper = mount(GuardrailFeed)
    expect(wrapper.text()).toContain('No findings to show')
  })

  it('lists a finding with its kind, layer and message', async () => {
    const wrapper = mount(GuardrailFeed)
    emit()
    await flushPromises()

    expect(wrapper.text()).toContain('entity')
    expect(wrapper.text()).toContain('ai output')
    expect(wrapper.text()).toContain('Unknown entity name(s): Ghost')
  })

  it('filters to blocking only', async () => {
    const wrapper = mount(GuardrailFeed)
    emit({ kind: 'quality', severity: 'detective', message: 'Advisory finding here' })
    await flushPromises()

    const blockingFilter = wrapper.findAll('button').find((b) => b.text() === 'Blocking')
    await blockingFilter.trigger('click')

    expect(wrapper.text()).not.toContain('Advisory finding here')
    expect(wrapper.text()).toContain('No findings to show')
  })

  it('clears all findings', async () => {
    const wrapper = mount(GuardrailFeed)
    emit()
    await flushPromises()

    const clearButton = wrapper.findAll('button').find((b) => b.text() === 'Clear')
    await clearButton.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('No findings to show')
  })

  it('hides dismissed findings until the toggle is checked', async () => {
    const wrapper = mount(GuardrailFeed)
    emit()
    await flushPromises()

    const dismiss = wrapper.findAll('button').filter((b) => b.attributes('title') === 'Dismiss')
    await dismiss[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('No findings to show')

    await wrapper.find('input[type="checkbox"]').setValue(true)
    expect(wrapper.text()).toContain('Unknown entity name(s): Ghost')
  })
})
