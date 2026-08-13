import { describe, it, expect } from 'vitest'
import { buildStoryTimeline, renderTimelineMarkdown } from '@/services/generation/storyTimeline'

// The one axis the project's four notions of time should always have shared.
// Both the Timeline view and the Timeline document render this, so what the
// author sees and what the writer is told cannot drift apart.

let seq = 0
const state = (over = {}) => ({
  projectId: 'p1',
  entityType: 'character',
  entityId: '1',
  entityName: 'Kael',
  sceneId: `s${++seq}`,
  sceneNumber: 1,
  chapterNumber: 1,
  sourceFacts: [],
  ...over,
  state: {
    present: true,
    status: 'unknown',
    condition: 'unknown',
    location: null,
    attributes: {},
    knows: [],
    ...(over.state || {})
  }
})

const edge = (over = {}) => ({
  sourceId: '1',
  sourceType: 'character',
  targetId: '2',
  targetType: 'character',
  relationshipType: 'ally',
  ...over
})

const names = { 1: 'Kael', 2: 'Mira' }
const resolveName = (_type, id) => names[id] || ''

describe('buildStoryTimeline', () => {
  it('reports nothing when the project has no chapter data at all', () => {
    const t = buildStoryTimeline({})
    expect(t.isEmpty).toBe(true)
    expect(t.chapters).toEqual([])
  })

  it('builds chapters from entity states alone, before any rollup has run', () => {
    // A project mid-first-draft has states long before it has chapter digests.
    // A timeline that appears only after a rollup is a timeline nobody sees.
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 2, state: { present: true } })]
    })
    expect(t.isEmpty).toBe(false)
    expect(t.chapters.map((c) => c.chapterNumber)).toEqual([2])
    expect(t.chapters[0].charactersPresent).toEqual(['Kael'])
  })

  it('orders chapters numerically', () => {
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 10 }), state({ chapterNumber: 2 })]
    })
    expect(t.chapters.map((c) => c.chapterNumber)).toEqual([2, 10])
  })

  it('uses manuscript titles when it has them', () => {
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 1 })],
      chapterTitles: { 1: 'The Drowned Gate' }
    })
    expect(t.chapters[0].title).toBe('The Drowned Gate')
  })

  it('reports a death as an event in the chapter it happens', () => {
    const t = buildStoryTimeline({
      entityStates: [
        state({ chapterNumber: 1 }),
        state({ chapterNumber: 4, state: { status: 'dead' }, sourceFacts: ['Kael dies.'] })
      ]
    })
    const events = t.chapters.find((c) => c.chapterNumber === 4).events
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'status', text: 'Kael dies' })
    expect(events[0].evidence).toEqual(['Kael dies.'])
  })

  it('reports transitions, not states', () => {
    // A character alive in forty consecutive chapters is not forty events.
    const t = buildStoryTimeline({
      entityStates: [1, 2, 3, 4].map((n) =>
        state({ chapterNumber: n, state: { present: true, status: 'alive' } })
      )
    })
    expect(t.chapters.every((c) => c.events.length === 0)).toBe(true)
  })

  it('reports a revival, because that one follows a death', () => {
    const t = buildStoryTimeline({
      entityStates: [
        state({ chapterNumber: 4, state: { status: 'dead' } }),
        state({ chapterNumber: 6, state: { status: 'alive' } })
      ]
    })
    expect(t.chapters.find((c) => c.chapterNumber === 6).events[0].text).toContain('alive again')
  })

  it('reports knowledge once, at the chapter it is first learned', () => {
    const t = buildStoryTimeline({
      entityStates: [
        state({ chapterNumber: 5, state: { knows: ['the warrant'] } }),
        state({ chapterNumber: 8, state: { knows: ['the warrant'] } })
      ]
    })
    expect(t.chapters.find((c) => c.chapterNumber === 5).events).toHaveLength(1)
    expect(t.chapters.find((c) => c.chapterNumber === 8).events).toHaveLength(0)
  })

  it('renders a relationship reversal as one event, not two', () => {
    // The payoff of the validity window: before it, the second claim was dropped
    // as a duplicate of the first and this event could not exist.
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 13 })],
      edges: [
        edge({ relationshipType: 'ally', validFromChapter: 1, validUntilChapter: 12 }),
        edge({ relationshipType: 'enemy', validFromChapter: 13, validUntilChapter: null })
      ],
      resolveName
    })
    const ch13 = t.chapters.find((c) => c.chapterNumber === 13)
    const relEvents = ch13.events.filter((e) => e.kind.startsWith('relationship'))
    expect(relEvents).toHaveLength(1)
    expect(relEvents[0].text).toBe('Kael — Mira: ally → enemy')
    // Chapter 12 must not also report "ally ends" — that is the same event.
    expect(t.chapters.find((c) => c.chapterNumber === 12)).toBeUndefined()
  })

  it('reports a relationship that simply ends', () => {
    const t = buildStoryTimeline({
      edges: [edge({ relationshipType: 'ally', validFromChapter: 1, validUntilChapter: 9 })],
      resolveName
    })
    expect(t.chapters.find((c) => c.chapterNumber === 9).events[0].text).toBe(
      'Kael — Mira: ally ends'
    )
  })

  it('does not place a legacy windowless edge anywhere', () => {
    // An edge written before windows existed is true for the whole story, not an
    // event that happens in some particular chapter.
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 1 })],
      edges: [edge()],
      resolveName
    })
    expect(t.chapters[0].events).toHaveLength(0)
  })

  it('does not place an opening claim at chapter 1 as an event', () => {
    // The base is the story's starting state, not something that happens.
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 1 })],
      edges: [edge({ validFromChapter: 1 })],
      resolveName
    })
    expect(t.chapters[0].events).toHaveLength(0)
  })

  it('drops an edge whose endpoints no longer resolve', () => {
    const t = buildStoryTimeline({
      entityStates: [state({ chapterNumber: 5 })],
      edges: [edge({ targetId: '999', validFromChapter: 5 })],
      resolveName
    })
    expect(t.chapters[0].events).toHaveLength(0)
  })

  it('merges digest and state data for a chapter without duplicating names', () => {
    const t = buildStoryTimeline({
      chapterDigests: [
        { chapterNumber: 1, summary: 'They reach the gate.', charactersPresent: ['Kael'] }
      ],
      entityStates: [state({ chapterNumber: 1, entityName: 'Kael' })]
    })
    expect(t.chapters[0].charactersPresent).toEqual(['Kael'])
    expect(t.chapters[0].summary).toBe('They reach the gate.')
  })
})

