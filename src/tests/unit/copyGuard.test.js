import { describe, it, expect } from 'vitest'
import { dropCopiedSentences } from '@/services/generation/copyGuard'

const tail =
  'The air was thick with the scent of damp earth and crushed grass, and I moved through the undergrowth with the weight of my own silence pressing against me like a hand on my chest. Somewhere below, voices echoed, low and steady, as if the earth itself were breathing.'
const context = `HOW THE PRECEDING SCENES END (already written):\n[The Morlocks]\n…${tail}`

describe('the writer copying what it was shown (§47)', () => {
  it('removes the sentences of a new scene that copy the preceding prose, and keeps the rest', () => {
    const fresh = 'Night came on quickly. Weena did not follow me past the last of the fires.'
    const r = dropCopiedSentences(`${tail}\n\n${fresh}`, context)
    expect(r.prose).toBe(fresh)
    expect(r.dropped).toBe(2)
    expect(r.words).toBeGreaterThan(40)
    expect(r.sample.startsWith('The air was thick')).toBe(true)
  })

  it('a copy in the middle of a paragraph goes; the new sentences around it stay', () => {
    const r = dropCopiedSentences(
      `I woke before dawn. ${tail} By noon I had reached the Palace.`,
      context
    )
    expect(r.prose).toBe('I woke before dawn. By noon I had reached the Palace.')
  })

  it('a short shared phrase is not a copy; nothing shown, nothing removed', () => {
    const own =
      'The air was thick with the scent of rain on the dry stones, and Filby laughed at the idea.'
    expect(dropCopiedSentences(own, context)).toMatchObject({ prose: own, dropped: 0 })
    expect(dropCopiedSentences(tail, '')).toMatchObject({ prose: tail, dropped: 0 })
  })

  it('keeps the punctuation and paragraphs of what it keeps', () => {
    const kept = '“Where is she?” I asked.\n\nNobody answered!'
    const r = dropCopiedSentences(`${kept}\n\n${tail}`, context)
    expect(r.prose).toBe(kept)
  })
})
