import { describe, it, expect, beforeEach } from 'vitest'

/**
 * End-to-end over the REAL Dexie schema (fake-indexeddb), not mocks.
 *
 * The question this answers is the one the unit tests cannot: after the pipeline
 * writes a plan and finalises, is every editor surface actually populated in the
 * database the editor reads from?
 */

let db, batchCreatePlanStructure, getStoryElements, addStoryElementsBatch, planCanvasElements

beforeEach(async () => {
  const core = await import('@/services/db-core')
  db = core.db
  ;({ batchCreatePlanStructure } = await import('@/services/db-structure'))
  ;({ getStoryElements, addStoryElementsBatch } = await import('@/services/db-graph'))
  ;({ planCanvasElements } = await import('@/services/storyCanvasSync'))

  for (const table of ['sections', 'subsections', 'storyElements']) {
    await db[table].clear()
  }
})

const PROJECT = 'p-integration'

function planGroups() {
  return [
    {
      title: 'Chapter 1: The Arrival',
      volumeId: 'v1',
      scenes: [
        {
          sceneNumber: 1,
          title: 'Landfall',
          emotionalGoal: 'Mara realises she is being watched',
          whatChanges: 'the lamp goes dark',
          obstacle: 'the stairwell is flooded',
          location: 'The Lighthouse',
          charactersPresent: ['Mara', 'Ines'],
          pov: 'Mara'
        },
        {
          sceneNumber: 2,
          title: 'The Log Book',
          emotionalGoal: 'suspicion hardens',
          whatChanges: 'a page is missing',
          location: 'The Lighthouse',
          charactersPresent: ['Mara']
        }
      ]
    },
    {
      title: 'Chapter 2: Cold Water',
      volumeId: 'v1',
      scenes: [
        {
          sceneNumber: 3,
          title: 'The Boat',
          emotionalGoal: 'escape looks impossible',
          whatChanges: 'the boat is gone',
          location: 'The Pier',
          charactersPresent: ['Mara', 'Ines']
        }
      ]
    }
  ]
}

describe('generating a volume populates the editor', () => {
  it('creates chapters and scenes the manuscript view can read', async () => {
    await batchCreatePlanStructure({ projectId: PROJECT, groups: planGroups() })

    const sections = await db.sections.where('projectId').equals(PROJECT).toArray()
    const subsections = await db.subsections.where('projectId').equals(PROJECT).toArray()

    expect(sections).toHaveLength(2)
    expect(subsections).toHaveLength(3)
    expect(sections.map((s) => s.title)).toEqual([
      'Chapter 1: The Arrival',
      'Chapter 2: Cold Water'
    ])
  })

  it('stores the planner brief on each scene, not a "Scene N" placeholder', async () => {
    // The outline renders this, and the NEXT run re-reads it as its account of
    // the existing manuscript — a placeholder told both of them nothing.
    await batchCreatePlanStructure({ projectId: PROJECT, groups: planGroups() })

    const subsections = await db.subsections.where('projectId').equals(PROJECT).toArray()
    const landfall = subsections.find((s) => s.title === 'Landfall')

    expect(landfall.description).toContain('Mara realises she is being watched')
    expect(landfall.description).toContain('The Lighthouse — Mara, Ines')
    expect(landfall.description).not.toBe('Scene 1')
    expect(subsections.every((s) => !/^Scene \d+$/.test(s.description))).toBe(true)
  })

  it('assigns chapters to their volume so the chapter manager can group them', async () => {
    await batchCreatePlanStructure({ projectId: PROJECT, groups: planGroups() })
    const sections = await db.sections.where('projectId').equals(PROJECT).toArray()
    // ChapterManager filters by section.volumeId.
    expect(sections.every((s) => s.volumeId === 'v1')).toBe(true)
  })

  it('populates the Story Canvas from the generated chapters and entities', async () => {
    await batchCreatePlanStructure({ projectId: PROJECT, groups: planGroups() })
    const sections = await db.sections.where('projectId').equals(PROJECT).toArray()

    const plan = planCanvasElements(
      {
        sections,
        characters: [
          { id: 'c1', name: 'Mara' },
          { id: 'c2', name: 'Ines' }
        ],
        locations: [{ id: 'l1', name: 'The Lighthouse' }],
        plotThreads: [{ id: 't1', title: 'Who moved the boat' }]
      },
      await getStoryElements(PROJECT)
    )
    await addStoryElementsBatch(PROJECT, plan)

    const stored = await getStoryElements(PROJECT)
    expect(stored).toHaveLength(6) // 2 chapters + 2 characters + 1 location + 1 thread
    expect(stored.map((e) => e.title)).toEqual(
      expect.arrayContaining([
        'Chapter 1: The Arrival',
        'Chapter 2: Cold Water',
        'Mara',
        'Ines',
        'The Lighthouse',
        'Who moved the boat'
      ])
    )
  })

  it('adds nothing to the canvas on a second run over the same story', async () => {
    await batchCreatePlanStructure({ projectId: PROJECT, groups: planGroups() })
    const sections = await db.sections.where('projectId').equals(PROJECT).toArray()
    const source = { sections, characters: [{ id: 'c1', name: 'Mara' }] }

    await addStoryElementsBatch(
      PROJECT,
      planCanvasElements(source, await getStoryElements(PROJECT))
    )
    const afterFirst = await getStoryElements(PROJECT)

    const secondPlan = planCanvasElements(source, afterFirst)
    expect(secondPlan).toEqual([])
    expect(await getStoryElements(PROJECT)).toHaveLength(afterFirst.length)
  })

  it('leaves an author-placed canvas element untouched across a run', async () => {
    await addStoryElementsBatch(PROJECT, [
      { type: 'note', title: 'my own note', x: 0, y: 0, width: 200, height: 100, data: {} }
    ])
    await batchCreatePlanStructure({ projectId: PROJECT, groups: planGroups() })
    const sections = await db.sections.where('projectId').equals(PROJECT).toArray()

    await addStoryElementsBatch(
      PROJECT,
      planCanvasElements({ sections }, await getStoryElements(PROJECT))
    )

    const stored = await getStoryElements(PROJECT)
    const note = stored.find((e) => e.title === 'my own note')
    expect(note).toBeDefined()
    expect(note.type).toBe('note')
    expect(stored).toHaveLength(3) // the note plus 2 chapters
  })
})
