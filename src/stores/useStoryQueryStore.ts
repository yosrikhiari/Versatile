import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useStoryBibleStore } from './storyBibleStore'
import { useManuscriptStore } from './manuscriptStore'
import { useProjectStore } from './projectStore'
import {
  runStoryQuery,
  discoverFields,
  emptyQuery,
  QUERY_PRESETS,
  type Dataset,
  type QueryFilter,
  type StoryQuery
} from '../services/storyQuery'

/**
 * The active Story Query and its results. No data source of its own: rows
 * come from the story-bible and manuscript stores, and every edit goes back
 * through their updaters (`update*Data`, `setEntityMeta`) — this is the one
 * cross-entity / scene-level query surface, not a third copy of the data.
 */
export const useStoryQueryStore = defineStore('storyQuery', () => {
  const bible = useStoryBibleStore()
  const manuscript = useManuscriptStore()
  const project = useProjectStore()

  const query = ref<StoryQuery>(emptyQuery('subsections'))
  const activePreset = ref<string | null>(null)
  /** Column keys shown; empty means "all fields for the dataset". */
  const visibleColumns = ref<string[]>([])

  const rows = computed<any[]>(() => {
    switch (query.value.dataset) {
      case 'characters':
        return bible.characters as any[]
      case 'locations':
        return bible.locations as any[]
      case 'plotThreads':
        return bible.plotThreads as any[]
      case 'sections':
        return manuscript.sections as any[]
      case 'subsections':
        return manuscript.subsections as any[]
      default:
        return []
    }
  })

  const fields = computed(() => discoverFields(query.value.dataset, rows.value))

  const columns = computed(() => {
    if (!visibleColumns.value.length) return fields.value
    const wanted = new Set(visibleColumns.value)
    return fields.value.filter((f) => wanted.has(f.key))
  })

  const results = computed(() => runStoryQuery(rows.value, query.value))

  /** Rows by id, so a group's members render without a lookup per row. */
  const rowsById = computed(() => {
    const m = new Map<any, any>()
    for (const r of results.value.rows) m.set(r.id, r)
    return m
  })

  function setDataset(dataset: Dataset) {
    if (query.value.dataset === dataset) return
    query.value = emptyQuery(dataset)
    visibleColumns.value = []
    activePreset.value = null
  }

  function addFilter(filter?: Partial<QueryFilter>) {
    const first = fields.value[0]?.key || 'title'
    query.value.filters.push({ field: first, op: 'notEmpty', ...(filter || {}) } as QueryFilter)
    activePreset.value = null
  }

  function updateFilter(index: number, patch: Partial<QueryFilter>) {
    const f = query.value.filters[index]
    if (!f) return
    query.value.filters[index] = { ...f, ...patch }
    activePreset.value = null
  }

  function removeFilter(index: number) {
    query.value.filters.splice(index, 1)
    activePreset.value = null
  }

  function setCombinator(c: 'and' | 'or') {
    query.value.combinator = c
    activePreset.value = null
  }

  function setSort(field: string | null, dir: 'asc' | 'desc' = 'asc') {
    query.value.sort = field ? { field, dir } : null
  }

  function setGroup(field: string | null) {
    query.value.group = field || null
  }

  function setVisibleColumns(keys: string[]) {
    visibleColumns.value = [...keys]
  }

  function applyPreset(id: string) {
    const preset = QUERY_PRESETS.find((p) => p.id === id)
    if (!preset) return false
    // Deep copy: the preset is a constant and the view mutates the query.
    query.value = JSON.parse(JSON.stringify(preset.query))
    visibleColumns.value = []
    activePreset.value = id
    return true
  }

  function clear() {
    query.value = emptyQuery(query.value.dataset)
    activePreset.value = null
  }

  /**
   * Write one cell back. `metadata.*` keys go through `setEntityMeta` (entities)
   * or a merged `metadata` patch (scenes); native keys through the dataset's
   * `update*Data`. The row updates reactively through the owning store.
   */
  async function updateCell(rowId: any, field: string, value: unknown) {
    const dataset = query.value.dataset
    const projectId = project.currentProjectId
    const isMeta = field.startsWith('metadata.')
    const metaKey = isMeta ? field.slice('metadata.'.length) : null

    if (dataset === 'characters' || dataset === 'locations' || dataset === 'plotThreads') {
      const kind =
        dataset === 'characters' ? 'character' : dataset === 'locations' ? 'location' : 'plotThread'
      if (isMeta) return bible.setEntityMeta(kind, rowId, metaKey!, value)
      const updater =
        dataset === 'characters'
          ? bible.updateCharacterData
          : dataset === 'locations'
            ? bible.updateLocationData
            : bible.updatePlotThreadData
      return updater(rowId, { [field]: value }, projectId)
    }

    const row = (rows.value as any[]).find((r) => r.id === rowId)
    const patch: any = isMeta
      ? { metadata: { ...(row?.metadata || {}), [metaKey!]: value } }
      : { [field]: value }
    if (dataset === 'sections') return manuscript.updateSectionData(rowId, patch, projectId)
    return manuscript.updateSubsectionData(rowId, patch, projectId)
  }

  return {
    query,
    activePreset,
    visibleColumns,
    rows,
    fields,
    columns,
    results,
    rowsById,
    presets: QUERY_PRESETS,
    setDataset,
    addFilter,
    updateFilter,
    removeFilter,
    setCombinator,
    setSort,
    setGroup,
    setVisibleColumns,
    applyPreset,
    clear,
    updateCell
  }
})
