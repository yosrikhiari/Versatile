import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GenerationSettingsForm from '../../components/story/GenerationSettingsForm.vue'
import { MODE_ARC, MODE_CHAPTER } from '../../constants/generationModes'

const baseProps = {
  hasSynopsis: true,
  synopsis: 'A storm arrives.',
  genres: ['Fantasy'],
  tones: ['Dark'],
  estimatedTotalWords: 24000,
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

describe('GenerationSettingsForm — chapter mode', () => {
  it('drops the volume and chapter-count steppers, keeps the scenes stepper', () => {
    const wrapper = mountForm({ mode: MODE_CHAPTER })
    expect(wrapper.find('[data-test="volumes-stepper"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="chapters-per-volume-stepper"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="scenes-per-chapter-stepper"]').exists()).toBe(true)
  })

  it('keeps the word-target stepper visible regardless of precise structure', () => {
    const wrapper = mountForm({ mode: MODE_CHAPTER, usePreciseStructure: true })
    expect(wrapper.find('[data-test="word-target-stepper"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="volumes-stepper"]').exists()).toBe(false)
  })

  it('labels the word target as the chapter’s own', () => {
    const wrapper = mountForm({ mode: MODE_CHAPTER })
    expect(wrapper.find('[data-test="word-target-stepper"]').text()).toContain(
      'Chapter Word Target'
    )
  })

  it('estimates one chapter, not volumes times chapters', () => {
    const chapter = mountForm({ mode: MODE_CHAPTER, wordTarget: 1600, scenesPerChapter: 2 })
    const estimate = chapter.find('[data-test="estimate"]')
    expect(estimate.exists()).toBe(true)
    expect(estimate.text()).toContain('1 chapter')
    expect(estimate.text()).toContain('2 scene(s)')
    // 1600 words over 2 scenes.
    expect(estimate.text()).toContain('800')
  })

  it('shows the volume steppers in arc mode with precise structure on', () => {
    const wrapper = mountForm({ mode: MODE_ARC, usePreciseStructure: true })
    expect(wrapper.find('[data-test="volumes-stepper"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="chapters-per-volume-stepper"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="words-per-chapter-stepper"]').exists()).toBe(true)
    // Arc keeps its own estimate paragraph, which is not the chapter one.
    expect(wrapper.find('[data-test="estimate"]').exists()).toBe(false)
  })

  it('leaves arc mode without precise structure exactly as it was', () => {
    const wrapper = mountForm({ mode: MODE_ARC, usePreciseStructure: false })
    expect(wrapper.find('[data-test="word-target-stepper"]').text()).toContain('Total Word Target')
    expect(wrapper.find('[data-test="volumes-stepper"]').exists()).toBe(false)
  })
})
