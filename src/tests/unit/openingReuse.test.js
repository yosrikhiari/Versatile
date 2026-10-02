import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import {
  openingOf,
  imagePairs,
  reusedImages,
  bookOpeningReuse,
  nearestWrittenScenes,
  nearbyOpeningReuse,
  describeOpeningReuse,
  NEARBY_OPENINGS
} from '@/services/generation/openingReuse'
import { createSceneGate } from '@/composables/generation/writing/sceneGate'

// Issue #66 / UX-AUDIT #59: the writer opens scene after scene on the same
// image, reworded each time, so §46's six-word check cannot see it.
// Real openings from the 30-scene salt-road corpus.
const S6 =
  'Nesrin knelt beside the dying man, her fingers brushing against his sweat-damp sleeve, the coarse fabric clinging to his skin.'
const S17 =
  'Nesrin knelt beside the mule, her fingers brushing over its flanks where sweat had dried into cracked lines.'
const S7 =
  "She stepped over the dying man's body, her boots sinking into the damp earth where he had collapsed."
const S14 =
  'Nesrin crouched beside the well, knuckles pressed into damp earth, the scent of wet stone rising from the cracks.'
const FRESH =
  'The bell rang twice across the empty square, and no one came to answer it, not even the boy.'
const NAMES = ['Nesrin', 'Halim']

describe('openingOf', () => {
  it('takes the first sentence once it has enough words', () => {
    const prose = `${S6} He did not wake. The night went on.`
    expect(openingOf(prose)).toBe(S6)
  })

  it('runs past a short first sentence and stops at 40 words', () => {
    const short = 'Dawn. ' + Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ')
    const words = openingOf(short).split(' ')
    expect(words.length).toBe(40)
    expect(words[0]).toBe('Dawn.')
  })

  it('reads through markup', () => {
    expect(openingOf('<p>The bell rang.</p>')).toBe('The bell rang.')
  })
})

describe('imagePairs', () => {
  it('keeps the content words of the image and drops names and stopwords', () => {
    const pairs = imagePairs(S7, NAMES)
    expect(pairs.has('boot sink')).toBe(true)
    expect(pairs.has('damp earth')).toBe(true)
    expect([...pairs].some((p) => p.includes('nesrin'))).toBe(false)
  })

  it('meets a reworded image through the stem', () => {
    // "brushing against" / "brushing over": the pair survives the rewording.
    expect([...imagePairs(S6, NAMES)].filter((p) => imagePairs(S17, NAMES).has(p))).toContain(
      'finger brush'
    )
  })
})

describe('reusedImages', () => {
  it('names the earlier opening and the image it shares', () => {
    expect(reusedImages(S14, [S6, S7], NAMES)).toEqual([{ earlier: 1, shared: ['damp earth'] }])
  })

  it('finds nothing in a fresh opening', () => {
    expect(reusedImages(FRESH, [S6, S7, S14, S17], NAMES)).toEqual([])
  })
})

describe('bookOpeningReuse', () => {
  it('counts the openings that reuse an earlier one', () => {
    const r = bookOpeningReuse([S6, S7, S14, FRESH, S17], NAMES)
    // S7 (dying man), S14 (damp earth), S17 (finger brush); FRESH reuses nothing.
    expect(r.reusing).toBe(3)
    expect(r.share).toBe(0.75)
    expect(r.repeated.map(([p]) => p)).toEqual(
      expect.arrayContaining(['damp earth', 'finger brush'])
    )
  })
})

describe('nearestWrittenScenes', () => {
  const scene = (n, prose) => ({ sceneNumber: n, prose })

  it('takes the nearest written scenes either side, in story order, never the scene itself', () => {
    const written = Array.from({ length: 20 }, (_, i) => scene(i + 1, `${FRESH} ${i}`))
    const near = nearestWrittenScenes(written, 9).map((s) => s.sceneNumber)
    expect(near).toHaveLength(NEARBY_OPENINGS)
    expect(near).toEqual([6, 7, 8, 9, 11, 12, 13, 14]) // four either side of scene 10
  })

  it('skips holes and empty scenes', () => {
    const near = nearestWrittenScenes([scene(1, S6), null, scene(3, ' '), scene(4, S7)], 1)
    expect(near.map((s) => s.sceneNumber)).toEqual([1, 4])
  })
})

