import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GenerationSettingsForm from '@/components/story/GenerationSettingsForm.vue'

const base = {
  genre: '',
  tone: '',
  wordTarget: 3500,
  usePreciseStructure: false,
  volumes: 1,
  chaptersPerVolume: 10,
  wordsPerChapter: 2000,
  scenesPerChapter: 3,
  genres: ['Fantasy', 'Sci-Fi'],
  tones: ['Tense', 'Hopeful'],
  mode: 'chapter',
  synopsis: 'A hero rises.',
  hasSynopsis: true,
  estimatedTotalWords: 20000
}

describe('GenerationSettingsForm', () => {
  it('renders the synopsis, genres and tones', () => {
    const w = mount(GenerationSettingsForm, { props: base })
    expect(w.text()).toContain('A hero rises.')
    expect(w.text()).toContain('Fantasy')
    expect(w.text()).toContain('Tense')
  })

  it('shows the no-synopsis hint when hasSynopsis is false', () => {
    const w = mount(GenerationSettingsForm, { props: { ...base, hasSynopsis: false } })
    expect(w.text()).toContain('No synopsis set')
  })

  it('emits update:genre when a genre is picked, and clears it when re-picked', async () => {
    const w = mount(GenerationSettingsForm, { props: base })
    const fantasy = w.findAll('button').find((b) => b.text() === 'Fantasy')
    await fantasy.trigger('click')
    expect(w.emitted('update:genre')[0]).toEqual(['Fantasy'])

    const w2 = mount(GenerationSettingsForm, { props: { ...base, genre: 'Fantasy' } })
    const fantasy2 = w2.findAll('button').find((b) => b.text() === 'Fantasy')
    await fantasy2.trigger('click')
    expect(w2.emitted('update:genre')[0]).toEqual([''])
  })

  it('shows the word-target input only when precise structure is off', () => {
    const off = mount(GenerationSettingsForm, { props: { ...base, usePreciseStructure: false } })
    expect(off.find('input[type="number"]').exists()).toBe(true)
    // With precise structure on, the single word-target input is replaced by the grid.
    const on = mount(GenerationSettingsForm, { props: { ...base, usePreciseStructure: true } })
    expect(on.findAll('input[type="number"]').length).toBe(4)
  })

  it('emits update:usePreciseStructure when the checkbox toggles', async () => {
    const w = mount(GenerationSettingsForm, { props: base })
    await w.find('input[type="checkbox"]').setValue(true)
    expect(w.emitted('update:usePreciseStructure')[0]).toEqual([true])
  })

  it('renders the precise-structure summary line', () => {
    const w = mount(GenerationSettingsForm, {
      props: { ...base, usePreciseStructure: true, volumes: 2, chaptersPerVolume: 5 }
    })
    expect(w.text()).toContain('10 chapters')
    expect(w.text()).toContain('20,000')
  })
})
