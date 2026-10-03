import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseSegmented from '@/components/ui/BaseSegmented.vue'

const options = [
  { value: 'scene', label: 'Scene' },
  { value: 'chapter', label: 'Chapter', disabled: true },
  { value: 'arc', label: 'Arc' }
]

function tabIndexes(wrapper) {
  return wrapper.findAll('[role="radio"]').map((b) => b.attributes('tabindex'))
}

describe('BaseSegmented', () => {
  it('puts the Tab stop on the checked segment', () => {
    const wrapper = mount(BaseSegmented, { props: { modelValue: 'arc', options } })
    expect(tabIndexes(wrapper)).toEqual(['-1', '-1', '0'])
  })

  // The Generator's mode row has nothing checked while Ideate or Blurb (under
  // More) is open. Every segment was tabindex -1, so the keyboard could not
  // reach the group at all; WAI-ARIA puts the stop on the first enabled one.
  it('keeps the group reachable when nothing is checked', () => {
    const wrapper = mount(BaseSegmented, {
      props: {
        modelValue: 'brainstorm',
        options: [{ ...options[0], disabled: true }, ...options.slice(1)]
      }
    })
    expect(tabIndexes(wrapper)).toEqual(['-1', '-1', '0'])
  })

  it('arrow keys select the next enabled segment, skipping disabled ones', async () => {
    const wrapper = mount(BaseSegmented, { props: { modelValue: 'scene', options } })
    await wrapper.find('[role="radiogroup"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['arc'])
  })
})
