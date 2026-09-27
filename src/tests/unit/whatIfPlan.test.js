import { describe, it, expect } from 'vitest'
import {
  cleanPlan,
  planPrompt,
  branchCanon,
  storySoFar,
  replaceSentenceInHtml
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

describe('cleanPlan', () => {
  const divergence = scene(3, 2)
  const later = [scene(4, 2), scene(5, 3), scene(6, 3)]

  it('gives every later scene one decision; missing and invalid ones stay as written', () => {
    const plan = cleanPlan(
      {
        divergenceFact: 'Mattie stays.',
        divergenceBrief: 'Zeena leaves alone.',
        scenes: [
          { sceneNumber: 4, action: 'revise', brief: 'They talk.' },
          { sceneNumber: 5, action: 'explode' },
          { sceneNumber: 4, action: 'drop' }
        ]
      },
      'What if Mattie stayed?',
      divergence,
      later
    )
    expect(plan.divergenceFact).toBe('Mattie stays.')
    expect(plan.scenes.map((s) => [s.sceneNumber, s.action])).toEqual([
      [3, 'revise'],
      [4, 'revise'],
      [5, 'keep'],
      [6, 'keep']
    ])
    expect(plan.scenes[0].brief).toBe('Zeena leaves alone.')
    expect(plan.scenes[1].brief).toBe('They talk.')
    expect(plan.scenes[3].reason).toMatch(/not planned/)
  })

  it('an unreadable answer still yields a whole plan, rewriting only the change', () => {
    const plan = cleanPlan(null, 'What if Mattie stayed?', divergence, later)
    expect(plan.divergenceFact).toBe('What if Mattie stayed?')
    expect(plan.scenes.map((s) => s.action)).toEqual(['revise', 'keep', 'keep', 'keep'])
    expect(plan.scenes[0].brief).toMatch(/Summary 3\..*rewritten so it follows from/)
  })

  it('a revise without a brief gets one from the scene and the change', () => {
    const plan = cleanPlan(
      { divergenceFact: 'F.', scenes: [{ sceneNumber: 6, action: 'revise' }] },
      'P',
      divergence,
      later
    )
    expect(plan.scenes.at(-1).brief).toBe('Summary 6. -- rewritten so it follows from: F.')
  })
})

describe('the canon never includes the future', () => {
  const before = [scene(1, 1), scene(2, 1)]
  const later = [scene(4, 2, { summary: 'Mattie and Ethan sled into the elm.' })]

  it('the writer canon has only scenes before the change, and the change as a fact', () => {
    const plan = cleanPlan({ divergenceFact: 'Mattie stays.' }, 'P', scene(3, 2), later)
    const canon = branchCanon(plan, before)
    expect(canon).toContain('Summary 1.')
    expect(canon).toContain('Fact 2.')
    expect(canon).toContain('Mattie stays.')
    expect(canon).not.toContain('elm')
    expect(canon).not.toContain('Summary 3.')
  })

  it('the planner sees later scenes as a list to decide on', () => {
    const p = planPrompt({ bookTitle: 'EF', premise: 'P', before, divergence: scene(3, 2), later })
    expect(p).toContain('4. [Ch 2] "S4": Mattie and Ethan sled into the elm.')
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
