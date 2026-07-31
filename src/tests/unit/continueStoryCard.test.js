import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContinueStoryCard from '@/components/story/ContinueStoryCard.vue'
import { surveyManuscript } from '@/composables/generation/continuation/plan'

function makeSurvey({ written = 0, empty = 0, stubs = 0 } = {}) {
  const sections = [{ id: 'c1', title: 'Chapter 1', order: 0, summary: '' }]
  const subs = []
  let order = 0
  for (let i = 0; i < written; i++) {
    subs.push({
      id: `w${i}`,
      sectionId: 'c1',
      title: `Written ${i}`,
      order: order++,
      content: 'word '.repeat(600)
    })
  }
  for (let i = 0; i < stubs; i++) {
    subs.push({ id: `s${i}`, sectionId: 'c1', title: `Stub ${i}`, order: order++, content: 'tiny' })
  }
  for (let i = 0; i < empty; i++) {
    subs.push({ id: `e${i}`, sectionId: 'c1', title: `Empty ${i}`, order: order++, content: '' })
  }
  return surveyManuscript(sections, subs)
}

describe('ContinueStoryCard', () => {
  it('stays out of the way on a project with no manuscript yet', () => {
    const w = mount(ContinueStoryCard, { props: { survey: makeSurvey() } })
    expect(w.text()).toBe('')
  })

  // The state the failed run left behind: a full outline, no prose anywhere.
  it('offers to draft every empty scene of a planned-but-unwritten book', () => {
    const w = mount(ContinueStoryCard, { props: { survey: makeSurvey({ empty: 300 }) } })
    expect(w.text()).toContain('0 of 300 scenes written')
    expect(w.text()).toContain('300 still empty')
    expect(w.text()).toContain('Continue drafting (300 scenes)')
  })

  it('emits the fill request when continue is clicked', async () => {
    const w = mount(ContinueStoryCard, { props: { survey: makeSurvey({ empty: 4 }) } })
    await w
      .findAll('button')
      .find((b) => b.text().includes('Continue drafting'))
      .trigger('click')
    expect(w.emitted('continue')[0][0]).toEqual({ includeShort: false })
  })

  it('counts stub scenes into the run only when the author opts in', async () => {
    const w = mount(ContinueStoryCard, { props: { survey: makeSurvey({ empty: 2, stubs: 3 }) } })
    expect(w.text()).toContain('Continue drafting (2 scenes)')

    const checkbox = w.find('input[type="checkbox"]')
    await checkbox.setValue(true)
    expect(w.text()).toContain('Continue drafting (5 scenes)')

    await w
      .findAll('button')
      .find((b) => b.text().includes('Continue drafting'))
      .trigger('click')
    expect(w.emitted('continue')[0][0]).toEqual({ includeShort: true })
  })

  it('still offers extension when every planned scene is already written', () => {
    const w = mount(ContinueStoryCard, { props: { survey: makeSurvey({ written: 6 }) } })
    expect(w.text()).toContain('Every planned scene has prose')
    expect(w.text()).toContain('Extend with new chapters')
  })

  it('emits the requested structure when extending', async () => {
    const w = mount(ContinueStoryCard, { props: { survey: makeSurvey({ written: 3 }) } })
    await w
      .findAll('button')
      .find((b) => b.text().includes('Extend with new chapters'))
      .trigger('click')
    await w
      .findAll('button')
      .find((b) => b.text().includes('Plan & write new chapters'))
      .trigger('click')

    expect(w.emitted('extend')[0][0]).toEqual({
      volumes: 1,
      chaptersPerVolume: 3,
      scenesPerChapter: 3,
      wordsPerChapter: 3000
    })
  })

  it('offers a stop and blocks re-entry while a run is in flight', () => {
    const w = mount(ContinueStoryCard, {
      props: { survey: makeSurvey({ empty: 5 }), busy: true }
    })
    expect(w.text()).toContain('Stop')
    const continueBtn = w.findAll('button').find((b) => b.text().includes('Writing…'))
    expect(continueBtn.attributes('disabled')).toBeDefined()
  })

  it('reports the outcome of the last run, including what it did not reach', () => {
    const w = mount(ContinueStoryCard, {
      props: {
        survey: makeSurvey({ written: 2, empty: 8 }),
        report: { written: 2, failed: 0, remaining: 8, words: 1800, stoppedBy: 'size ceiling' },
        reportLabel: '2 scene(s) written · 1,800 words · 8 not reached — stopped: size ceiling'
      }
    })
    expect(w.text()).toContain('8 not reached')
    expect(w.text()).toContain('stopped: size ceiling')
  })
})
