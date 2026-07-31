import { describe, it, expect } from 'vitest'
import {
  surveyManuscript,
  briefForScene,
  neighbourContext,
  describeReport,
  emptyReport,
  SHORT_SCENE_WORDS
} from '@/composables/generation/continuation/plan'
import { mergeChunkProse } from '@/composables/generation/sceneChunker'
import { sessionConfigForRun, SessionBudget } from '@/services/aiProviderBudget'
import { isFatalRunError, isConfigurationError } from '@/composables/generation/lifecycle/fatal'
import { SessionBudgetExceededError } from '@/services/aiProviderBudget'
import { isProviderUsable } from '@/config/modelRouting'

function section(id, title, order, summary = '') {
  return { id, title, order, summary }
}
function sub(id, sectionId, title, order, content = '', extra = {}) {
  return { id, sectionId, title, order, content, description: '', ...extra }
}

describe('surveyManuscript', () => {
  it('flattens chapters into reading order regardless of insertion order', () => {
    const sections = [section('b', 'Two', 1), section('a', 'One', 0)]
    const subs = [
      sub('a2', 'a', 'Scene A2', 1),
      sub('b1', 'b', 'Scene B1', 0),
      sub('a1', 'a', 'Scene A1', 0)
    ]
    const survey = surveyManuscript(sections, subs)
    expect(survey.scenes.map((s) => s.title)).toEqual(['Scene A1', 'Scene A2', 'Scene B1'])
    expect(survey.scenes.map((s) => s.index)).toEqual([0, 1, 2])
  })

  it('separates unwritten scenes from written ones', () => {
    const sections = [section('a', 'One', 0)]
    const subs = [
      sub('s1', 'a', 'Written', 0, '<p>' + 'word '.repeat(500) + '</p>'),
      sub('s2', 'a', 'Empty', 1, ''),
      sub('s3', 'a', 'Also empty', 2, '   ')
    ]
    const survey = surveyManuscript(sections, subs)
    expect(survey.written.map((s) => s.title)).toEqual(['Written'])
    expect(survey.unwritten.map((s) => s.title)).toEqual(['Empty', 'Also empty'])
  })

  // This is the exact state a run left behind: every subsection marked
  // `generated` with no words in it. A survey that trusted contentStatus would
  // report the book as finished.
  it('counts a scene marked generated but holding no prose as unwritten', () => {
    const survey = surveyManuscript(
      [section('a', 'One', 0)],
      [sub('s1', 'a', 'Ghost', 0, '', { contentStatus: 'generated', wordCount: 0 })]
    )
    expect(survey.unwritten).toHaveLength(1)
    expect(survey.written).toHaveLength(0)
  })

  it('flags written-but-stub scenes as short', () => {
    const survey = surveyManuscript(
      [section('a', 'One', 0)],
      [
        sub('s1', 'a', 'Stub', 0, 'a few words only'),
        sub('s2', 'a', 'Real', 1, 'word '.repeat(SHORT_SCENE_WORDS + 10))
      ]
    )
    expect(survey.short.map((s) => s.title)).toEqual(['Stub'])
  })
})

describe('briefForScene', () => {
  const scene = {
    subsectionId: 's1',
    sceneNumber: 3,
    title: 'The Gate',
    brief: 'Kaelen bargains for passage',
    chapterTitle: 'Chapter 2'
  }

  it('prefers the checkpointed plan when one matches the subsection', () => {
    const planned = { subsectionId: 's1', emotionalGoal: 'dread', whatChanges: 'he loses the key' }
    const brief = briefForScene(scene, [planned], 1200)
    expect(brief.emotionalGoal).toBe('dread')
    expect(brief.estimatedWords).toBe(1200)
  })

  it('reconstructs from the manuscript when no plan survives', () => {
    const brief = briefForScene(scene, null, 900)
    expect(brief.goal).toBe('Kaelen bargains for passage')
    expect(brief.estimatedWords).toBe(900)
    // The writer switches prompt shape on `emotionalGoal !== undefined`; claiming
    // a structured brief we do not have would send empty fields as instructions.
    expect(brief.emotionalGoal).toBeUndefined()
  })
})

