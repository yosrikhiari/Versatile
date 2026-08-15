import { describe, it, expect } from 'vitest'
import {
  buildStoryTimeline,
  renderTimelineMarkdown,
  pacingOutliers
} from '@/services/generation/storyTimeline'

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

  // A digest with no chapter number yields a state with none, which is ordinary
  // mid-draft. Those states sort ahead of everything (chapterNumber ?? 0) and
  // cannot be rendered anywhere, so they must not participate in the running
  // comparison either.
  describe('states the digest could not place in a chapter', () => {
    it('does not let an unplaceable death read as a resurrection later', () => {
      const t = buildStoryTimeline({
        entityStates: [
          state({ chapterNumber: null, sceneNumber: 1, state: { status: 'dead' } }),
          state({ chapterNumber: 5, sceneNumber: 2, state: { status: 'alive' } })
        ]
      })
      const texts = t.chapters.flatMap((c) => c.events.map((e) => e.text))
      expect(texts).not.toContain('Kael is alive again')
    })

    it('still reports a topic as learned in the first chapter that can hold it', () => {
      const t = buildStoryTimeline({
        entityStates: [
          state({ chapterNumber: null, sceneNumber: 1, state: { knows: ['the betrayal'] } }),
          state({ chapterNumber: 4, sceneNumber: 2, state: { knows: ['the betrayal'] } })
        ]
      })
      const ch4 = t.chapters.find((c) => c.chapterNumber === 4)
      expect(ch4.events.map((e) => e.text)).toContain('Kael learns: the betrayal')
    })

    it('places a state on the axis when the manuscript knows its scene', () => {
      const t = buildStoryTimeline({
        entityStates: [state({ chapterNumber: null, sceneId: 'sc-9', state: { status: 'dead' } })],
        sceneChapters: { 'sc-9': 3 }
      })
      const ch3 = t.chapters.find((c) => c.chapterNumber === 3)
      expect(ch3.events.map((e) => e.text)).toContain('Kael dies')
    })

    it('leaves a state unplaced when the manuscript does not know its scene', () => {
      const t = buildStoryTimeline({
        entityStates: [
          state({ chapterNumber: null, sceneId: 'sc-unknown', state: { status: 'dead' } })
        ],
        sceneChapters: { 'sc-other': 3 }
      })
      expect(t.isEmpty).toBe(true)
    })

    it('flags a character who never appears again, but not on the last chapter', () => {
      // A thread dropped mid-story is worth surfacing. On the final chapter
      // everyone is "last seen", which says nothing at all.
      const t = buildStoryTimeline({
        entityStates: [
          state({ chapterNumber: 1, entityName: 'Mira' }),
          state({ chapterNumber: 2, entityName: 'Kael' }),
          state({ chapterNumber: 3, entityName: 'Kael' })
        ]
      })
      expect(t.chapters.find((c) => c.chapterNumber === 1).droppedThreads).toEqual(['Mira'])
      expect(t.chapters.find((c) => c.chapterNumber === 3).droppedThreads).toEqual([])
    })

    it('carries chapter word counts and renders them', () => {
      const t = buildStoryTimeline({
        entityStates: [state({ chapterNumber: 1 })],
        chapterWordCounts: { 1: 3200 }
      })
      expect(t.chapters[0].wordCount).toBe(3200)
      expect(renderTimelineMarkdown(t)).toContain('Length: 3,200 words')
    })

    it('leaves wordCount null when the manuscript has not measured it', () => {
      const t = buildStoryTimeline({ entityStates: [state({ chapterNumber: 1 })] })
      expect(t.chapters[0].wordCount).toBeNull()
      expect(renderTimelineMarkdown(t)).not.toContain('Length:')
    })

    it('reports a real death normally when it is placed', () => {
      const t = buildStoryTimeline({
        entityStates: [
          state({ chapterNumber: 2, sceneNumber: 1, state: { status: 'dead' } }),
          state({ chapterNumber: 6, sceneNumber: 2, state: { status: 'alive' } })
        ]
      })
      const texts = t.chapters.flatMap((c) => c.events.map((e) => e.text))
      expect(texts).toContain('Kael dies')
      expect(texts).toContain('Kael is alive again')
    })
  })
})

describe('renderTimelineMarkdown at scale', () => {
  // The doc grows linearly with the manuscript — ~43 tokens a chapter against a
  // 3500-token budget for the entire bible. Unbounded, an 80-chapter book fills
  // it and a ten-volume one needs five times it, crowding out the cast and the
  // world. Nothing downstream caught this: truncateToBudget keeps parts[0]
  // unconditionally and the whole chapter body lives there.
  const long = (n) =>
    buildStoryTimeline({
      entityStates: Array.from({ length: n }, (_, i) =>
        state({ chapterNumber: i + 1, sceneNumber: 1 })
      )
    })

  it('keeps the most recent chapters, not the earliest', () => {
    const out = renderTimelineMarkdown(long(100), { maxChapters: 10 })
    expect(out).toContain('## Chapter 100')
    expect(out).toContain('## Chapter 91')
    expect(out).not.toContain('## Chapter 90')
    expect(out).not.toContain('## Chapter 1\n')
  })

  it('says which chapters it dropped rather than starting mid-story silently', () => {
    const out = renderTimelineMarkdown(long(100), { maxChapters: 10 })
    expect(out).toContain('Chapters 1–90 are earlier history')
  })

  it('stays roughly flat in size however long the story gets', () => {
    const short = renderTimelineMarkdown(long(40), { maxChapters: 30 }).length
    const huge = renderTimelineMarkdown(long(400), { maxChapters: 30 }).length
    // Only the elision line's digits differ.
    expect(Math.abs(huge - short)).toBeLessThan(200)
  })

  it('does not annotate or truncate a story shorter than the cap', () => {
    const out = renderTimelineMarkdown(long(5), { maxChapters: 30 })
    expect(out).not.toContain('earlier history')
    expect(out).toContain('## Chapter 1')
    expect(out).toContain('## Chapter 5')
  })

  it('is uncapped when no cap is given, so the author-facing path is unchanged', () => {
    const out = renderTimelineMarkdown(long(60))
    expect(out).toContain('## Chapter 1')
    expect(out).toContain('## Chapter 60')
    expect(out).not.toContain('earlier history')
  })
})

describe('pacingOutliers', () => {
  const withCounts = (counts) =>
    buildStoryTimeline({
      entityStates: Object.keys(counts).map((n) => state({ chapterNumber: Number(n) })),
      chapterWordCounts: counts
    })

  it('says nothing until there are enough measured chapters to average', () => {
    expect(pacingOutliers(withCounts({ 1: 3000, 2: 3000 }))).toEqual([])
  })

  it('finds the chapter far off this story’s own average', () => {
    const out = pacingOutliers(withCounts({ 1: 3000, 2: 3100, 3: 2900, 4: 400 }))
    expect(out.map((o) => o.chapterNumber)).toEqual([4])
    expect(out[0].ratio).toBeLessThan(0.5)
  })

  it('treats an evenly paced story as having no outliers', () => {
    expect(pacingOutliers(withCounts({ 1: 3000, 2: 3100, 3: 2900, 4: 3050 }))).toEqual([])
  })

  it('ignores chapters the manuscript never measured', () => {
    expect(pacingOutliers(withCounts({ 1: 3000, 2: 3100 }))).toEqual([])
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
