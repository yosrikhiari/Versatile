import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const svc = vi.hoisted(() => ({
  searchStorySemantic: vi.fn(async () => []),
  indexProject: vi.fn(async () => 3)
}))

vi.mock('@/services/storyVectorIndex', async (importOriginal) => ({
  ...(await importOriginal()),
  searchStorySemantic: (...a) => svc.searchStorySemantic(...a),
  indexProject: (...a) => svc.indexProject(...a)
}))

import RelatedPanel from '@/components/storybible/RelatedPanel.vue'
import StoryLookupModal from '@/components/storybible/StoryLookupModal.vue'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useProjectStore } from '@/stores/projectStore'
import { useStoryGraphStore } from '@/stores/storyGraphStore'

const HITS = [
  { kind: 'subsection', refId: 's2', title: 'The scar', text: 'Tomas shows the scar', score: 0.82 },
  { kind: 'character', refId: 'c1', title: 'Halden', text: 'the customs officer', score: 0.61 }
]

const stubs = {
  BaseIcon: { template: '<i />' },
  Modal: { template: '<div><slot /></div>', props: ['show'] }
}

describe('RelatedPanel', () => {
  let manuscript
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    svc.searchStorySemantic.mockResolvedValue(HITS)
    useProjectStore().currentProjectId = 'p1'
    manuscript = useManuscriptStore()
    manuscript.subsections.push(
      { id: 's1', sectionId: 'sec', title: 'Low tide', content: '<p>Ines finds the body</p>' },
      { id: 's2', sectionId: 'sec', title: 'The scar', content: '<p>Tomas shows the scar</p>' }
    )
    manuscript.activeSubsectionId = 's1'
  })

  it('searches for the active scene, excluding itself, and lists the hits', async () => {
    const w = mount(RelatedPanel, { global: { stubs } })
    await flushPromises()
    expect(svc.searchStorySemantic).toHaveBeenCalledTimes(1)
    const [projectId, text, opts] = svc.searchStorySemantic.mock.calls[0]
    expect(projectId).toBe('p1')
    expect(text).toContain('Ines finds the body')
    expect(opts.exclude).toEqual([{ kind: 'subsection', refId: 's1' }])
    expect(w.findAll('[data-test="match"]')).toHaveLength(2)
    expect(w.text()).toContain('Halden')
    expect(w.text()).toContain('Character · 61%')
  })

  it('a kind chip narrows the search; Link writes a related edge once', async () => {
    const graph = useStoryGraphStore()
    const addEdge = vi.spyOn(graph, 'addEdgeData').mockResolvedValue(undefined)
    const w = mount(RelatedPanel, { global: { stubs } })
    await flushPromises()
    await w.find('[data-test="kind-character"]').trigger('click')
    await flushPromises()
    expect(svc.searchStorySemantic.mock.calls.at(-1)[2].kinds).toEqual(['character'])

    const link = w.findAll('[data-test="link"]')[1]
    await link.trigger('click')
    await flushPromises()
    expect(addEdge).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        sourceId: 's1',
        sourceType: 'subsection',
        targetId: 'c1',
        targetType: 'character',
        relationshipType: 'related'
      })
    )
    expect(w.text()).toContain('Linked')
  })

  it('Reindex embeds the project then searches again; a hit emits navigate', async () => {
    const w = mount(RelatedPanel, { global: { stubs } })
    await flushPromises()
    await w.find('[data-test="reindex"]').trigger('click')
    await flushPromises()
    expect(svc.indexProject).toHaveBeenCalledWith('p1')
    expect(svc.searchStorySemantic).toHaveBeenCalledTimes(2)
    await w.findAll('[data-test="match"] button')[0].trigger('click')
    expect(w.emitted('navigate')[0][0]).toEqual({ kind: 'subsection', id: 's2' })
  })

  it('says so when no scene is open', () => {
    manuscript.activeSubsectionId = null
    manuscript.subsections.splice(0)
    const w = mount(RelatedPanel, { global: { stubs } })
    expect(w.text()).toContain('Open a scene')
    expect(svc.searchStorySemantic).not.toHaveBeenCalled()
  })
})

describe('StoryLookupModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    svc.searchStorySemantic.mockResolvedValue(HITS)
  })

  it('asks the story and emits the chosen hit', async () => {
    const w = mount(StoryLookupModal, { props: { show: true, projectId: 'p1' }, global: { stubs } })
    await w.find('input').setValue('where is the scar')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(svc.searchStorySemantic).toHaveBeenCalledWith('p1', 'where is the scar', { limit: 25 })
    const results = w.findAll('[data-test="result"]')
    expect(results).toHaveLength(2)
    await results[1].trigger('click')
    expect(w.emitted('select')[0][0]).toEqual({ kind: 'character', refId: 'c1', title: 'Halden' })
    expect(w.emitted('close')).toBeTruthy()
  })

  it('is honest about an empty answer', async () => {
    svc.searchStorySemantic.mockResolvedValue([])
    const w = mount(StoryLookupModal, { props: { show: true, projectId: 'p1' }, global: { stubs } })
    await w.find('input').setValue('a unicorn')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Nothing close enough')
  })
})