describe('renderTimelineMarkdown', () => {
  it('is empty for an empty timeline', () => {
    expect(renderTimelineMarkdown(buildStoryTimeline({}))).toBe('')
  })

  it('renders a chapter with its changes', () => {
    const md = renderTimelineMarkdown(
      buildStoryTimeline({
        chapterDigests: [{ chapterNumber: 4, summary: 'The gate falls.' }],
        entityStates: [
          state({
            chapterNumber: 4,
            state: { present: true, status: 'dead', location: 'The Gate' }
          })
        ],
        chapterTitles: { 4: 'The Drowned Gate' }
      })
    )
    expect(md).toContain('## Chapter 4 — The Drowned Gate')
    expect(md).toContain('The gate falls.')
    expect(md).toContain('Present: Kael')
    expect(md).toContain('- Kael dies')
  })

  it('skips a chapter with nothing derived rather than rendering an empty heading', () => {
    // In a prompt, a bare heading reads as "nothing happens here" instead of
    // "not analysed yet".
    const md = renderTimelineMarkdown({
      chapters: [
        {
          chapterNumber: 1,
          title: 'One',
          summary: '',
          charactersPresent: [],
          locations: [],
          events: []
        },
        {
          chapterNumber: 2,
          title: 'Two',
          summary: 'Something.',
          charactersPresent: [],
          locations: [],
          events: []
        }
      ],
      emptyChapters: [1],
      isEmpty: false
    })
    expect(md).not.toContain('Chapter 1')
    expect(md).toContain('Chapter 2')
  })
})
