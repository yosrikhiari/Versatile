import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PreviousGenerationsList from '@/components/story/PreviousGenerationsList.vue'
import VolumeReadModal from '@/components/story/VolumeReadModal.vue'
import ConsistencyReportModal from '@/components/story/ConsistencyReportModal.vue'

// BaseIcon pulls in icon assets; stub it everywhere.
const global = { stubs: { BaseIcon: true } }

describe('PreviousGenerationsList', () => {
  it('renders nothing when there are no generations', () => {
    const w = mount(PreviousGenerationsList, { props: { generations: [] }, global })
    expect(w.text()).not.toContain('Previous Generations')
  })

  it('lists each generation with title and word count', () => {
    const w = mount(PreviousGenerationsList, {
      props: {
        generations: [
          { id: 1, title: 'Draft One', generatedAt: Date.now(), totalWords: 1200 },
          { id: 2, title: 'Draft Two', generatedAt: Date.now() }
        ]
      },
      global
    })
    expect(w.text()).toContain('Previous Generations')
    expect(w.text()).toContain('Draft One')
    expect(w.text()).toContain('1200 words')
    expect(w.text()).toContain('Draft Two')
  })
})

describe('VolumeReadModal', () => {
  it('renders nothing without scenes', () => {
    const w = mount(VolumeReadModal, { props: { scenes: [] }, global })
    expect(w.text()).not.toContain('Generated Story')
  })

  it('renders each scene and emits close on the close button', async () => {
    const w = mount(VolumeReadModal, {
      props: { scenes: [{ title: 'Arrival', prose: 'It was dawn.' }] },
      global
    })
    expect(w.text()).toContain('Scene 1: Arrival')
    expect(w.text()).toContain('It was dawn.')
    await w.find('button').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})

describe('ConsistencyReportModal', () => {
  it('renders nothing without a report', () => {
    const w = mount(ConsistencyReportModal, { props: { report: null }, global })
    expect(w.text()).not.toContain('Consistency Report')
  })

  it('shows the all-clear state when there are no issues', () => {
    const w = mount(ConsistencyReportModal, {
      props: { report: { characterIssues: [], locationIssues: [] }, totalIssues: 0 },
      global
    })
    expect(w.text()).toContain('No contradictions found')
  })

  it('renders character and location contradictions', () => {
    const w = mount(ConsistencyReportModal, {
      props: {
        report: {
          characterIssues: [
            { character: 'Mara', contradictions: [{ type: 'timeline', description: 'alive after death' }] }
          ],
          locationIssues: [
            { location: 'The Keep', contradictions: [{ type: 'state', description: 'burned then intact' }] }
          ]
        },
        totalIssues: 2
      },
      global
    })
    expect(w.text()).toContain('Mara')
    expect(w.text()).toContain('alive after death')
    expect(w.text()).toContain('The Keep')
    expect(w.text()).toContain('burned then intact')
    expect(w.text()).not.toContain('No contradictions found')
  })

  it('emits close on the close button', async () => {
    const w = mount(ConsistencyReportModal, {
      props: { report: { characterIssues: [], locationIssues: [] }, totalIssues: 0 },
      global
    })
    await w.find('button').trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })
})
