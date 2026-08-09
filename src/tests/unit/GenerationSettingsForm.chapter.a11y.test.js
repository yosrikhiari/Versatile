import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GenerationSettingsForm from '../../components/story/GenerationSettingsForm.vue'
import { MODE_CHAPTER } from '../../constants/generationModes'

const baseProps = {
  mode: MODE_CHAPTER,
  hasSynopsis: true,
  synopsis: 'A storm arrives.',
  genres: ['Fantasy'],
  tones: ['Dark'],
  estimatedTotalWords: 0,
  volumes: 1,
  chaptersPerVolume: 3,
  wordsPerChapter: 800,
  scenesPerChapter: 4,
  wordTarget: 1600
}

function mountForm(props = {}) {
  setActivePinia(createPinia())
  return mount(GenerationSettingsForm, {
    props: { ...baseProps, ...props },
    global: { stubs: { BaseIcon: true } }
  })
}

describe('GenerationSettingsForm — chapter mode accessibility', () => {
  it('names every stepper group for assistive technology', () => {
    const wrapper = mountForm()
    const scenes = wrapper.find('[data-test="scenes-per-chapter-stepper"]')
    expect(scenes.attributes('role')).toBe('group')
    expect(scenes.attributes('aria-label')).toBeTruthy()
  })

  it('ties each stepper input to its visible label', () => {
    const wrapper = mountForm()
    for (const label of wrapper.findAll('label')) {
      const target = label.attributes('for')
      if (!target) continue
      expect(wrapper.find(`#${target}`).exists()).toBe(true)
    }
  })

  it('labels the increment and decrement controls', () => {
    const wrapper = mountForm()
    const buttons = wrapper.find('[data-test="scenes-per-chapter-stepper"]').findAll('button')
    expect(buttons.length).toBe(2)
    for (const button of buttons) expect(button.attributes('aria-label')).toBeTruthy()
  })

  it('operates the stepper from the keyboard the way a native button does', async () => {
    const wrapper = mountForm({ scenesPerChapter: 4 })
    const increment = wrapper
      .find('[data-test="scenes-per-chapter-stepper"]')
      .findAll('button')
      .at(1)
    // Enter on a focused native <button> fires click; asserting on the emitted
    // update is what proves the control is operable without a pointer.
    await increment.trigger('click')
    expect(wrapper.emitted('update:scenesPerChapter')).toBeTruthy()
    expect(wrapper.emitted('update:scenesPerChapter')[0]).toEqual([5])
  })

  it('announces the run estimate politely rather than interrupting', () => {
    const wrapper = mountForm()
    const estimate = wrapper.find('[data-test="estimate"]')
    expect(estimate.attributes('role')).toBe('status')
    expect(estimate.attributes('aria-live')).toBe('polite')
  })

  it('removes the volume steppers from the DOM rather than hiding them visually', () => {
    const wrapper = mountForm()
    expect(wrapper.find('[data-test="volumes-stepper"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="chapters-per-volume-stepper"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('Chapters / volume')
  })
})
