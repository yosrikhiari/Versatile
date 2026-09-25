import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  extractDialogueLines,
  splitParagraphs,
  dialogueDistinctRatio,
  pacingScoreFromFiller,
  fillerParagraphs,
  buildVoicePrompt,
  MIN_VOICE_LINES,
  pacingVote,
  unreverseParagraphNumbers,
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

describe('pacing vote', () => {
  it('maps reversed paragraph numbers back to reading order', () => {
    // 5 paragraphs shown reversed: reversed #1 is original #5
    expect(unreverseParagraphNumbers([1, 4], 5)).toEqual([2, 5])
  })

  it('fails only with two forward flags and at least one confirmed', () => {
    expect(pacingVote([2, 5], [5]).score).toBe(5)
    expect(pacingVote([2, 5], []).score).toBe(7)
    expect(pacingVote([2, 5], null).score).toBe(7)
    expect(pacingVote([3], [3]).score).toBe(7)
    expect(pacingVote([], null).score).toBe(8)
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

  function answer({ pacingLabels = null, reversedLabels = null, voice = 8, other = 8 } = {}) {
    vi.mocked(aiGenerateJson).mockImplementation(async (_prompt, _system, opts) => {
      if (opts.schemaName === 'focused_pacing_paragraphs') {
        const n = opts.schema.properties.labels.minItems
        return { labels: pacingLabels || Array(n).fill('ADVANCES') }
      }
      // The confirming pass sees the paragraphs reversed; by default it agrees.
      if (opts.schemaName === 'focused_pacing_paragraphs_reversed') {
        const n = opts.schema.properties.labels.minItems
        const labels = reversedLabels || pacingLabels || Array(n).fill('ADVANCES')
        return { labels: reversedLabels ? labels : [...labels].reverse() }
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

  it('names the filler paragraphs and scores pacing under the floor at two', async () => {
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
    expect(v.issues.find((i) => i.type === 'pacing').description).toMatch(/Paragraphs 2, 5/)
    // Reported, not failing: pacing is advisory in the focused gate (§31).
    expect(v.pass).toBe(true)
    expect(v.advisoryBelowFloor).toEqual([{ name: 'pacing', score: 5 }])
  })

  it('does not fail pacing when the reversed pass confirms none of the flags', async () => {
    const flags = [
      'ADVANCES',
      'FILLER',
      'ADVANCES',
      'ADVANCES',
      'FILLER',
      'ADVANCES',
      'ADVANCES',
      'ADVANCES'
    ]
    answer({ pacingLabels: flags, reversedLabels: Array(8).fill('ADVANCES') })
    const v = await evaluate(lines(8))
    expect(v.dimensionScores.pacing).toBe(7)
  })

  it('asks the confirming pass only when the forward pass would fail', async () => {
    answer()
    await evaluate(lines(8))
    const names = vi.mocked(aiGenerateJson).mock.calls.map((c) => c[2].schemaName)
    expect(names).not.toContain('focused_pacing_paragraphs_reversed')
  })

  it('show_tell does not see paragraphs pacing already failed as filler', async () => {
    const draft = [
      'Ada ran for the gate.',
      'Nothing about the hour was remarkable, and the light was ordinary.',
      'Bo caught her arm.',
      'The dust settled the way dust settles.',
      'She pulled free.'
    ].join('\n\n')
    answer({ pacingLabels: ['ADVANCES', 'FILLER', 'ADVANCES', 'FILLER', 'ADVANCES'] })
    await evaluate(draft)
    const showTell = vi
      .mocked(aiGenerateJson)
      .mock.calls.find((c) => c[2].schemaName === 'focused_show_tell')
    expect(showTell[0]).toContain('Bo caught her arm.')
    expect(showTell[0]).not.toContain('Nothing about the hour was remarkable')
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

  // Continuity by claims (§31): extract what each sentence states or assumes,
  // match claims against the facts, confirm each (sentence, fact) once.
  function continuityModel({
    claims,
    hits,
    contradicts = true,
    direct = [],
    bothCanBeTrue = false
  }) {
    vi.mocked(aiGenerateJson).mockImplementation(async (_p, _s, opts) => {
      if (opts.schemaName === 'focused_continuity_claims') return { claims }
      if (opts.schemaName === 'focused_continuity_matches') return { hits }
      if (opts.schemaName === 'focused_continuity_facts') return { contradictions: direct }
      if (opts.schemaName === 'confirm_fact_contradiction') return { contradicts }
      if (opts.schemaName === 'confirm_contradiction') return { bothCanBeTrue }
      if (opts.schemaName === 'focused_pacing_paragraphs')
        return { labels: Array(opts.schema.properties.labels.minItems).fill('ADVANCES') }
      return { score: 8 }
    })
  }
  const confirmCalls = () =>
    vi
      .mocked(aiGenerateJson)
      .mock.calls.filter((c) => c[2].schemaName === 'confirm_fact_contradiction')
  const presupposed = `The road was long and nobody spoke of it.

It had not been warm since the day Abe died.

${lines(8)}`
  const scene = (draft) =>
    critic.evaluateScene({
      draft,
      sceneBrief: { title: 't', emotionalGoal: 'dread', charactersPresent: ['Abe'] },
      storyBible: 'Abe: alive and well.',
      chapterLog: ''
    })

  it('continuity sees only the sentences that name someone in the bible, and drops a hit on a fact that is not in it', async () => {
    continuityModel({
      claims: [{ s: 1, about: 'Abe', claim: 'Abe is dead' }],
      hits: [{ claim: 1, fact: 'Abe: a character invented by the model.' }]
    })
    const v = await scene(presupposed)
    const call = vi
      .mocked(aiGenerateJson)
      .mock.calls.find((c) => c[2].schemaName === 'focused_continuity_claims')
    // "Abe" is the only name in this bible, so only the sentence naming him is sent.
    expect(call[0]).toContain('[1] It had not been warm since the day Abe died.')
    expect(call[0]).not.toContain('The road was long')
    expect(confirmCalls()).toHaveLength(0)
    expect(v.dimensionScores.continuity).toBe(8)
  })

  it('a confirmed contradiction the sentence only assumes fails continuity and quotes both sides', async () => {
    continuityModel({
      claims: [{ s: 1, about: 'Abe', claim: 'Abe is dead' }],
      hits: [{ claim: 1, fact: 'Abe: alive and well.' }]
    })
    const v = await scene(presupposed)
    expect(confirmCalls()[0][0]).toMatch(/What that sentence says or assumes: Abe is dead/)
    expect(v.dimensionScores.continuity).toBe(3)
    expect(v.pass).toBe(false)
    const issue = v.issues.find((i) => i.type === 'continuity')
    expect(issue.description).toMatch(/contradicts "Abe: alive/)
    // The evidence is the real sentence, so the in-place repair can find it.
    expect(issue.evidence).toEqual([
      { sentence: 'It had not been warm since the day Abe died.', fact: 'Abe: alive and well.' }
    ])
  })

  it('drops a match the confirming question rejects', async () => {
    continuityModel({
      claims: [{ s: 1, about: 'Abe', claim: 'Abe is dead' }],
      hits: [{ claim: 1, fact: 'Abe: alive and well.' }],
      contradicts: false
    })
    expect((await scene(presupposed)).dimensionScores.continuity).toBe(8)
  })

  it('confirms each (sentence, fact) pair once, however many claims it yields', async () => {
    continuityModel({
      claims: [
        { s: 1, about: 'Abe', claim: 'Abe is dead' },
        { s: 1, about: 'Abe', claim: 'Abe died on a cold day' }
      ],
      hits: [
        { claim: 1, fact: 'Abe: alive and well.' },
        { claim: 2, fact: 'Abe: alive and well.' }
      ]
    })
    await scene(presupposed)
    expect(confirmCalls()).toHaveLength(1)
  })

  it('keeps what the direct check confirms when the claims check finds nothing', async () => {
    // Planted "doubled oxygen rations": the direct check caught it, the
    // claims check did not (§31). The two are merged.
    continuityModel({
      claims: [],
      hits: [],
      direct: [
        { sentence: 'It had not been warm since the day Abe died.', fact: 'Abe: alive and well.' }
      ]
    })
    const v = await scene(presupposed)
    expect(v.dimensionScores.continuity).toBe(3)
    expect(v.issues.find((i) => i.type === 'continuity').evidence).toHaveLength(1)
  })

  it('does not confirm again, or list twice, a pair the direct check already confirmed', async () => {
    continuityModel({
      claims: [{ s: 1, about: 'Abe', claim: 'Abe is dead' }],
      hits: [{ claim: 1, fact: 'Abe: alive and well.' }],
      direct: [
        { sentence: 'It had not been warm since the day Abe died.', fact: 'Abe: alive and well.' }
      ]
    })
    const v = await scene(presupposed)
    expect(confirmCalls()).toHaveLength(0)
    expect(v.issues.find((i) => i.type === 'continuity').evidence).toHaveLength(1)
  })

  it('judges with the claims check alone when the direct check fails', async () => {
    continuityModel({
      claims: [{ s: 1, about: 'Abe', claim: 'Abe is dead' }],
      hits: [{ claim: 1, fact: 'Abe: alive and well.' }]
    })
    const inner = vi.mocked(aiGenerateJson).getMockImplementation()
    vi.mocked(aiGenerateJson).mockImplementation(async (p, s, opts) => {
      if (opts.schemaName === 'focused_continuity_facts') throw new Error('provider down')
      return inner(p, s, opts)
    })
    expect((await scene(presupposed)).dimensionScores.continuity).toBe(3)
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

describe('the chapter audit, isolated', () => {
  it('checks a scene only against facts from earlier chapters', async () => {
    const { factsBeforeChapter } = await import('@/composables/criticIsolation')
    const ledger = [
      'Ch1: Halim is alive',
      'Ch3: Nesrin reaches the well',
      'Ch9: Halim dies',
      'untagged fact'
    ]
    expect(factsBeforeChapter(ledger, 3)).toEqual(['Ch1: Halim is alive', 'untagged fact'])
    expect(factsBeforeChapter(ledger, null)).toEqual(ledger)
  })

  it('reports in the shape the audit consumes, and points the fix at the right scene', async () => {
    const { contradictionsToReport } = await import('@/composables/criticIsolation')
    const { planConsistencyFixes } = await import('@/composables/generation/context/sceneContext')
    const report = contradictionsToReport(
      [{ sentence: 'Halim had been dead for two years.', fact: 'Ch1: Halim is alive' }],
      ['Nesrin', 'Halim']
    )
    expect(report.characterIssues[0].character).toBe('Halim')
    const scenes = [
      { prose: 'Nesrin walked with Halim.', characters: ['Halim'] },
      { prose: 'Later. Halim had been dead for two years. The wind rose.', characters: ['Nesrin'] },
      { prose: 'Halim laughed at the gate.', characters: ['Halim'] }
    ]
    // The latest scene with Halim is index 2, but the quote is in scene 1.
    expect([...planConsistencyFixes(report, scenes).keys()]).toEqual([1])
  })
})

describe('focused critic default (§24)', () => {
  it('is on when nothing is stored, and only an explicit false turns it off', async () => {
    const { isFocusedCriticEnabled, setFocusedCritic } =
      await import('@/composables/useStoryCritic')
    localStorage.removeItem('versatile_critic_focused')
    expect(isFocusedCriticEnabled()).toBe(true)
    setFocusedCritic(false)
    expect(isFocusedCriticEnabled()).toBe(false)
    setFocusedCritic(true)
    expect(isFocusedCriticEnabled()).toBe(true)
  })
})

describe('repair in place (§25)', () => {
  it('plans a repair only when every failing dimension carries its evidence', async () => {
    const { planRepair } = await import('@/composables/criticIsolation')
    const verdict = {
      dimensionScores: { pacing: 5, continuity: 3, voice: 8 },
      issues: [
        { type: 'pacing', paragraphs: [2, 5] },
        { type: 'continuity', evidence: [{ sentence: 'Abe was dead.', fact: 'Abe: alive' }] }
      ]
    }
    expect(planRepair(verdict, 7)).toEqual({
      cut: [2, 5],
      rewrites: [{ sentence: 'Abe was dead.', fact: 'Abe: alive' }]
    })
    // voice failing: nothing located to repair, so the writer gets it back
    expect(planRepair({ ...verdict, dimensionScores: { pacing: 5, voice: 4 } }, 7)).toBeNull()
    // pacing failing without paragraph numbers (e.g. the combined critic)
    expect(
      planRepair({ dimensionScores: { pacing: 5 }, issues: [{ type: 'pacing' }] }, 7)
    ).toBeNull()
    expect(planRepair({ dimensionScores: { pacing: 8 }, issues: [] }, 7)).toBeNull()
    // An advisory dimension is neither repaired nor allowed to veto the
    // repair of a real failure (§31): emotional_goal has no located fix.
    const withAdvisory = {
      dimensionScores: { continuity: 4, emotional_goal: 5 },
      issues: [
        { type: 'continuity', evidence: [{ sentence: 'Abe was dead.', fact: 'Abe is alive' }] }
      ],
      advisoryDimensions: ['emotional_goal']
    }
    expect(planRepair(withAdvisory, 7)).toEqual({
      cut: [],
      rewrites: [{ sentence: 'Abe was dead.', fact: 'Abe is alive' }]
    })
    expect(planRepair({ ...withAdvisory, advisoryDimensions: [] }, 7)).toBeNull()
  })

  it('cuts paragraphs by the critic numbering and replaces sentences where they stand', async () => {
    const { applyRepair } = await import('@/composables/criticIsolation')
    const prose = 'One.\n\nFiller here.\n\nAbe was dead. Then rain.\n\nFour.'
    expect(
      applyRepair(prose, [2], [{ sentence: 'Abe was dead.', replacement: 'Abe was tired.' }])
    ).toBe('One.\n\nAbe was tired. Then rain.\n\nFour.')
    // an empty replacement deletes the sentence; a paragraph left empty goes too
    expect(
      applyRepair('A.\n\nAbe was dead.', [], [{ sentence: 'Abe was dead.', replacement: '' }])
    ).toBe('A.')
  })
})
