/**
 * Story Query — a pure, total query engine over the story's rows
 * (Obsidian Bases / Dataview analog, roadmap Phase 2).
 *
 * A query is `{ dataset, filters, combinator, sort?, group? }`; a filter is
 * `{ field, op, value }`. Fields resolve through the row, then `metadata.<key>`
 * (schema v49 custom fields), so a custom property is queryable the moment it
 * is set. Missing fields read as empty. Nothing here touches a store or Dexie:
 * rows go in, rows (or a `Map` of groups) come out.
 */

export type Dataset = 'characters' | 'locations' | 'plotThreads' | 'sections' | 'subsections'

export type FilterOp = 'eq' | 'neq' | 'contains' | 'in' | 'empty' | 'notEmpty' | 'gt' | 'lt'

export interface QueryFilter {
  field: string
  op: FilterOp
  value?: unknown
}

export interface StoryQuery {
  dataset: Dataset
  filters: QueryFilter[]
  combinator: 'and' | 'or'
  sort?: { field: string; dir: 'asc' | 'desc' } | null
  group?: string | null
}

export interface FieldDef {
  key: string
  label: string
  /** Rendered and edited as this; `list` is an array of strings. */
  type: 'text' | 'number' | 'list' | 'boolean'
  /** Which store updater writes it back; `metadata` keys go through `setEntityMeta`. */
  editable?: boolean
}

export interface QueryResult {
  rows: any[]
  /** Present only when the query groups: insertion-ordered, `'(none)'` for rows with no value. */
  groups: Map<string, any[]> | null
  total: number
  capped: boolean
}

/** Rows past this are not returned; the view says so. Virtualisation is the follow-up. */
export const ROW_CAP = 500

export const NONE_GROUP = '(none)'

/**
 * The columns each dataset offers. Native fields first, then the Phase-1
 * scene-context / metadata columns. Custom `metadata.*` keys are discovered
 * from the rows at query time (`discoverFields`).
 */
export const DATASET_FIELDS: Record<Dataset, FieldDef[]> = {
  characters: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'role', label: 'Role', type: 'text', editable: true },
    { key: 'goal', label: 'Goal', type: 'text', editable: true },
    { key: 'generationStatus', label: 'Status', type: 'text', editable: true },
    { key: 'tags', label: 'Tags', type: 'list' },
    { key: 'traits', label: 'Traits', type: 'list' }
  ],
  locations: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'type', label: 'Type', type: 'text', editable: true },
    { key: 'generationStatus', label: 'Status', type: 'text', editable: true },
    { key: 'tags', label: 'Tags', type: 'list' }
  ],
  plotThreads: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'status', label: 'Status', type: 'text', editable: true },
    { key: 'generationStatus', label: 'Generation', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'list' }
  ],
  sections: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'status', label: 'Status', type: 'text', editable: true },
    { key: 'order', label: 'Order', type: 'number' },
    { key: 'wordCount', label: 'Words', type: 'number' },
    { key: 'pov', label: 'POV', type: 'text', editable: true },
    { key: 'location', label: 'Location', type: 'text', editable: true },
    { key: 'charactersPresent', label: 'Cast', type: 'list' },
    { key: 'tags', label: 'Tags', type: 'list' }
  ],
  subsections: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'contentStatus', label: 'Status', type: 'text', editable: true },
    { key: 'order', label: 'Order', type: 'number' },
    { key: 'wordCount', label: 'Words', type: 'number' },
    { key: 'pov', label: 'POV', type: 'text', editable: true },
    { key: 'location', label: 'Location', type: 'text', editable: true },
    { key: 'charactersPresent', label: 'Cast', type: 'list' },
    { key: 'tags', label: 'Tags', type: 'list' }
  ]
}

/** Custom `metadata.*` keys present on any row, as extra columns. */
export function discoverFields(dataset: Dataset, rows: any[]): FieldDef[] {
  const base = DATASET_FIELDS[dataset] || []
  const known = new Set(base.map((f) => f.key))
  const custom = new Map<string, FieldDef>()
  for (const row of rows || []) {
    const meta = row?.metadata
    if (!meta || typeof meta !== 'object') continue
    for (const [k, v] of Object.entries(meta)) {
      const key = `metadata.${k}`
      if (known.has(key) || custom.has(key)) continue
      const type: FieldDef['type'] = Array.isArray(v)
        ? 'list'
        : typeof v === 'number'
          ? 'number'
          : typeof v === 'boolean'
            ? 'boolean'
            : 'text'
      custom.set(key, { key, label: k, type, editable: true })
    }
  }
  return [...base, ...custom.values()]
}

/** Read a field off a row: a direct property, else `metadata.<key>`. */
export function readField(row: any, field: string): unknown {
  if (!row || !field) return undefined
  if (field.startsWith('metadata.')) return row.metadata?.[field.slice('metadata.'.length)]
  if (field in row) return row[field]
  return row.metadata?.[field]
}

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'string') return v.trim() === ''
  return false
}

function norm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(norm)
  if (typeof v === 'string' && v.trim()) return [norm(v)]
  return []
}

