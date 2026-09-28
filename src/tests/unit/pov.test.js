import { describe, it, expect } from 'vitest'
import {
  narrationOf,
  firstPersonRate,
  narrativePerson,
  povDrift,
  povRule
} from '@/services/whatIf/pov'

// 200-word passages: the thresholds need at least 150 words of narration.
const words = (n, w = 'the') => Array.from({ length: n }, () => w).join(' ')
const first = `I walked to the ruins and I saw the sphinx. ${words(90)} My hands were cold; we waited. ${words(90)}`
const third = `He walked to the ruins and he saw the sphinx. ${words(90)} His hands were cold; they waited. ${words(90)}`

describe('narrative person (§44)', () => {
  it('speech is not narration: a third-person scene full of quoted "I" stays third', () => {
    const talky = `${third} “I am here,” she said. “I think I know,” he said. "I will go," he said.`
    expect(narrationOf('He said “I am”.')).not.toContain('I am')
    expect(narrativePerson(talky).person).toBe('third')
  })

  it('first and third are told apart; too little narration is unclear', () => {
    expect(narrativePerson(first).person).toBe('first')
    expect(narrativePerson(third).person).toBe('third')
    expect(narrativePerson('I walked home.').person).toBe('unclear')
    expect(firstPersonRate(first).rate).toBeGreaterThan(10)
  })

  it('a frame narrator who speaks as "we" counts as first person', () => {
    const we = `The Traveller was expounding a matter to us. ${words(80)} We sat and our lamps glowed. ${words(80)} He smiled at us.`
    expect(narrativePerson(we).person).toBe('first')
  })

  it('a rewrite in another person than its original is a drift; same person is not', () => {
    expect(povDrift(first, third)).toMatchObject({ from: 'first', to: 'third' })
    expect(povDrift(third, third)).toBeNull()
    expect(povDrift(first, 'I went.')).toBeNull()
  })

  it('the brief rule names the person to keep', () => {
    expect(povRule('first')).toContain('first person ("I")')
    expect(povRule('third')).toContain('third person')
    expect(povRule('unclear')).toBe('')
  })
})
