import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractDialogueLines,
  splitParagraphs,
  dialogueDistinctRatio,
  pacingScoreFromFiller,
  fillerParagraphs,
  buildVoicePrompt,
  MIN_VOICE_LINES,
  verifyContradictions,
  bibleNames
} from '@/composables/criticIsolation'

vi.mock('@/composables/useAiService', () => ({ aiGenerateJson: vi.fn() }))
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    activeWorkspaceType: 'creative',
    getActivePrompts: vi.fn(() => ({ critic: 'You are a story critic.' }))
  }))
}))

const lines = (n, same = false) =>
  Array.from({ length: n }, (_, i) =>
    same
      ? // Narration varies on purpose: identical paragraphs trip `detectRepetition`,
        // which short-circuits the critic before any dimension is judged.
        `"We should keep moving," said ${['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'][i % 8]}, ${['eyeing the dunes', 'shifting the pack', 'counting coins', 'pulling a scarf tight', 'watching the well', 'kicking a stone', 'rubbing salt from a palm', 'squinting east'][i % 8]}.`
      : `"Line number ${i} is mine," said speaker ${i}.`
  ).join('\n\n')

describe('criticIsolation helpers', () => {
  it('extracts dialogue in order, straight and curly quotes', () => {
    expect(extractDialogueLines('He said "go now." She said “not yet.”')).toEqual([
      'go now.',
      'not yet.'
    ])
  })

  it('splits on blank lines and drops empties', () => {
    expect(splitParagraphs('a\n\n\n b \n\n\nc')).toEqual(['a', 'b', 'c'])
  })

  it('distinct ratio catches verbatim looping, ignoring case and punctuation', () => {
    expect(dialogueDistinctRatio(['We go.', 'we go', 'Stay.', 'WE GO!'])).toBe(0.5)
    expect(dialogueDistinctRatio([])).toBe(1)
  })

  it('one filler paragraph passes the floor of 7, two fail it', () => {
    expect(pacingScoreFromFiller(0)).toBe(8)
    expect(pacingScoreFromFiller(1)).toBe(7)
    expect(pacingScoreFromFiller(2)).toBe(5)
    expect(pacingScoreFromFiller(9)).toBe(1)
  })

  it('filler paragraphs are reported 1-based', () => {
    expect(fillerParagraphs(['ADVANCES', 'FILLER', 'ADVANCES', 'FILLER'])).toEqual([2, 4])
    expect(fillerParagraphs(null)).toEqual([])
  })

  it('the voice prompt carries the dialogue and nothing of the narration', () => {
    const draft = 'The light lay flat across the salt.\n\n"Go," said Nesrin.\n\n"Stay," said Halim.'
    const prompt = buildVoicePrompt({
      lines: extractDialogueLines(draft),
      storyBible: 'Nesrin: terse.',
      charactersPresent: ['Nesrin', 'Halim'],
      rubric: 'voice: 1 = identical'
    })
    expect(prompt).toContain('1. "Go,"')
    expect(prompt).not.toContain('The light lay flat')
  })
})

describe('continuity evidence is verified by code', () => {
  const facts = ['Ch1: Halim is alive and leading a caravan along the Salt Road']
  const draft = 'Nesrin walked on. Halim had been dead for two years by then. The wind rose.'

  it('keeps a contradiction whose sentence and fact are both really there', () => {
    const v = verifyContradictions(
      [{ sentence: 'Halim had been dead for two years by then.', fact: facts[0] }],
      draft,
      facts
    )
    expect(v).toHaveLength(1)
  })

  it('tolerates punctuation noise in the quote — the one miss in §20 was "Hal,im"', () => {
    const v = verifyContradictions(
      [
        {
          sentence: 'Halim had been dead for two years by then',
          fact: 'Ch1: Hal,im is alive and leading a caravan'
        }
      ],
      draft,
      facts
    )
    expect(v).toHaveLength(1)
  })

  it('drops a claim whose sentence is not in the scene, or whose fact is not in the bible', () => {
    expect(
      verifyContradictions(
        [{ sentence: 'Halim rose from his grave at noon.', fact: facts[0] }],
        draft,
        facts
      )
    ).toHaveLength(0)
    expect(
      verifyContradictions(
        [
          {
            sentence: 'Halim had been dead for two years by then.',
            fact: 'Ch2: Halim owes Nesrin a debt'
          }
        ],
        draft,
        facts
      )
    ).toHaveLength(0)
  })

  it('bible names skip chapter tags and pronouns', () => {
    expect(bibleNames('Ch1: Halim is alive.\nCh2: She meets Nesrin.')).toEqual(['Halim', 'Nesrin'])
  })
})

