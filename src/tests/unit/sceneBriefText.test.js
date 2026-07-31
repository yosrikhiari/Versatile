import { describe, it, expect } from 'vitest'
import { describeSceneBrief } from '@/services/sceneBriefText'

describe('describeSceneBrief', () => {
  it('renders a planned scene as a readable brief instead of a placeholder', () => {
    // The gap this closes: subsections stored description "Scene 3", so the
    // outline showed nothing useful and the next run read that back as its
    // account of the manuscript.
    const brief = describeSceneBrief({
      sceneNumber: 3,
      emotionalGoal: 'Mara realises she is being watched',
      whatChanges: 'the lamp goes dark',
      obstacle: 'the stairwell is flooded',
      location: 'The Lighthouse',
      charactersPresent: ['Mara', 'Ines'],
      pov: 'Mara'
    })

    expect(brief).toContain('Mara realises she is being watched')
    expect(brief).toContain('Changes: the lamp goes dark')
    expect(brief).toContain('Obstacle: the stairwell is flooded')
    expect(brief).toContain('The Lighthouse — Mara, Ines')
    expect(brief).toContain('POV: Mara')
    expect(brief).not.toBe('Scene 3')
  })

  it('accepts the alternate brief shape the planner also emits', () => {
    const brief = describeSceneBrief({
      sceneNumber: 1,
      goal: 'establish the routine',
      change: 'a stranger arrives',
      characters: ['Mara']
    })
    expect(brief).toContain('establish the routine')
    expect(brief).toContain('Changes: a stranger arrives')
    expect(brief).toContain('Mara')
  })

  it('drops the planner filler rather than repeating it back to the model', () => {
    const brief = describeSceneBrief({
      sceneNumber: 2,
      emotionalGoal: 'dread',
      obstacle: 'Unspecified obstacle'
    })
    expect(brief).toBe('dread')
  })

  it('does not repeat an identical goal and change', () => {
    const brief = describeSceneBrief({ emotionalGoal: 'the same', whatChanges: 'the same' })
    expect(brief).toBe('the same')
  })

  it('falls back to the positional label when the plan is empty', () => {
    expect(describeSceneBrief({ sceneNumber: 4 })).toBe('Scene 4')
    expect(describeSceneBrief({})).toBe('')
    expect(describeSceneBrief(null)).toBe('')
  })

  it('bounds the brief on a word boundary, since it is re-read into prompts', () => {
    const brief = describeSceneBrief({
      sceneNumber: 1,
      emotionalGoal: 'word '.repeat(200).trim()
    })
    expect(brief.length).toBeLessThanOrEqual(321)
    expect(brief.endsWith('…')).toBe(true)
    expect(brief).not.toMatch(/\swor…$/)
  })

  it('handles a location with no cast and a cast with no location', () => {
    expect(describeSceneBrief({ location: 'The Pier' })).toBe('The Pier')
    expect(describeSceneBrief({ charactersPresent: ['Ines'] })).toBe('Ines')
  })
})
