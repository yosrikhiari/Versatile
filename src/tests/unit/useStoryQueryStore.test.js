import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useStoryQueryStore } from '@/stores/useStoryQueryStore'
import { useStoryBibleStore } from '@/stores/storyBibleStore'
import { useManuscriptStore } from '@/stores/manuscriptStore'
import { useProjectStore } from '@/stores/projectStore'
import StoryQueryView from '@/components/storybible/StoryQueryView.vue'

/**
 * The store reads the rows the story-bible and manuscript stores already
 * hold and writes edits back through their updaters — it is not a third copy.
 */
function seed() {
  const bible = useStoryBibleStore()
  const manuscript = useManuscriptStore()
  useProjectStore().currentProjectId = 'p1'
  bible.characters.push(
    {
      id: 'c1',
      name: 'Ines',
      role: 'protagonist',
      tags: ['major'],
      generationStatus: 'approved',
      metadata: { age: 34 }
    },
    { id: 'c2', name: 'Marguerite', role: 'harbourmaster', tags: [], generationStatus: 'generated' }
  )
  manuscript.subsections.push(
    {
      id: 's1',
      sectionId: 'sec',
      title: 'Low tide',
      order: 0,
      contentStatus: 'draft',
      pov: 'Ines',
      charactersPresent: ['Ines']
    },
    {
      id: 's2',
      sectionId: 'sec',
      title: 'The scar',
      order: 1,
      contentStatus: 'generated',
      pov: 'Ines',
      charactersPresent: []
    },
    {
      id: 's3',
      sectionId: 'sec',
      title: 'Customs',
      order: 2,
      contentStatus: 'review',
      pov: '',
      charactersPresent: []
    }
  )
  return { bible, manuscript }
}

describe('useStoryQueryStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('applies every preset against the live stores', () => {
    seed()
    const q = useStoryQueryStore()
    expect(q.applyPreset('orphanScenes')).toBe(true)
    expect(q.results.rows.map((r) => r.id)).toEqual(['s2', 's3'])
    q.applyPreset('revisionChecklist')
    expect(q.results.rows.map((r) => r.id)).toEqual(['s1', 's3'])
    q.applyPreset('scenesByPov')
    expect([...q.results.groups.keys()]).toEqual(['Ines', '(none)'])
    q.applyPreset('charactersByTag')
    expect([...q.results.groups.keys()]).toEqual(['major', '(none)'])
    q.applyPreset('generatedEntities')
    expect(q.results.rows.map((r) => r.name)).toEqual(['Marguerite'])
    expect(q.applyPreset('nope')).toBe(false)
  })

  it('builds a query by hand and reacts to store changes', () => {
    const { manuscript } = seed()
    const q = useStoryQueryStore()
    q.setDataset('subsections')
    q.addFilter({ field: 'contentStatus', op: 'eq', value: 'draft' })
    expect(q.results.rows.map((r) => r.id)).toEqual(['s1'])
    q.addFilter({ field: 'contentStatus', op: 'eq', value: 'review' })
    q.setCombinator('or')
    expect(q.results.rows.map((r) => r.id)).toEqual(['s1', 's3'])
    q.updateFilter(1, { value: 'generated' })
    expect(q.results.rows.map((r) => r.id)).toEqual(['s1', 's2'])
    q.removeFilter(0)
    expect(q.results.rows.map((r) => r.id)).toEqual(['s2'])
    // A row that changes in the manuscript store changes the answer.
    manuscript.subsections[2].contentStatus = 'generated'
    expect(q.results.rows.map((r) => r.id)).toEqual(['s2', 's3'])
    expect(q.activePreset).toBeNull()
  })

  it('offers discovered metadata columns and exposes rows by id', () => {
    seed()
    const q = useStoryQueryStore()
    q.setDataset('characters')
    expect(q.fields.some((f) => f.key === 'metadata.age')).toBe(true)
    expect(q.rowsById.get('c1').name).toBe('Ines')
    q.setVisibleColumns(['name'])
    expect(q.columns.map((c) => c.key)).toEqual(['name'])
  })

  it('writes cell edits back through the owning store', async () => {
    const { bible, manuscript } = seed()
    const q = useStoryQueryStore()
    const updChar = vi.spyOn(bible, 'updateCharacterData').mockResolvedValue(undefined)
    const setMeta = vi.spyOn(bible, 'setEntityMeta').mockResolvedValue(undefined)
    const updSub = vi.spyOn(manuscript, 'updateSubsectionData').mockResolvedValue(undefined)

    q.setDataset('characters')
    await q.updateCell('c2', 'generationStatus', 'approved')
    expect(updChar).toHaveBeenCalledWith('c2', { generationStatus: 'approved' }, 'p1')
    await q.updateCell('c1', 'metadata.age', 35)
    expect(setMeta).toHaveBeenCalledWith('character', 'c1', 'age', 35)

    q.setDataset('subsections')
    await q.updateCell('s3', 'pov', 'Tomas')
    expect(updSub).toHaveBeenCalledWith('s3', { pov: 'Tomas' }, 'p1')
    await q.updateCell('s3', 'metadata.beat', 'midpoint')
    expect(updSub).toHaveBeenLastCalledWith('s3', { metadata: { beat: 'midpoint' } }, 'p1')
  })
})

describe('StoryQueryView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const stubs = { BaseIcon: { template: '<i />' } }

  it('answers "which draft scenes have no characters?" in one click', async () => {
    seed()
    const w = mount(StoryQueryView, { global: { stubs } })
    await w.find('[data-test="preset-orphanScenes"]').trigger('click')
    const rows = w.findAll('[data-test="row"]')
    expect(rows).toHaveLength(2)
    expect(w.text()).toContain('The scar')
    expect(w.text()).toContain('Customs')
    expect(w.text()).not.toContain('Low tide')
    expect(w.text()).toContain('2 rows')
  })

  it('adds a filter row and narrows the table; grouping renders group headers', async () => {
    seed()
    const q = useStoryQueryStore()
    const w = mount(StoryQueryView, { global: { stubs } })
    expect(w.findAll('[data-test="row"]')).toHaveLength(3)
    await w.find('[data-test="add-filter"]').trigger('click')
    expect(w.findAll('[data-test="filter-row"]')).toHaveLength(1)
    q.updateFilter(0, { field: 'contentStatus', op: 'eq', value: 'review' })
    await w.vm.$nextTick()
    expect(w.findAll('[data-test="row"]')).toHaveLength(1)
    q.setGroup('pov')
    await w.vm.$nextTick()
    expect(w.findAll('[data-test="group"]')).toHaveLength(1)
    expect(w.text()).toContain('none')
  })

  it('inline edit writes back through the store', async () => {
    const { manuscript } = seed()
    const spy = vi.spyOn(manuscript, 'updateSubsectionData').mockResolvedValue(undefined)
    const w = mount(StoryQueryView, { global: { stubs } })
    const firstRow = w.findAll('[data-test="row"]')[0]
    // Column 5 is POV (editable) for subsections.
    const povCell = firstRow.findAll('td')[4]
    await povCell.trigger('dblclick')
    const input = povCell.find('input')
    expect(input.exists()).toBe(true)
    await input.setValue('Tomas')
    await input.trigger('keydown', { key: 'Enter' })
    expect(spy).toHaveBeenCalledWith('s1', { pov: 'Tomas' }, 'p1')
  })
})
