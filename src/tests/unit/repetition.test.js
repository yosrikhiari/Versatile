import { describe, it, expect } from 'vitest'
import { overlap, isRepeat } from '@/services/whatIf/repetition'

const passage =
  'The air was thick with the scent of damp earth and crushed grass, and I moved through the undergrowth with the weight of my own silence pressing against me like a hand on my chest.'
const a = `${passage} Then I turned toward the river, where the lamps of the Eloi burned low.`
const b = `Night had come quickly over the valley. ${passage} Far off, the white sphinx watched.`
const c =
  'Weena slept in the grass beside the fire. Morning found her gone to the river, laughing with the others, and I did not call her back.'

describe('repetition across scenes (§46)', () => {
  it('finds a passage two scenes share, word for word, whatever the punctuation', () => {
    const o = overlap(a, b)
    expect(o.longestRun).toBe(passage.split(' ').length)
    expect(o.sample.startsWith('The air was thick')).toBe(true)
    expect(isRepeat(o)).toBe(true)
    expect(overlap(a.toUpperCase().replace(/,/g, ''), b).longestRun).toBe(o.longestRun)
  })

  it('different scenes share nothing; a stock phrase is not a passage', () => {
    expect(overlap(a, c)).toMatchObject({ share: 0, longestRun: 0 })
    const stock = 'the world of Eight Hundred and Two Thousand Seven Hundred and One'
    const x = `${c} He spoke of ${stock} as if it were home.`
    const y = `Filby laughed at the idea of ${stock} and poured the wine.`
    expect(overlap(x, y).longestRun).toBeLessThan(25)
    expect(isRepeat(overlap(x, y), { minShare: 1, minRun: 25 })).toBe(false)
  })

  it('many scattered shared phrases count too; an empty scene shares nothing', () => {
    expect(isRepeat({ share: 0.06, longestRun: 10, sample: '' })).toBe(true)
    expect(isRepeat({ share: 0.03, longestRun: 12, sample: '' })).toBe(false)
    expect(overlap('', a)).toMatchObject({ share: 0, longestRun: 0 })
  })
})