describe('neighbourContext', () => {
  const survey = surveyManuscript(
    [section('a', 'One', 0)],
    [
      sub('s1', 'a', 'First', 0, '<p>The gate closed behind him.</p>'),
      sub('s2', 'a', 'Second', 1, ''),
      sub('s3', 'a', 'Third', 2, '')
    ]
  )

  it('supplies preceding prose as canon', () => {
    const ctx = neighbourContext(survey, 1)
    expect(ctx).toContain('The gate closed behind him.')
    expect(ctx).toContain('canon')
  })

  it('is empty at the start of a manuscript', () => {
    expect(neighbourContext(survey, 0)).toBe('')
  })

  it('skips unwritten neighbours rather than emitting blanks', () => {
    expect(neighbourContext(survey, 2)).toContain('The gate closed behind him.')
  })
})

describe('sessionConfigForRun', () => {
  it('scales with the requested structure instead of a fixed ceiling', () => {
    const small = sessionConfigForRun({ chapters: 1, scenes: 3 })
    const novel = sessionConfigForRun({ chapters: 100, scenes: 300 })
    expect(novel.hardCapCalls).toBeGreaterThan(small.hardCapCalls * 50)
    // The run that failed: 100 chapters x 3 scenes needs far more than the old
    // flat 100-call / 100k-token ceiling.
    expect(novel.hardCapCalls).toBeGreaterThan(1000)
    expect(novel.hardCapTokens).toBeGreaterThan(1_000_000)
  })

  it('does not impose a spend ceiling on local inference', () => {
    const local = sessionConfigForRun({ chapters: 10, scenes: 30, localProvider: true })
    expect(local.hardCapCost).toBe(Infinity)

    const budget = new SessionBudget(local)
    budget.record('ollama', 5_000_000, 0)
    // Tokens still bound a runaway; cost never bites when there is none.
    expect(budget.check().reason).not.toMatch(/cost/i)
  })

  it('resizes an existing budget in place and clears its counters', () => {
    const budget = new SessionBudget()
    budget.record('ollama', 99_000, 0)
    expect(budget.check().allowed).toBe(true)

    budget.configureForRun({ chapters: 100, scenes: 300, localProvider: true })
    expect(budget.tokens).toBe(0)
    expect(budget.callCount).toBe(0)
    expect(budget.check().allowed).toBe(true)
  })
})

describe('isFatalRunError', () => {
  it('treats a spent budget and a cancel as run-ending, not scene-ending', () => {
    expect(isFatalRunError(new SessionBudgetExceededError('hard cap'))).toBe(true)
    const abort = new Error('Generation cancelled')
    abort.name = 'AbortError'
    expect(isFatalRunError(abort)).toBe(true)
  })

  it('leaves an ordinary scene failure degradable', () => {
    expect(isFatalRunError(new Error('model returned malformed JSON'))).toBe(false)
  })

  // The failure that actually emptied the book: a provider with no key fails
  // every scene identically, so retrying and carrying on just buries the reason.
  it('treats a missing API key as a configuration failure, not a flaky scene', () => {
    const err = new Error(
      'anthropic API key not configured. Please add it in Settings > AI Providers.'
    )
    expect(isConfigurationError(err)).toBe(true)
    expect(isFatalRunError(err)).toBe(true)
  })
})

describe('isProviderUsable', () => {
  it('always allows the local provider, which needs no credential', () => {
    expect(isProviderUsable('ollama')).toBe(true)
  })

  it('rejects a hosted provider with no key stored', () => {
    localStorage.removeItem('versatile_api_key_anthropic')
    expect(isProviderUsable('anthropic')).toBe(false)
  })

  it('accepts a hosted provider once a key exists', () => {
    localStorage.setItem('versatile_api_key_anthropic', 'encrypted-blob')
    expect(isProviderUsable('anthropic')).toBe(true)
    localStorage.removeItem('versatile_api_key_anthropic')
  })
})

describe('mergeChunkProse', () => {
  // The input that produced the bug: every chunked section rejected, so the
  // merge received nothing and returned '' — which the commit path then wrote to
  // the manuscript and marked `generated`.
  it('returns an empty string when every section failed', () => {
    expect(mergeChunkProse(['', '', ''])).toBe('')
  })

  it('keeps the sections that did succeed', () => {
    expect(mergeChunkProse(['one', '', 'three'])).toBe('one\n\nthree')
  })
})

describe('describeReport', () => {
  it('says what was written and what was not reached', () => {
    const report = { ...emptyReport(), written: 12, words: 9000, failed: 1, remaining: 7 }
    const text = describeReport(report)
    expect(text).toContain('12 scene(s) written')
    expect(text).toContain('7 not reached')
  })

  it('names the reason when a run stopped early', () => {
    const text = describeReport({ ...emptyReport(), written: 3, stoppedBy: 'size ceiling' })
    expect(text).toContain('stopped: size ceiling')
  })
})
