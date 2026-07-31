import { describe, it, expect } from 'vitest'
import { planCanvasElements, elementKey, CANVAS_TYPES } from '@/services/storyCanvasSync'

const source = {
  sections: [
    { id: 's1', title: 'The Arrival', order: 0 },
    { id: 's2', title: 'Cold Water', order: 1 }
  ],
  characters: [{ id: 'c1', name: 'Mara' }],
  locations: [{ id: 'l1', name: 'The Lighthouse' }],
  plotThreads: [{ id: 't1', title: 'Who moved the boat' }]
}

describe('planCanvasElements', () => {
  it('populates an empty canvas from every kind of generated content', () => {
    // The gap this closes: after generating a volume the canvas still read
    // "No elements yet", because nothing outside the canvas component ever
    // wrote storyElements.
    const plan = planCanvasElements(source, [])
    expect(plan).toHaveLength(5)
    expect(plan.map((e) => e.type)).toEqual([
      CANVAS_TYPES.SECTION,
      CANVAS_TYPES.SECTION,
      CANVAS_TYPES.CHARACTER,
      CANVAS_TYPES.LOCATION,
      CANVAS_TYPES.PLOT_POINT
    ])
    expect(plan.map((e) => e.title)).toContain('Mara')
    expect(plan.map((e) => e.title)).toContain('Who moved the boat')
  })

  it('is idempotent — a second run adds nothing', () => {
    const first = planCanvasElements(source, [])
    expect(planCanvasElements(source, first)).toEqual([])
  })

  it('adds only what is new when the story grows', () => {
    const existing = planCanvasElements(source, [])
    const grown = {
      ...source,
      sections: [...source.sections, { id: 's3', title: 'The Signal', order: 2 }],
      characters: [...source.characters, { id: 'c2', name: 'Ines' }]
    }
    const plan = planCanvasElements(grown, existing)
    expect(plan.map((e) => e.title)).toEqual(['The Signal', 'Ines'])
  })

  it('does not duplicate a section the author already dragged onto the canvas', () => {
    // Drag-created elements record data.sectionId and no source key.
    const dragged = [{ type: 'section', data: { sectionId: 's1' } }]
    const plan = planCanvasElements(source, dragged)
    expect(plan.map((e) => e.title)).not.toContain('The Arrival')
    expect(plan).toHaveLength(4)
  })

  it('never rewrites or removes what the author placed', () => {
    const authored = [{ type: 'note', title: 'my own note', data: { color: 'red' } }]
    const plan = planCanvasElements(source, authored)
    // Purely additive: the note is untouched and simply not returned.
    expect(plan.every((e) => e.title !== 'my own note')).toBe(true)
    expect(plan).toHaveLength(5)
  })

  it('places new elements below an existing arrangement rather than on top of it', () => {
    const authored = [
      { type: 'note', title: 'a', data: {} },
      { type: 'note', title: 'b', data: {} },
      { type: 'note', title: 'c', data: {} },
      { type: 'note', title: 'd', data: {} }
    ]
    const plan = planCanvasElements(source, authored)
    expect(plan[0].y).toBeGreaterThan(0)
  })

  it('falls back to a positional title for an untitled chapter', () => {
    const plan = planCanvasElements({ sections: [{ id: 'x', order: 4 }] }, [])
    expect(plan[0].title).toBe('Chapter 5')
  })

  it('skips entities with no usable name', () => {
    const plan = planCanvasElements(
      {
        characters: [{ id: 'c1' }, { id: 'c2', name: 'Real' }],
        locations: [{ id: 'l1', name: '' }]
      },
      []
    )
    expect(plan.map((e) => e.title)).toEqual(['Real'])
  })

  it('handles an entirely empty story without throwing', () => {
    expect(planCanvasElements({}, [])).toEqual([])
    expect(planCanvasElements({}, undefined)).toEqual([])
  })

  it('tags generated elements so they are distinguishable from authored ones', () => {
    const plan = planCanvasElements(source, [])
    expect(plan.every((e) => e.data.generated === true)).toBe(true)
  })
})

describe('elementKey', () => {
  it('keys by explicit source when present', () => {
    expect(elementKey({ data: { sourceType: 'character', sourceId: 'c1' } })).toBe('character:c1')
  })

  it('recognises the legacy drag-created section shape', () => {
    expect(elementKey({ type: 'section', data: { sectionId: 's9' } })).toBe('section:s9')
  })

  it('returns null for a free-form element that stands for nothing', () => {
    expect(elementKey({ type: 'note', data: { color: 'red' } })).toBeNull()
    expect(elementKey({})).toBeNull()
  })
})
