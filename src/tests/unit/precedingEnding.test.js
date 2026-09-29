import { describe, it, expect } from 'vitest'
import { lastParagraph } from '@/services/generation/precedingEnding'

describe('lastParagraph (§48)', () => {
  it('takes the last paragraph of HTML or plain text', () => {
    expect(lastParagraph('<p>First.</p><p>Second, the end.</p>')).toBe('Second, the end.')
    expect(lastParagraph('First.\n\nSecond, the end.\n')).toBe('Second, the end.')
  })

  it('cuts a long paragraph to its last 500 chars, at a sentence start', () => {
    const para = 'Opening words that go. ' + 'The rain fell on the roof. '.repeat(40)
    const out = lastParagraph(para)
    expect(out.length).toBeLessThanOrEqual(501)
    expect(out.startsWith('…The rain fell')).toBe(true)
    expect(out.endsWith('roof.')).toBe(true)
  })

  it('is empty for an empty scene', () => {
    expect(lastParagraph('')).toBe('')
  })
})

describe('precedingEnding: the excerpt keeps the scene tense (§48)', () => {
  const past = 'I walked to the door and looked out. The yard was empty; I stood and waited.'
  const present = 'Then I move, slow and sure. The silence is thick; I step forward and wait.'

  it('passes over a closing paragraph that slipped into the other tense, and names the tense', async () => {
    const scene = [past, past, past, past, `${past} The lamp was out.`, present].join('\n\n')
    const out = (await import('@/services/generation/precedingEnding')).precedingEnding(scene)
    expect(out.tense).toBe('past')
    expect(out.text).toBe(`${past} The lamp was out.`)
  })

  it('keeps the last paragraph when it is in the scene tense, or the tense is unclear', async () => {
    const { precedingEnding, tenseNote } = await import('@/services/generation/precedingEnding')
    const scene = [present, present, present, present, present].join('\n\n')
    expect(precedingEnding(scene)).toMatchObject({ tense: 'present', text: present })
    expect(precedingEnding('A short one.')).toMatchObject({
      tense: 'unclear',
      text: 'A short one.'
    })
    expect(tenseNote('past')).toContain('past tense')
    expect(tenseNote('unclear')).toBe('')
  })
})