describe('nearbyOpeningReuse', () => {
  const written = [{ sceneNumber: 1, prose: S6 }, { sceneNumber: 2, prose: S7 }, null]

  it('names the nearby scene and the image an opening reuses', () => {
    expect(nearbyOpeningReuse(S14, written, 2, NAMES)).toEqual([
      { sceneNumber: 2, title: '', shared: ['damp earth'] }
    ])
  })

  it('says nothing about a fresh opening', () => {
    expect(nearbyOpeningReuse(FRESH, written, 2, NAMES)).toEqual([])
  })

  it('carries the earlier scene title', () => {
    const titled = [{ sceneNumber: 1, title: 'Ilse walks the breakwater', prose: S7 }]
    expect(nearbyOpeningReuse(S14, titled, 1, NAMES)[0].title).toBe('Ilse walks the breakwater')
  })

  it('does not compare with scenes beyond the nearby window', () => {
    const far = [
      { sceneNumber: 1, prose: S7 },
      ...Array.from({ length: 10 }, () => ({ prose: FRESH }))
    ]
    expect(nearbyOpeningReuse(S14, far, 11, NAMES)).toEqual([])
  })
})

// #105: on the #68 run the detail said "scene 1", the run's first scene, which
// in the continued sample book read as the book's first scene.
describe('describeOpeningReuse names the scene by title', () => {
  it('uses the title', () => {
    expect(
      describeOpeningReuse([
        { sceneNumber: 1, title: 'Ilse walks the breakwater', shared: ['ston step'] }
      ])
    ).toBe('"Ilse walks the breakwater" (ston step)')
  })

  it('falls back to the number for an untitled scene, and joins several', () => {
    expect(
      describeOpeningReuse([
        { sceneNumber: 1, title: '', shared: ['ston step'] },
        { sceneNumber: 2, title: 'Tomas follows', shared: ['heel caught', 'loose plank'] }
      ])
    ).toBe('scene 1 (ston step); "Tomas follows" (heel caught, loose plank)')
  })
})

describe('draftAttempt reports a reused opening and changes nothing (#66)', () => {
  function gate(written, prose) {
    const writeSceneStructured = vi.fn(async () => ({ prose, structured: {} }))
    const record = vi.fn()
    const g = createSceneGate({
      currentTaskId: 't',
      abort: { signal: () => undefined },
      actLog: { appendThought: vi.fn(), addPhase: vi.fn(), updatePhase: vi.fn() },
      autoMode: ref(false),
      critic: {},
      evalUnavailableCount: ref(0),
      gate: async () => {},
      liveDraft: { reset: vi.fn() },
      promptAdjuster: {},
      rejectedPatterns: ref([]),
      runHealth: { record },
      scenePlan: ref([]),
      settings: {},
      spineContext: ref(''),
      storyBibleStore: { characters: [{ name: 'Nesrin' }] },
      throwIfAborted: () => {},
      workspaceType: { value: 'novel' },
      writeParams: ref({}),
      writer: { writeSceneStructured },
      writtenScenes: ref(written),
      currentSceneResult: ref(null),
      persistCritiqueEval: () => {}
    })
    return { g, writeSceneStructured, record }
  }
  const args = (scene = { title: 'T', sceneNumber: 3 }) => ({
    scene,
    sceneIndex: 2,
    scenePhase: 0,
    storyArc: null,
    chapterLog: '',
    storyBible: '',
    storyContract: '',
    sceneEntitiesJson: '',
    embeddingContext: '',
    attempt: 0,
    maxAttempts: 1
  })
  const written = [
    { sceneNumber: 1, title: 'The dying man', prose: S6 },
    { sceneNumber: 2, title: 'Over the body', prose: S7 }
  ]

  it('records opening_reuse with the scene and the image, and keeps the prose', async () => {
    const { g, record } = gate(written, S14)
    const out = await g.draftAttempt(args())
    expect(out.prose).toBe(S14)
    expect(record).toHaveBeenCalledWith('opening_reuse', {
      stage: 'writer',
      sceneIndex: 2,
      detail: 'opens on an image a nearby scene already opened on: "Over the body" (damp earth)'
    })
  })

  it('records nothing for a fresh opening', async () => {
    const { g, record } = gate(written, FRESH)
    await g.draftAttempt(args())
    expect(record).not.toHaveBeenCalled()
  })

  it('does not judge the second section of a long scene, which opens nothing', async () => {
    const { g, record } = gate(written, S14)
    await g.draftAttempt(args({ title: 'T', sceneNumber: 3, sectionIndex: 2, totalSections: 3 }))
    expect(record).not.toHaveBeenCalled()
  })

  it('shows the writer none of the openings (they made reuse worse, §49)', async () => {
    const { g, writeSceneStructured } = gate(written, FRESH)
    await g.draftAttempt(args())
    const prompt = JSON.stringify(writeSceneStructured.mock.calls[0][0])
    expect(prompt).not.toContain('boots sinking')
  })
})
