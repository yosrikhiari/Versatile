import { describe, it, expect } from 'vitest'
import {
  decideFate,
  divergencePrompt,
  sceneFatePrompt,
  sceneBriefPrompt,
  branchCanon,
  storySoFar,
  replaceSentenceInHtml,
  rewriteBrief
} from '@/services/whatIf/whatIfPlan'

const scene = (n, ch, extra = {}) => ({
  subsectionId: 100 + n,
  sourceSubsectionId: n,
  sceneNumber: n,
  chapterNumber: ch,
  chapterTitle: `Ch ${ch}`,
  title: `S${n}`,
  summary: `Summary ${n}.`,
  keyFacts: [`Fact ${n}.`],
  ...extra
})

describe('decideFate (reason first)', () => {
  it('follows the stated conflict', () => {
    expect(
      decideFate({ needs: 'Zeena away', conflict: 'Zeena is home now', action: 'revise' })
    ).toEqual({ action: 'revise', reason: 'Zeena is home now' })
    expect(decideFate({ conflict: 'none', action: 'keep' }).action).toBe('keep')
    expect(decideFate({ conflict: 'It cannot happen', action: 'drop' }).action).toBe('drop')
  })

  it('a decision that contradicts its own reason follows the reason', () => {
    expect(decideFate({ conflict: 'None.', action: 'drop' }).action).toBe('keep')
    expect(decideFate({ conflict: 'Zeena is present now', action: 'keep' }).action).toBe('revise')
    // "nothing" must be a whole word: "nothingness of the fields" is a conflict.
    expect(decideFate({ conflict: 'nothingness spreads', action: 'revise' }).action).toBe('revise')
  })

  it('no usable answer is no decision', () => {
    expect(decideFate(null)).toBeNull()
    expect(decideFate({ conflict: 'x', action: 'explode' })).toBeNull()
  })
})

describe('prompts', () => {
  it('the change is stated without consequences; fate and brief see the change and the original scene only', () => {
    const d = divergencePrompt({
      bookTitle: 'EF',
      premise: 'Zeena stays',
      before: [scene(1, 1)],
      divergence: scene(2, 1)
    })
    expect(d).toContain('WHAT IF: Zeena stays')
    expect(d).toMatch(/Do not add consequences/)
    const q = sceneFatePrompt({ divergenceFact: 'Zeena stays.', scene: scene(5, 3) })
    expect(q).toContain('Zeena stays.')
    expect(q).toContain('Summary 5.')
    expect(q.indexOf('"needs"')).toBeLessThan(q.indexOf('"conflict"'))
    expect(q.indexOf('"conflict"')).toBeLessThan(q.indexOf('"action"'))
    // Any view of the alternate version so far made every brief a copy of the
    // first (live read, 27 Sep): the brief sees its own scene and the change.
    const b = sceneBriefPrompt({ divergenceFact: 'Zeena stays.', scene: scene(5, 3) })
    expect(b).toContain('Summary 5.')
    expect(b).not.toMatch(/alternate version so far|last scenes/i)
  })
})

describe('the canon never includes the future', () => {
  it('the writer canon has only scenes before the change, and the change as a fact', () => {
    const plan = {
      premise: 'P',
      divergenceFact: 'Mattie stays.',
      divergence: scene(3, 2),
      scenes: []
    }
    const canon = branchCanon(plan, [scene(1, 1), scene(2, 1)])
    expect(canon).toContain('Summary 1.')
    expect(canon).toContain('Fact 2.')
    expect(canon).toContain('Mattie stays.')
    expect(canon).not.toContain('Summary 3.')
    expect(storySoFar([])).toMatch(/opening scene/)
  })
})

describe('replaceSentenceInHtml', () => {
  it('replaces or deletes a sentence by its plain text, escaped or not', () => {
    const html = '<p>Zeena went to Bettsbridge. Ethan &amp; Mattie ate supper.</p>'
    expect(replaceSentenceInHtml(html, 'Zeena went to Bettsbridge.', 'Zeena stayed home.')).toEqual(
      {
        html: '<p>Zeena stayed home. Ethan &amp; Mattie ate supper.</p>',
        replaced: true
      }
    )
    expect(replaceSentenceInHtml(html, 'Ethan & Mattie ate supper.', '').html).toBe(
      '<p>Zeena went to Bettsbridge. </p>'
    )
    expect(
      replaceSentenceInHtml('<p>She was <em>very</em> tired.</p>', 'She was very tired.', 'x')
        .replaced
    ).toBe(false)
  })
})

describe('the stated change keeps the premise', async () => {
  const { premiseAsFact, chooseDivergenceFact } = await import('@/services/whatIf/whatIfPlan')
  const premise =
    'What if Zeena never goes to Bettsbridge, and stays home the night Ethan and Mattie were to be alone?'

  it('turns the question into a statement', () => {
    expect(premiseAsFact(premise)).toBe(
      'Zeena never goes to Bettsbridge, and stays home the night Ethan and Mattie were to be alone.'
    )
    expect(premiseAsFact('what if the church burned')).toBe('The church burned.')
  })

  it('keeps the model’s wording only when it keeps the premise’s terms', () => {
    // The live read's version dropped "the night ... alone": the premise wins.
    expect(
      chooseDivergenceFact('Zeena decides to stay home instead of going to Bettsbridge.', premise)
    ).toBe(premiseAsFact(premise))
    const faithful =
      'Zeena never goes to Bettsbridge; she stays home the night Ethan and Mattie were to be alone together.'
    expect(chooseDivergenceFact(faithful, premise)).toBe(faithful)
    expect(chooseDivergenceFact('', premise)).toBe(premiseAsFact(premise))
  })
})

describe('rewriteBrief (§40)', () => {
  const fact =
    'Zeena Frome is still at the kitchen door: last shown there in VII, and the story never shows Zeena Frome leaving.'
  it('keeps what the scene is for and adds each missing event once, as a rule', () => {
    const b = rewriteBrief({
      ...scene(9, 'VIII'),
      action: 'revise',
      brief: 'Ethan and Mattie spend the evening together.',
      reason: '',
      presenceIssues: [
        { who: 'Zeena Frome', sentence: "Zeena's absence left the house hushed.", fact },
        { who: 'Zeena Frome', sentence: 'After Zeena left, the stove went cold.', fact }
      ]
    })
    expect(b.startsWith('Ethan and Mattie spend the evening together.\nMUST HOLD:\n- ')).toBe(true)
    expect(b.split('\n- ')).toHaveLength(2)
    expect(b).toContain(fact)
    expect(b).toContain('Zeena Frome is not gone, absent or returning')
  })
  it('a kept scene is rewritten from its summary; no issues means no rules', () => {
    const kept = { ...scene(12, 'Epilogue'), action: 'keep', brief: '', reason: '' }
    expect(rewriteBrief(kept)).toBe(kept.summary || `The scene "${kept.title}" of Epilogue.`)
  })
})
