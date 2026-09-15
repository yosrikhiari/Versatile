import { describe, it, expect } from 'vitest'
import {
  runStoryQuery,
  matchFilter,
  discoverFields,
  readField,
  QUERY_PRESETS,
  ROW_CAP,
  NONE_GROUP
} from '@/services/storyQuery'

const SCENES = [
  {
    id: 's1',
    title: 'Low tide',
    order: 0,
    contentStatus: 'draft',
    pov: 'Ines',
    charactersPresent: ['Ines', 'Tomas'],
    wordCount: 900
  },
  {
    id: 's2',
    title: 'The scar',
    order: 1,
    contentStatus: 'generated',
    pov: 'Ines',
    charactersPresent: [],
    wordCount: 1200
  },
  {
    id: 's3',
    title: 'Customs',
    order: 2,
    contentStatus: 'review',
    pov: 'Tomas',
    charactersPresent: ['Tomas'],
    wordCount: 700
  },
  {
    id: 's4',
    title: 'Untitled',
    order: 3,
    contentStatus: 'draft',
    charactersPresent: [],
    metadata: { beat: 'midpoint', tension: 7 }
  }
]

const CHARS = [
  {
    id: 'c1',
    name: 'Ines',
    role: 'protagonist',
    tags: ['major', 'pov'],
    generationStatus: 'approved',
    metadata: { age: 34 }
  },
  { id: 'c2', name: 'Tomas', role: 'foil', tags: ['major'], generationStatus: 'approved' },
  { id: 'c3', name: 'Marguerite', role: 'harbourmaster', tags: [], generationStatus: 'generated' }
]

const q = (over) => ({
  dataset: 'subsections',
  filters: [],
  combinator: 'and',
  sort: null,
  group: null,
  ...over
})

describe('storyQuery — filters', () => {
  it('eq / neq / contains / in / empty / notEmpty / gt / lt', () => {
    const s = SCENES[0]
    expect(matchFilter(s, { field: 'contentStatus', op: 'eq', value: 'Draft' })).toBe(true)
    expect(matchFilter(s, { field: 'contentStatus', op: 'neq', value: 'draft' })).toBe(false)
    expect(matchFilter(s, { field: 'title', op: 'contains', value: 'tide' })).toBe(true)
    expect(matchFilter(s, { field: 'charactersPresent', op: 'contains', value: 'tom' })).toBe(true)
    expect(matchFilter(s, { field: 'contentStatus', op: 'in', value: ['review', 'draft'] })).toBe(
      true
    )
    expect(matchFilter(s, { field: 'contentStatus', op: 'in', value: 'review, generated' })).toBe(
      false
    )
    expect(matchFilter(s, { field: 'contentStatus', op: 'in', value: 'review, Draft' })).toBe(true)
    expect(matchFilter(SCENES[1], { field: 'charactersPresent', op: 'empty' })).toBe(true)
    expect(matchFilter(s, { field: 'charactersPresent', op: 'notEmpty' })).toBe(true)
    expect(matchFilter(s, { field: 'wordCount', op: 'gt', value: '800' })).toBe(true)
    expect(matchFilter(s, { field: 'wordCount', op: 'lt', value: 800 })).toBe(false)
  })

  it('treats a missing field as empty and reads metadata.* and bare metadata keys', () => {
    expect(matchFilter(SCENES[0], { field: 'pov2', op: 'empty' })).toBe(true)
    expect(readField(SCENES[3], 'metadata.beat')).toBe('midpoint')
    expect(readField(SCENES[3], 'tension')).toBe(7)
    expect(matchFilter(SCENES[3], { field: 'metadata.tension', op: 'gt', value: 5 })).toBe(true)
  })

  it('is total: an unknown operator matches nothing and never throws', () => {
    expect(matchFilter(SCENES[0], { field: 'title', op: 'regex', value: '.*' })).toBe(false)
    expect(runStoryQuery(null, q()).rows).toEqual([])
  })
})

