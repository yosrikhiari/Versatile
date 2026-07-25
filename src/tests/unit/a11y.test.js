import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'vitest-axe'
import * as axeMatchers from 'vitest-axe/matchers'

import EmptyState from '@/components/shared/EmptyState.vue'
import Skeleton from '@/components/shared/Skeleton.vue'

expect.extend(axeMatchers)

// color-contrast can't be computed in jsdom (no layout engine), so it's disabled;
// structural/ARIA rules still run and are what these assertions guard.
const AXE_OPTS = { rules: { 'color-contrast': { enabled: false } } }

async function assertNoViolations(component, props = {}) {
  const wrapper = mount(component, { props, attachTo: document.body })
  const results = await axe(wrapper.element, AXE_OPTS)
  expect(results).toHaveNoViolations()
  wrapper.unmount()
}

describe('a11y — shared components', () => {
  it('EmptyState has no axe violations', async () => {
    await assertNoViolations(EmptyState, {
      icon: 'inbox',
      title: 'Nothing here yet',
      description: 'Start writing to see content.',
      actionLabel: 'Add item'
    })
  })

  it('Skeleton (list) has no axe violations', async () => {
    await assertNoViolations(Skeleton, { variant: 'list', count: 3, label: 'Loading…' })
  })

  it('Skeleton (panel) has no axe violations', async () => {
    await assertNoViolations(Skeleton, { variant: 'panel', count: 2 })
  })
})