describe('focused critic routes voice and pacing through isolated input', () => {
  let aiGenerateJson
  let critic

  beforeEach(async () => {
    vi.clearAllMocks()
    ;({ aiGenerateJson } = await import('@/composables/useAiService'))
    const mod = await import('@/composables/useStoryCritic')
    mod.setFocusedCritic(true)
    critic = mod.useStoryCritic()
  })
  afterEach(async () => {
    const mod = await import('@/composables/useStoryCritic')
    mod.setFocusedCritic(false)
  })

  function answer({ pacingLabels = null, voice = 8, other = 8 } = {}) {
    vi.mocked(aiGenerateJson).mockImplementation(async (_prompt, _system, opts) => {
      if (opts.schemaName === 'focused_pacing_paragraphs') {
        const n = opts.schema.properties.labels.minItems
        return { labels: pacingLabels || Array(n).fill('ADVANCES') }
      }
      if (opts.schemaName === 'focused_voice_isolated') return { score: voice }
      return { score: other }
    })
  }

  const evaluate = (draft) =>
    critic.evaluateScene({
      draft,
      sceneBrief: {
        title: 't',
        emotionalGoal: 'dread',
        charactersPresent: ['A', 'B'],
        whatChanges: 'x'
      },
      storyBible: 'A: a character.\nB: another character.',
      chapterLog: ''
    })

  it('names the filler paragraphs and fails pacing at two', async () => {
    const draft = lines(8)
    answer({
      pacingLabels: [
        'ADVANCES',
        'FILLER',
        'ADVANCES',
        'ADVANCES',
        'FILLER',
        'ADVANCES',
        'ADVANCES',
        'ADVANCES'
      ]
    })
    const v = await evaluate(draft)
    expect(v.dimensionScores.pacing).toBe(5)
    expect(v.pass).toBe(false)
    expect(v.issues.find((i) => i.type === 'pacing').description).toMatch(/Paragraphs 2, 5/)
  })

  it('skips voice below the minimum dialogue, instead of scoring a sample too small', async () => {
    answer()
    const v = await evaluate(lines(MIN_VOICE_LINES - 1))
    expect(v.dimensionScores.voice).toBeNull()
    const names = vi.mocked(aiGenerateJson).mock.calls.map((c) => c[2].schemaName)
    expect(names).not.toContain('focused_voice_isolated')
  })

  it('fails verbatim looping dialogue without asking a model', async () => {
    answer()
    const v = await evaluate(lines(8, true))
    expect(v.dimensionScores.voice).toBe(2)
    const names = vi.mocked(aiGenerateJson).mock.calls.map((c) => c[2].schemaName)
    expect(names).not.toContain('focused_voice_isolated')
  })

  it('every focused judge call turns the prose repeat penalty off', async () => {
    // With the provider default (1.15) the pacing labels drifted to FILLER down
    // the list: clean scenes failing pacing 7/30 with it, 1/30 without (§20).
    answer()
    await evaluate(lines(8))
    const calls = vi.mocked(aiGenerateJson).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c[2].repeatPenalty).toBe(1)
  })

  it('continuity sees only the sentences that name someone in the bible, and drops claims it cannot verify', async () => {
    vi.mocked(aiGenerateJson).mockImplementation(async (_p, _s, opts) => {
      if (opts.schemaName === 'focused_continuity_facts')
        return {
          contradictions: [
            { sentence: 'A had been dead for two years by then.', fact: 'A: a character.' },
            { sentence: 'A invented this line entirely.', fact: 'A: a character.' }
          ]
        }
      if (opts.schemaName === 'focused_pacing_paragraphs')
        return { labels: Array(opts.schema.properties.labels.minItems).fill('ADVANCES') }
      return { score: 8 }
    })
    // "Abe" is the only name in this bible, so only the sentence naming him is sent.
    const v = await critic.evaluateScene({
      draft: `The road was long and nobody spoke of it.

Abe had been dead for two years by then.

${lines(8)}`,
      sceneBrief: { title: 't', emotionalGoal: 'dread', charactersPresent: ['Abe'] },
      storyBible: 'Abe: alive and well.',
      chapterLog: ''
    })
    const call = vi
      .mocked(aiGenerateJson)
      .mock.calls.find((c) => c[2].schemaName === 'focused_continuity_facts')
    expect(call[0]).toContain('Abe had been dead')
    expect(call[0]).not.toContain('The road was long')
    // neither mocked claim quotes the real draft + bible exactly, so nothing verifies
    expect(v.dimensionScores.continuity).toBe(8)
  })

  it('a verified contradiction fails continuity and quotes both sides', async () => {
    vi.mocked(aiGenerateJson).mockImplementation(async (_p, _s, opts) => {
      if (opts.schemaName === 'focused_continuity_facts')
        return {
          contradictions: [
            { sentence: 'Abe had been dead for two years by then.', fact: 'Abe: alive and well.' }
          ]
        }
      if (opts.schemaName === 'focused_pacing_paragraphs')
        return { labels: Array(opts.schema.properties.labels.minItems).fill('ADVANCES') }
      return { score: 8 }
    })
    const v = await critic.evaluateScene({
      draft: `Abe had been dead for two years by then.

${lines(8)}`,
      sceneBrief: { title: 't', emotionalGoal: 'dread', charactersPresent: ['Abe'] },
      storyBible: 'Abe: alive and well.',
      chapterLog: ''
    })
    expect(v.dimensionScores.continuity).toBe(3)
    expect(v.pass).toBe(false)
    expect(v.issues.find((i) => i.type === 'continuity').description).toMatch(
      /contradicts "Abe: alive/
    )
  })

  it('sends the voice judge the dialogue only', async () => {
    answer()
    await evaluate(`Narration nobody should judge for voice.\n\n${lines(8)}`)
    const call = vi
      .mocked(aiGenerateJson)
      .mock.calls.find((c) => c[2].schemaName === 'focused_voice_isolated')
    expect(call[0]).not.toContain('Narration nobody should judge')
  })
})
