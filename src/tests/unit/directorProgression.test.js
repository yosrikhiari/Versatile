import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// A live 10-chapter run planned "The Second Body" in eight chapters and "The
// Salt Road" in eight, every scene "Ines begins to suspect…" the same thing.
// The planner saw only its own chapter's line, so each chapter re-derived the
// opening beats from the premise. These pin the audit that catches it and the
// blocks that give the planner the whole outline.

vi.mock('@/services/aiService', () => ({
  aiGenerate: vi.fn(),
  aiStream: vi.fn(),
  aiGenerateStructured: vi.fn(),
  resolveFeatureConfig: () => ({ provider: 'ollama', model: 'qwen3:8b' })
}))
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({
    activeWorkspaceType: 'creative',
    currentProjectId: 'p1',
    getActivePrompts: vi.fn(() => ({ director: 'x' })),
    promptOverrides: { director: '' }
  })
}))
vi.mock('@/services/researchDb', () => ({
  getAllChunksForProject: vi.fn(async () => []),
  getAllResearchDocuments: vi.fn(async () => [])
}))

let findRepetitiveChapters, buildOutlineBlock, buildEstablishedBlock
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  ;({ findRepetitiveChapters, buildOutlineBlock, buildEstablishedBlock } =
    await import('@/composables/useStoryDirector'))
})

const scene = (title, whatChanges) => ({ title, whatChanges })

describe('findRepetitiveChapters', () => {
  it('flags the plan the live run produced — same titles and the same event, chapter after chapter', () => {
    const chapters = [
      {
        scenes: [
          scene('The Ice Certificate', 'Ines signs the certificate for the dead man'),
          scene('The Second Body', 'Ines witnesses the second body pulled from the ice')
        ]
      },
      {
        scenes: [
          scene(
            'The Second Body',
            'Ines becomes aware that multiple people have conflicting stories about the dead man'
          ),
          scene('The Salt Road', 'Ines begins to uncover the town hidden history')
        ]
      },
      {
        scenes: [
          scene('The Salt Road', 'Ines leaves the board office to seek answers beyond the town'),
          scene(
            'The Second Body',
            'Ines begins questioning her role in validating multiple conflicting stories about the dead man'
          )
        ]
      }
    ]
    const offenders = findRepetitiveChapters(chapters)
    expect(offenders.map((o) => o.index)).toEqual([1, 2])
    expect(offenders[0].repeats.map((r) => r.title)).toContain('The Second Body')
    expect(offenders[0].repeats[0].reason).toMatch(/chapter 1/)
  })

  it('does not flag a chapter for repeating itself, or for genuinely new events', () => {
    const chapters = [
      {
        scenes: [
          scene('Landing', 'June asks to stay the winter'),
          scene('Landing', 'Mara neither accepts nor refuses')
        ]
      },
      {
        scenes: [
          scene('The Lamp Room', 'June notices two hands in the log'),
          scene('Ninety Steps', 'Mara falls on the stairs and hides it')
        ]
      },
      {
        scenes: [
          scene('The Logbook', 'June asks whose handwriting shares the log'),
          scene('A Name', 'Mara answers with a name, not an explanation')
        ]
      }
    ]
    expect(findRepetitiveChapters(chapters)).toEqual([])
  })

  it('catches the same event under a different title', () => {
    const chapters = [
      {
        scenes: [
          scene('Low Tide', 'Ines pulls the stranger with the compass tattoo from the harbour ice')
        ]
      },
      {
        scenes: [
          scene(
            'Grey Morning',
            'Ines pulls the stranger with the compass tattoo from the ice of the harbour'
          )
        ]
      }
    ]
    const offenders = findRepetitiveChapters(chapters)
    expect(offenders).toHaveLength(1)
    expect(offenders[0].index).toBe(1)
    expect(offenders[0].repeats[0].reason).toMatch(/same event as "Low Tide"/)
  })

  it('tolerates missing scenes and holes', () => {
    expect(findRepetitiveChapters([null, { scenes: null }, {}])).toEqual([])
  })
})

describe('outline and established blocks', () => {
  const chapters = [
    {
      title: 'Low Tide',
      goal: 'Ines signs the first certificate',
      revealed: 'the tattoo',
      stateAfter: 'the man is buried as a stranger'
    },
    {
      title: 'Twice',
      goal: 'the same man comes out of the ice again',
      revealed: 'the second set of scars'
    },
    { title: 'Inland', goal: 'Ines walks the salt road' }
  ]

  it('marks the chapter being planned and lists every other one', () => {
    const block = buildOutlineBlock(chapters, 1)
    expect(block).toMatch(/1\. Low Tide — Ines signs the first certificate \[reveals: the tattoo\]/)
    expect(block).toMatch(
      /2\. Twice — the same man comes out of the ice again \[reveals: the second set of scars\] ◀ THIS CHAPTER/
    )
    expect(block).toMatch(/3\. Inland — Ines walks the salt road$/m)
  })

  it('lists only what earlier chapters revealed, as things not to re-establish', () => {
    expect(buildEstablishedBlock(chapters, 0)).toBe('')
    const block = buildEstablishedBlock(chapters, 2)
    expect(block).toMatch(/ALREADY ESTABLISHED/)
    expect(block).toMatch(/- ch 1: the tattoo/)
    expect(block).toMatch(/- after ch 1: the man is buried as a stranger/)
    expect(block).toMatch(/- ch 2: the second set of scars/)
    expect(block).not.toMatch(/Inland/)
  })
})