describe('storyQuery — run', () => {
  it('answers "which draft scenes have no characters?"', () => {
    const r = runStoryQuery(
      SCENES,
      q({
        filters: [
          { field: 'contentStatus', op: 'eq', value: 'draft' },
          { field: 'charactersPresent', op: 'empty' }
        ]
      })
    )
    expect(r.rows.map((x) => x.id)).toEqual(['s4'])
  })

  it('OR widens, AND narrows', () => {
    const filters = [
      { field: 'contentStatus', op: 'eq', value: 'draft' },
      { field: 'contentStatus', op: 'eq', value: 'review' }
    ]
    expect(runStoryQuery(SCENES, q({ filters, combinator: 'or' })).rows.map((x) => x.id)).toEqual([
      's1',
      's3',
      's4'
    ])
    expect(runStoryQuery(SCENES, q({ filters, combinator: 'and' })).rows).toEqual([])
  })

  it('sorts with empties last in either direction', () => {
    const asc = runStoryQuery(SCENES, q({ sort: { field: 'wordCount', dir: 'asc' } })).rows.map(
      (x) => x.id
    )
    expect(asc).toEqual(['s3', 's1', 's2', 's4'])
    const desc = runStoryQuery(SCENES, q({ sort: { field: 'wordCount', dir: 'desc' } })).rows.map(
      (x) => x.id
    )
    expect(desc).toEqual(['s2', 's1', 's3', 's4'])
  })

  it('groups into a Map in first-seen order; empties under (none); list fields fan out', () => {
    const byPov = runStoryQuery(SCENES, q({ group: 'pov' })).groups
    expect(byPov).toBeInstanceOf(Map)
    expect([...byPov.keys()]).toEqual(['Ines', 'Tomas', NONE_GROUP])
    expect(byPov.get('Ines').map((x) => x.id)).toEqual(['s1', 's2'])

    const byTag = runStoryQuery(CHARS, q({ dataset: 'characters', group: 'tags' })).groups
    expect(byTag.get('major').map((x) => x.id)).toEqual(['c1', 'c2'])
    expect(byTag.get('pov').map((x) => x.id)).toEqual(['c1'])
    expect(byTag.get(NONE_GROUP).map((x) => x.id)).toEqual(['c3'])
  })

  it('caps rows and says so', () => {
    const many = Array.from({ length: ROW_CAP + 5 }, (_, i) => ({ id: i, title: `s${i}` }))
    const r = runStoryQuery(many, q())
    expect(r.rows).toHaveLength(ROW_CAP)
    expect(r.total).toBe(ROW_CAP + 5)
    expect(r.capped).toBe(true)
  })

  it('discovers custom metadata keys as typed columns', () => {
    const fields = discoverFields('subsections', SCENES)
    const beat = fields.find((f) => f.key === 'metadata.beat')
    const tension = fields.find((f) => f.key === 'metadata.tension')
    expect(beat).toMatchObject({ label: 'beat', type: 'text', editable: true })
    expect(tension).toMatchObject({ type: 'number' })
  })
})

describe('storyQuery — presets', () => {
  const run = (id, rows) => runStoryQuery(rows, QUERY_PRESETS.find((p) => p.id === id).query)

  it('orphanScenes, revisionChecklist, scenesByPov, charactersByTag, generatedEntities', () => {
    expect(run('orphanScenes', SCENES).rows.map((x) => x.id)).toEqual(['s2', 's4'])
    expect(run('revisionChecklist', SCENES).rows.map((x) => x.id)).toEqual(['s1', 's3', 's4'])
    expect([...run('scenesByPov', SCENES).groups.keys()]).toEqual(['Ines', 'Tomas', NONE_GROUP])
    expect([...run('charactersByTag', CHARS).groups.keys()]).toEqual(['major', 'pov', NONE_GROUP])
    expect(run('generatedEntities', CHARS).rows.map((x) => x.name)).toEqual(['Marguerite'])
  })
})
