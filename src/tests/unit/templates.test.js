import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import {
  useTemplatesStore,
  renderTemplate,
  metadataFromFields,
  BUILT_IN_TEMPLATES
} from '@/stores/useTemplatesStore'
import TemplatePicker from '@/components/editor/TemplatePicker.vue'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useProjectStore } from '@/stores/projectStore'

describe('templates — model', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders {{placeholders}}; unknown keys become empty', () => {
    expect(
      renderTemplate('{{pov}} at {{ setting }}: {{nope}}!', { pov: 'Ines', setting: 'the docks' })
    ).toBe('Ines at the docks: !')
    expect(renderTemplate('', {})).toBe('')
  })

  it('maps filled fields onto the scene-context columns', () => {
    const scene = BUILT_IN_TEMPLATES[0]
    expect(
      metadataFromFields(scene.fields, {
        pov: ' Ines ',
        setting: 'The Docks',
        cast: 'Tomas, Halden,',
        goal: 'x'
      })
    ).toEqual({ pov: 'Ines', location: 'The Docks', charactersPresent: ['Tomas', 'Halden'] })
    expect(metadataFromFields(scene.fields, {})).toEqual({})
  })

  it('ships Scene, Chapter opener and Climax; custom templates round-trip through localStorage', () => {
    const store = useTemplatesStore()
    expect(store.templates.map((t) => t.id)).toEqual(['scene', 'chapter-opener', 'climax'])
    const id = store.saveCustom({
      title: 'Interrogation',
      description: 'x',
      fields: [{ key: 'pov', label: 'POV', metadata: 'pov' }],
      body: '{{pov}} asks the first question.'
    })
    expect(store.byId(id).builtIn).toBe(false)
    expect(JSON.parse(localStorage.getItem('versatile.templates')).map((t) => t.id)).toEqual([id])
    const filled = store.fill(id, { pov: 'Ines' })
    expect(filled).toEqual({ text: 'Ines asks the first question.', metadata: { pov: 'Ines' } })
    expect(store.lastUsedId).toBe(id)
    store.removeCustom(id)
    expect(store.byId(id)).toBeUndefined()
    expect(store.fill('missing', {})).toBeNull()
  })
})

describe('TemplatePicker', () => {
  let manuscript
  const insertAtCursor = vi.fn()
  const stubs = {
    Modal: { template: '<div><slot /></div>', props: ['show'] },
    BaseIcon: { template: '<i />' }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    insertAtCursor.mockClear()
    useProjectStore().currentProjectId = 'p1'
    manuscript = useManuscriptStore()
    manuscript.subsections.push({
      id: 's1',
      sectionId: 'sec',
      title: 'Low tide',
      pov: 'Ines',
      location: 'The Docks'
    })
    manuscript.activeSubsectionId = 's1'
  })

  it('seeds POV and setting from the open scene, previews, inserts, and writes the scene context', async () => {
    const upd = vi.spyOn(manuscript, 'updateSubsectionData').mockResolvedValue(undefined)
    const w = mount(TemplatePicker, {
      props: { show: true },
      global: { stubs, provide: { insertAtCursor } }
    })
    await flushPromises()
    expect(w.find('[data-test="field-pov"]').element.value).toBe('Ines')
    expect(w.find('[data-test="field-setting"]').element.value).toBe('The Docks')
    await w.find('[data-test="field-goal"]').setValue('the ledger')
    await w.find('[data-test="field-cast"]').setValue('Tomas')
    expect(w.find('[data-test="template-preview"]').text()).toContain('Ines — The Docks.')
    expect(w.find('[data-test="template-preview"]').text()).toContain('Wants: the ledger')

    await w.find('[data-test="insert-template"]').trigger('click')
    await flushPromises()
    expect(insertAtCursor).toHaveBeenCalledWith(expect.stringContaining('Ines — The Docks.'))
    expect(upd).toHaveBeenCalledWith(
      's1',
      { pov: 'Ines', location: 'The Docks', charactersPresent: ['Tomas'] },
      'p1'
    )
    expect(w.emitted('inserted')[0][0].templateId).toBe('scene')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('switching template re-seeds the fields; the label can reference another field', async () => {
    const w = mount(TemplatePicker, {
      props: { show: true },
      global: { stubs, provide: { insertAtCursor } }
    })
    await flushPromises()
    expect(w.text()).toContain('What Ines wants')
    await w.find('[data-test="template-climax"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="field-choice"]').exists()).toBe(true)
    expect(w.find('[data-test="field-pov"]').element.value).toBe('Ines')
  })
})
