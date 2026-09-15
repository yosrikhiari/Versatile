import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const { store } = vi.hoisted(() => ({
  store: {
    entity: {
      id: 'e1',
      metadata: { age: 34, ally: true, aliases: ['Red', 'Wolf'] },
      tags: ['major', 'antagonist']
    },
    findEntity: vi.fn(() => store.entity),
    setEntityMeta: vi.fn(),
    addEntityTag: vi.fn(),
    removeEntityTag: vi.fn()
  }
}))

vi.mock('@/stores/storyBibleStore', () => ({
  useStoryBibleStore: () => store
}))

import EntityPropertiesPanel from '@/components/storybible/EntityPropertiesPanel.vue'

describe('EntityPropertiesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders existing metadata fields and tags', async () => {
    const w = mount(EntityPropertiesPanel, {
      props: { kind: 'character', entityId: 'e1' }
    })
    // Properties are collapsed by default; open the panel.
    await w.find('button').trigger('click')
    const text = w.text()
    expect(text).toContain('age')
    expect(text).toContain('ally')
    expect(text).toContain('aliases')
    expect(text).toContain('major')
    expect(text).toContain('antagonist')
  })

  it('adds a tag through the store', async () => {
    const w = mount(EntityPropertiesPanel, {
      props: { kind: 'location', entityId: 'e1' }
    })
    await w.find('button').trigger('click')

    // Find the tag input (first text input with placeholder "Add tag…").
    const tagInput = w.findAll('input').find((i) => i.attributes('placeholder') === 'Add tag…')
    await tagInput.setValue('new-tag')
    await tagInput.trigger('keydown.enter')

    const { useStoryBibleStore } = await import('@/stores/storyBibleStore')
    const storeInstance = useStoryBibleStore()
    expect(storeInstance.addEntityTag).toHaveBeenCalledWith('location', 'e1', 'new-tag')
  })

  it('persists a typed field through setEntityMeta', async () => {
    const w = mount(EntityPropertiesPanel, {
      props: { kind: 'plotThread', entityId: 'e1' }
    })
    await w.find('button').trigger('click')

    // Add a new number field.
    const keyInput = w.findAll('input').find((i) => i.attributes('placeholder') === 'name')
    const valueInput = w.findAll('input').find((i) => i.attributes('placeholder') === 'value')
    const typeSelect = w.find('select')
    await keyInput.setValue('priority')
    await typeSelect.setValue('number')
    await valueInput.setValue('7')
    await w
      .findAll('button')
      .find((b) => b.text() === '+')
      .trigger('click')

    const { useStoryBibleStore } = await import('@/stores/storyBibleStore')
    const storeInstance = useStoryBibleStore()
    expect(storeInstance.setEntityMeta).toHaveBeenCalledWith('plotThread', 'e1', 'priority', 7)
  })
})
