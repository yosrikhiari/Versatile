import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import {
  openingOf,
  imagePairs,
  reusedImages,
  bookOpeningReuse,
  buildRecentOpeningsContext,
  RECENT_OPENINGS_MAX
} from '@/services/generation/openingReuse'
import { fitSceneContext } from '@/services/ai/contextBudget'
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

describe('buildRecentOpeningsContext', () => {
  const scene = (n, prose) => ({ sceneNumber: n, prose })

  it('lists the nearest written openings in story order, without the scene itself', () => {
    const written = [scene(1, S6), null, scene(3, S7), scene(4, 'mine'), scene(5, S14)]
    const block = buildRecentOpeningsContext(written, 3)
    expect(block).toBe(`- Scene 1: "${S6}"\n- Scene 3: "${S7}"\n- Scene 5: "${S14}"`)
  })

  it('keeps the nearest ones when there are more than the cap, either side', () => {
    const written = Array.from({ length: 20 }, (_, i) => scene(i + 1, `${FRESH} ${i}`))
    const block = buildRecentOpeningsContext(written, 10)
    const shown = [...block.matchAll(/- Scene (\d+)/g)].map((m) => Number(m[1]))
    expect(shown).toHaveLength(RECENT_OPENINGS_MAX)
    expect(shown).toEqual([7, 8, 9, 10, 12, 13, 14, 15])
  })

  it('is empty before anything is written', () => {
    expect(buildRecentOpeningsContext([null, undefined], 0)).toBe('')
  })
})

describe('fitSceneContext: the openings are the first thing to go', () => {
  const prose = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
  it('drops the openings before the chapter log', () => {
    const r = fitSceneContext({
      // contextTokens 3000 floors the budget at 1000: one of the two must go.
      storyContract: prose(50),
      logSummary: prose(300),
      recentOpenings: prose(300),
      contextTokens: 3000
    })
    expect(r.logSummary).not.toBe('')
    expect(r.recentOpenings).toBe('')
  })

  it('passes them through when there is room', () => {
    expect(fitSceneContext({ recentOpenings: '- Scene 1: "x"' }).recentOpenings).toBe(
      '- Scene 1: "x"'
    )
  })
})

describe('draftAttempt shows the writer the nearby openings', () => {
  function gate(written, prose = FRESH) {
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
      storyBibleStore: {},
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
    { sceneNumber: 1, prose: S6 },
    { sceneNumber: 2, prose: S7 }
  ]

  it('passes the openings of the written scenes to the writer', async () => {
    const { g, writeSceneStructured } = gate(written)
    await g.draftAttempt(args())
    const { recentOpenings } = writeSceneStructured.mock.calls[0][0]
    expect(recentOpenings).toContain(`- Scene 1: "${S6}"`)
    expect(recentOpenings).toContain(`- Scene 2: "${S7}"`)
  })

  it('sends none for the second section of a long scene, which opens nothing', async () => {
    const { g, writeSceneStructured } = gate(written)
    await g.draftAttempt(args({ title: 'T', sceneNumber: 3, sectionIndex: 2, totalSections: 3 }))
    expect(writeSceneStructured.mock.calls[0][0].recentOpenings).toBeUndefined()
  })

  it('sends none for the first scene of a book', async () => {
    const { g, writeSceneStructured } = gate([])
    await g.draftAttempt(args())
    expect(writeSceneStructured.mock.calls[0][0].recentOpenings).toBeUndefined()
  })

  it('removes an opening the writer copied from the ones it was shown', async () => {
    const { g, record } = gate(written, `${S7}\n\nThe bell rang twice across the empty square.`)
    const out = await g.draftAttempt(args())
    expect(out.prose).toBe('The bell rang twice across the empty square.')
    expect(record).toHaveBeenCalledWith(
      'copied_context',
      expect.objectContaining({ sceneIndex: 2 })
    )
  })
})
