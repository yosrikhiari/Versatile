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