/** One filter against one row. Total: an unknown op is `false`, never a throw. */
export function matchFilter(row: any, filter: QueryFilter): boolean {
  const actual = readField(row, filter.field)
  const wanted = filter.value
  switch (filter.op) {
    case 'empty':
      return isEmptyValue(actual)
    case 'notEmpty':
      return !isEmptyValue(actual)
    case 'eq':
      if (Array.isArray(actual)) return asList(actual).includes(norm(wanted))
      if (typeof actual === 'number' && typeof wanted !== 'number') {
        return actual === Number(wanted)
      }
      if (typeof actual === 'boolean')
        return actual === (wanted === true || norm(wanted) === 'true')
      return norm(actual) === norm(wanted)
    case 'neq':
      return !matchFilter(row, { ...filter, op: 'eq' })
    case 'contains': {
      if (Array.isArray(actual)) {
        const needle = norm(wanted)
        return asList(actual).some((s) => s.includes(needle))
      }
      return norm(actual).includes(norm(wanted))
    }
    case 'in': {
      // The view's value box is one text input: "a, b, c" is the list.
      const options =
        typeof wanted === 'string' ? wanted.split(',').map(norm).filter(Boolean) : asList(wanted)
      if (Array.isArray(actual)) return asList(actual).some((s) => options.includes(s))
      return options.includes(norm(actual))
    }
    case 'gt':
      return typeof actual === 'number' && actual > Number(wanted)
    case 'lt':
      return typeof actual === 'number' && actual < Number(wanted)
    default:
      return false
  }
}

/** Order two present values; empties are handled by the caller so they stay last. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length
  return norm(a).localeCompare(norm(b))
}

/**
 * Filter → sort → group. Grouping returns a `Map` in first-seen order so the
 * view renders groups without a lookup per row. Empty group values land under
 * `NONE_GROUP`; a list-valued group field puts the row under each value.
 */
export function runStoryQuery(rows: any[], query: StoryQuery): QueryResult {
  const filters = Array.isArray(query.filters) ? query.filters.filter((f) => f && f.field) : []
  let out = (rows || []).filter((row) => {
    if (filters.length === 0) return true
    return query.combinator === 'or'
      ? filters.some((f) => matchFilter(row, f))
      : filters.every((f) => matchFilter(row, f))
  })

  if (query.sort?.field) {
    const { field, dir } = query.sort
    const sign = dir === 'desc' ? -1 : 1
    out = [...out].sort((a, b) => {
      const va = readField(a, field)
      const vb = readField(b, field)
      const ea = isEmptyValue(va)
      const eb = isEmptyValue(vb)
      if (ea && eb) return 0
      if (ea) return 1 // empties last, whichever direction
      if (eb) return -1
      return sign * compare(va, vb)
    })
  }

  const total = out.length
  const capped = total > ROW_CAP
  if (capped) out = out.slice(0, ROW_CAP)

  let groups: Map<string, any[]> | null = null
  if (query.group) {
    groups = new Map()
    for (const row of out) {
      const v = readField(row, query.group)
      const keys = Array.isArray(v)
        ? v.length
          ? v.map(String)
          : [NONE_GROUP]
        : [isEmptyValue(v) ? NONE_GROUP : String(v)]
      for (const k of keys) {
        const bucket = groups.get(k)
        if (bucket) bucket.push(row)
        else groups.set(k, [row])
      }
    }
  }

  return { rows: out, groups, total, capped }
}

export interface QueryPreset {
  id: string
  label: string
  description: string
  query: StoryQuery
}

/** The one-click answers the roadmap names, plus the ones the audit asked for. */
export const QUERY_PRESETS: QueryPreset[] = [
  {
    id: 'orphanScenes',
    label: 'Scenes with no cast',
    description: 'Subsections that name nobody — the ones the bible cannot see.',
    query: {
      dataset: 'subsections',
      filters: [{ field: 'charactersPresent', op: 'empty' }],
      combinator: 'and',
      sort: { field: 'order', dir: 'asc' },
      group: null
    }
  },
  {
    id: 'revisionChecklist',
    label: 'Revision checklist',
    description: 'Scenes still in draft, or kept for review by the generator.',
    query: {
      dataset: 'subsections',
      filters: [
        { field: 'contentStatus', op: 'eq', value: 'draft' },
        { field: 'contentStatus', op: 'eq', value: 'review' }
      ],
      combinator: 'or',
      sort: { field: 'order', dir: 'asc' },
      group: null
    }
  },
  {
    id: 'scenesByPov',
    label: 'Scenes by POV',
    description: 'Every scene, grouped by whose eyes it is told through.',
    query: {
      dataset: 'subsections',
      filters: [],
      combinator: 'and',
      sort: { field: 'order', dir: 'asc' },
      group: 'pov'
    }
  },
  {
    id: 'charactersByTag',
    label: 'Characters by tag',
    description: 'The cast, grouped by the tags you gave them.',
    query: {
      dataset: 'characters',
      filters: [],
      combinator: 'and',
      sort: { field: 'name', dir: 'asc' },
      group: 'tags'
    }
  },
  {
    id: 'generatedEntities',
    label: 'Generated, not yet approved',
    description: 'Characters the writer discovered during a run and nobody has looked at.',
    query: {
      dataset: 'characters',
      filters: [{ field: 'generationStatus', op: 'eq', value: 'generated' }],
      combinator: 'and',
      sort: { field: 'name', dir: 'asc' },
      group: null
    }
  }
]

export function emptyQuery(dataset: Dataset = 'subsections'): StoryQuery {
  return { dataset, filters: [], combinator: 'and', sort: null, group: null }
}

export const FILTER_OPS: Array<{ op: FilterOp; label: string; needsValue: boolean }> = [
  { op: 'eq', label: 'is', needsValue: true },
  { op: 'neq', label: 'is not', needsValue: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'in', label: 'is one of', needsValue: true },
  { op: 'empty', label: 'is empty', needsValue: false },
  { op: 'notEmpty', label: 'is set', needsValue: false },
  { op: 'gt', label: '>', needsValue: true },
  { op: 'lt', label: '<', needsValue: true }
]
