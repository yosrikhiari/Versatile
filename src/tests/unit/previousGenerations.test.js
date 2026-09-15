import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PreviousGenerationsList from '@/components/story/PreviousGenerationsList.vue'

// PLAN-station-reskin Task 3: honest history states.
// NOTE (read-first finding): the component's real prop is `generations`
// (not `items`), and entries carry `{ title, generatedAt, totalWords?,
// qualityScore? }` (not `{ title, date, score }`). The plan's sketch is
// adapted to reality here.
//
// Data finding (useVolumeStoryGenerator.ts:3287): qualityScore is written
// as `0` when no consistency report exists (never evaluated) AND as
// `-(issue count)` when evaluated — so a stored `0` is ambiguous (it can
// mean "never scored" or "scored, zero issues"). No distinguishing field
// exists on the entry, so per the plan, 0 is treated as unscored.
describe('PreviousGenerationsList honest states', () => {
  it('reads scoreless entries as unscored, not broken', () => {
    const wrapper = mount(PreviousGenerationsList, {
      props: {
        generations: [
          { title: 'Volume Story', generatedAt: '2026-07-31T00:00:00.000Z', qualityScore: 0 }
        ]
      }
    })
    expect(wrapper.text()).toContain('not scored')
    expect(wrapper.text()).not.toContain('score 0')
  })

  it('reads missing scores as unscored', () => {
    const wrapper = mount(PreviousGenerationsList, {
      props: {
        generations: [{ title: 'Volume Story', generatedAt: '2026-07-31T00:00:00.000Z' }]
      }
    })
    expect(wrapper.text()).toContain('not scored')
  })

  it('reads a negative score as the continuity issue count it encodes', () => {
    const wrapper = mount(PreviousGenerationsList, {
      props: {
        generations: [
          {
            title: 'The Count … The Truth',
            generatedAt: '2026-09-15T00:00:00.000Z',
            qualityScore: -4
          }
        ]
      }
    })
    expect(wrapper.text()).toContain('4 continuity issues')
    expect(wrapper.text()).not.toContain('score -4')
  })

  it('shows a one-line empty state when there is no history', () => {
    const wrapper = mount(PreviousGenerationsList, { props: { generations: [] } })
    expect(wrapper.text()).toContain('Finished runs are listed here')
  })
})