describe('storyShapeFor and the future block', () => {
  it('always puts the climax on N−1 and the resolution on N, monotonically', async () => {
    const { storyShapeFor } = await import('@/composables/useStoryDirector')
    for (const n of [3, 5, 10, 12, 30]) {
      const shape = storyShapeFor(n)
      expect(shape).toHaveLength(n)
      expect(shape[n - 1]).toMatch(/^resolution/)
      expect(shape[n - 2]).toMatch(/^climax/)
      expect(shape[0]).toMatch(/^opening/)
      // No chapter's beat comes before its predecessor's.
      const order = shape.map((b) => b.split(' — ')[0])
      const ladder = [
        'opening',
        'inciting incident',
        'first complication',
        'commitment',
        'rising pressure',
        'midpoint reversal',
        'consequences',
        'the walls close in',
        'crisis',
        'climax',
        'resolution'
      ]
      const idx = order.map((o) => ladder.indexOf(o))
      expect(idx.every((v) => v >= 0)).toBe(true)
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1])
    }
  })

  it('names the later chapters as not yet happened', async () => {
    const { buildNotYetBlock } = await import('@/composables/useStoryDirector')
    const chapters = [{ goal: 'a' }, { goal: 'the second body' }, { goal: 'the ledger' }]
    expect(buildNotYetBlock(chapters, 2)).toBe('')
    const block = buildNotYetBlock(chapters, 0)
    expect(block).toMatch(/NOT YET HAPPENED/)
    expect(block).toMatch(/- ch 2: the second body/)
    expect(block).toMatch(/- ch 3: the ledger/)
    expect(block).not.toMatch(/ch 1/)
  })

  it('flags a chapter whose goal repeats an earlier one — the double ending', async () => {
    const { findDuplicateChapterGoals } = await import('@/composables/useStoryDirector')
    const chapters = [
      { goal: 'Ines signs the first certificate for the stranger from the ice' },
      {
        goal: 'Ines signs the final certificate, choosing which version of Marrow she will belong to',
        revealed: 'her choice'
      },
      {
        goal: 'Ines signs the certificate and officially chooses which version of Marrow she belongs to',
        revealed: 'her choice'
      }
    ]
    expect(findDuplicateChapterGoals(chapters)).toEqual([{ index: 2, duplicateOf: 1 }])
  })
})

describe('events decided in the skeleton', () => {
  it("lists earlier chapters' planned scenes as things that may not happen again", async () => {
    const { buildPlannedScenesBlock } = await import('@/composables/useStoryDirector')
    const chapters = [
      { scenes: [{ title: 'Low Tide', whatChanges: 'Ines signs the first certificate' }] },
      { scenes: [{ title: 'Twice', whatChanges: 'the same man comes out of the ice' }] },
      { scenes: [{ title: 'Later', whatChanges: 'not yet' }] }
    ]
    expect(buildPlannedScenesBlock(chapters, 0)).toBe('')
    const block = buildPlannedScenesBlock(chapters, 2)
    expect(block).toMatch(/SCENES ALREADY PLANNED/)
    expect(block).toMatch(/- ch 1: "Low Tide" — Ines signs the first certificate/)
    expect(block).toMatch(/- ch 2: "Twice" — the same man comes out of the ice/)
    expect(block).not.toMatch(/Later/)
  })

  it("numbers the chapter's events so scene k realises event k", async () => {
    const { buildEventsBlock } = await import('@/composables/useStoryDirector')
    expect(buildEventsBlock({ events: [] }, 3)).toBe('')
    const block = buildEventsBlock(
      { events: ['a happens', 'b happens', 'c happens', 'd happens'] },
      3
    )
    expect(block).toMatch(/EVENT 1: a happens/)
    expect(block).toMatch(/EVENT 3: c happens/)
    expect(block).not.toMatch(/d happens/)
  })
})

describe('interior chapters', () => {
  it('flags a chapter whose events happen only inside a head', async () => {
    const { findInteriorChapters, isInteriorEvent } = await import('@/composables/useStoryDirector')
    expect(isInteriorEvent('Nesrin gazes at the stars, reflecting on her dilemma.')).toBe(true)
    expect(isInteriorEvent('She gathers strength for the confrontation.')).toBe(true)
    expect(isInteriorEvent('Halim short-weighs her salt in front of the town.')).toBe(false)
    const chapters = [
      {
        events: [
          'Halim hands her the ledger',
          'the mule goes lame at the ford',
          'a stranger buys the last sack'
        ]
      },
      {
        events: [
          'Nesrin reflects on her choices',
          'She gathers strength for the confrontation',
          'She vows to meet Halim'
        ]
      },
      { events: ['She considers the offer', 'Halim signs the note'] },
      { events: [] }
    ]
    // Chapter 2 is all interior; chapter 3 is half — both need re-planning.
    expect(findInteriorChapters(chapters)).toEqual([1, 2])
  })
})
