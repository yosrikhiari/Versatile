import { describe, it, expect } from 'vitest'
import {
  titleShape,
  overusedShapes,
  buildTitleVarietyBlock,
  assembleTitle,
  SHAPE_BUDGET
} from '@/composables/useStoryDirector'

// The titles below are lifted verbatim from a real 100-chapter run. That run
// produced "Echoes of Betrayal" eight times — roughly once per 12-chapter batch,
// which is the signature of each batch sampling independently with no memory of
// what the previous ones had already named.
const REAL_RUN_SAMPLE = [
  'The Fall',
  'Echoes of Honor',
  'Shattered Trust',
  'Descent into Despair',
  'Echoes of Betrayal',
  'The Weight of Memory',
  'The Hollowed Throne',
  'Whispers in the Dark',
  'Awakening Power',
  'Echoes of Betrayal',
  'The Nexus Awakens',
  'Visions of Vengeance'
]

describe('titleShape', () => {
  it('collapses different words with the same structure onto one shape', () => {
    // This is the core claim: an exact-match blocklist would call these four
    // distinct, and a reader calls them the same title.
    const shape = titleShape('Echoes of Betrayal')
    expect(titleShape('Whispers of Power')).toBe(shape)
    expect(titleShape('Visions of Vengeance')).toBe(shape)
    expect(titleShape('Echoes of Honor')).toBe(shape)
  })

  it('catches conjunction pairs, not just prepositional ones', () => {
    // From a live AFTER run: "Flesh and Thread", "Blood and Ink", "Ash and
    // Breath" — three clones of one structure that all fell into the catch-all
    // `plain-3w` bucket, so the budget never fired on them.
    const shape = titleShape('Flesh and Thread')
    expect(titleShape('Blood and Ink')).toBe(shape)
    expect(titleShape('Ash and Breath')).toBe(shape)
    expect(shape).not.toBe('plain-3w')
    expect(overusedShapes(['Flesh and Thread', 'Blood and Ink', 'Ash and Breath'])).toContain(shape)
  })

  it('separates the connectors rather than lumping all prepositions together', () => {
    // "of" and "in" titles are both clichés but distinct ones; merging them
    // would exhaust the budget twice as fast and over-constrain the model.
    expect(titleShape('Whispers in the Dark')).not.toBe(titleShape('Echoes of Betrayal'))
  })

  it('recognises the forms the prompt asks for', () => {
    expect(titleShape('Unmade')).toBe('single-word')
    expect(titleShape('Who Signed the Order?')).toBe('question')
    expect(titleShape('The Hollowed Throne')).toBe('the-x')
    expect(titleShape("Seraphine's Mind Games")).toBe('possessive')
    // The real run shipped "The Veil’s Reflection" with a curly apostrophe.
    expect(titleShape('The Veil’s Reflection')).toBe('possessive')
    expect(titleShape('Mind Break')).toBe('plain-2w')
  })

  it('is case- and punctuation-insensitive', () => {
    expect(titleShape('ECHOES OF BETRAYAL')).toBe(titleShape('Echoes of Betrayal'))
    expect(titleShape('"Echoes of Betrayal"')).toBe(titleShape('Echoes of Betrayal'))
  })

  it('reads a question mark before anything else', () => {
    // "The Price of Knowledge?" is a question first and an "of" title second.
    expect(titleShape('The Price of Knowledge?')).toBe('question')
  })

  it('handles missing and non-string input', () => {
    for (const bad of [undefined, null, '', '   ', 42]) {
      expect(titleShape(bad)).toBe('empty')
    }
  })
})

describe('overusedShapes', () => {
  it('flags the shape that dominated the real run', () => {
    expect(overusedShapes(REAL_RUN_SAMPLE)).toContain(titleShape('Echoes of Betrayal'))
  })

  it('stays quiet until a shape actually hits the budget', () => {
    const justUnder = Array.from({ length: SHAPE_BUDGET - 1 }, (_, i) => `Echoes of Thing${i}`)
    expect(overusedShapes(justUnder)).toEqual([])

    const atBudget = Array.from({ length: SHAPE_BUDGET }, (_, i) => `Echoes of Thing${i}`)
    expect(atBudget.length).toBe(SHAPE_BUDGET)
    expect(overusedShapes(atBudget)).toContain('x-of-y')
  })

  it('ignores empty titles so padding never burns the budget', () => {
    // Padded chapters land as "Chapter 7"; those must not count toward a shape.
    expect(overusedShapes(['', '   ', null, undefined])).toEqual([])
  })

  it('orders the worst offender first', () => {
    const titles = [
      'Echoes of A',
      'Echoes of B',
      'Echoes of C',
      'Echoes of D',
      'Whispers in A',
      'Whispers in B',
      'Whispers in C'
    ]
    expect(overusedShapes(titles)[0]).toBe('x-of-y')
  })

  it('returns nothing for an empty ledger', () => {
    expect(overusedShapes([])).toEqual([])
  })
})

describe('buildTitleVarietyBlock', () => {
  it('carries prior titles into the next batch', () => {
    // The actual bug: batch 5 never saw what batches 1-4 named.
    const block = buildTitleVarietyBlock(REAL_RUN_SAMPLE, 'Dark Fantasy', 'Grim')
    expect(block).toContain('Echoes of Betrayal')
    expect(block).toContain('The Hollowed Throne')
    expect(block).toContain('Never use')
  })

  it('pre-bans its own example titles', () => {
    // A live run returned the palette's examples verbatim as chapters 1-10, in
    // palette order, for a story containing none of them. Shown a list of good
    // titles a small model reads a menu, not a description of form — so the
    // examples ship already on the off-limits list.
    const block = buildTitleVarietyBlock([], 'Dark Fantasy', 'Grim')
    for (const example of ['The Iron Collar', 'Who Signed the Order?', 'Ashwater Bridge']) {
      // Present twice: once illustrating its form, once as forbidden.
      expect(block.split(example).length - 1).toBeGreaterThanOrEqual(2)
    }
    expect(block).toMatch(/copy the form, never the words/i)
  })

  it('does not spend shape budget on its own examples', () => {
    // The examples cover every form by design. Counting them as used shapes
    // would push several to the limit before the novel has a single chapter.
    const block = buildTitleVarietyBlock([], 'Dark Fantasy', 'Grim')
    expect(block).not.toContain('SHAPES THAT ARE FULL')
  })

  it('names the exhausted shape in readable English, not an internal token', () => {
    const block = buildTitleVarietyBlock(REAL_RUN_SAMPLE, 'Dark Fantasy', 'Grim')
    expect(block).toContain('"[Noun] of [Noun]"')
    expect(block).not.toContain('x-of-y')
  })

  it('says so plainly on the first batch instead of emitting an empty rule', () => {
    const block = buildTitleVarietyBlock([], 'Dark Fantasy', 'Grim')
    expect(block).toContain('None are from this novel yet')
    expect(block).not.toContain('SHAPES THAT ARE FULL')
  })

  it('carries the genre and tone into the maturity instruction', () => {
    const block = buildTitleVarietyBlock([], 'Dark Fantasy', 'Brutal')
    expect(block).toContain('Dark Fantasy')
    expect(block).toContain('Brutal')
    expect(block).toMatch(/do not soften|euphemise/i)
  })

  it('falls back to a dark default rather than emitting an empty genre', () => {
    const block = buildTitleVarietyBlock([], '', '')
    expect(block).toContain('dark fantasy')
    expect(block).not.toContain('tone ""')
  })

  it('bounds how many prior titles it replays', () => {
    // 100 chapters of history must not crowd out the batch's own instructions.
    const many = Array.from({ length: 300 }, (_, i) => `Unique Title Number ${i}`)
    const block = buildTitleVarietyBlock(many, 'Dark Fantasy', 'Grim')
    expect(block).not.toContain('Unique Title Number 0')
    expect(block).toContain('Unique Title Number 299')
  })

  it('sets per-batch quotas, since the shape ban cannot see the current batch', () => {
    // Observed without them: eleven of twenty-four titles began with "The", and
    // the novel contained no question, one-word or spoken-fragment title at all.
    // The shape ban is computed from PREVIOUS batches, so within a batch these
    // quotas are the only constraint that exists.
    const block = buildTitleVarietyBlock([], 'Dark Fantasy', 'Grim', 12)
    expect(block).toMatch(/at most 3 may begin with "The"/i)
    expect(block).toMatch(/at least 1 must be a question/i)
    expect(block).toMatch(/at least 1 must be ONE word/i)
  })

  it('scales quotas down so a short final batch stays satisfiable', () => {
    // A 100-chapter novel ends on a batch of 4. Demanding a 12-chapter spread of
    // forms there is unsatisfiable, and an unsatisfiable rule teaches the model
    // to disregard the whole instruction.
    const tail = buildTitleVarietyBlock([], 'Dark Fantasy', 'Grim', 4)
    expect(tail).toMatch(/at most 1 may begin with "The"/i)
    expect(tail).not.toMatch(/must be a question/i)
    expect(tail).not.toMatch(/must be ONE word/i)
  })

  it('explains the multi-part mechanism it expects back', () => {
    const block = buildTitleVarietyBlock([], 'Dark Fantasy', 'Grim')
    expect(block).toContain('partOf')
    expect(block).toContain('partNumber')
  })
})

describe('assembleTitle', () => {
  it('builds a multi-part title from partOf and partNumber', () => {
    expect(assembleTitle({ partOf: 'The Veil Sanctum', partNumber: 1 }, 7)).toBe(
      'The Veil Sanctum, Part 1'
    )
    expect(assembleTitle({ partOf: 'The Veil Sanctum', partNumber: 2 }, 8)).toBe(
      'The Veil Sanctum, Part 2'
    )
  })

  it('prefers the multi-part form when the model sends both', () => {
    expect(assembleTitle({ title: 'Something Else', partOf: 'The Siege', partNumber: 2 }, 4)).toBe(
      'The Siege, Part 2'
    )
  })

  it('ignores a partOf with no usable part number', () => {
    // Half-filled multi-part fields must degrade to the plain title, never to
    // "The Siege, Part NaN".
    expect(assembleTitle({ title: 'Real Title', partOf: 'The Siege' }, 4)).toBe('Real Title')
    expect(assembleTitle({ title: 'Real Title', partOf: 'The Siege', partNumber: 0 }, 4)).toBe(
      'Real Title'
    )
    expect(assembleTitle({ title: 'Real Title', partOf: 'The Siege', partNumber: 'x' }, 4)).toBe(
      'Real Title'
    )
  })

  it('coerces a numeric string part number', () => {
    expect(assembleTitle({ partOf: 'The Siege', partNumber: '2' }, 4)).toBe('The Siege, Part 2')
  })

  it('falls back to the chapter number when nothing usable arrives', () => {
    expect(assembleTitle({}, 47)).toBe('Chapter 47')
    expect(assembleTitle({ title: '   ' }, 47)).toBe('Chapter 47')
    expect(assembleTitle(null, 47)).toBe('Chapter 47')
  })

  it('trims whitespace the model leaves around a title', () => {
    expect(assembleTitle({ title: '  The Fall  ' }, 1)).toBe('The Fall')
    expect(assembleTitle({ partOf: '  The Siege  ', partNumber: 1 }, 1)).toBe('The Siege, Part 1')
  })

  it('produces titles that shape-count as a coherent group', () => {
    // Parts of one event share a shape by design; the budget must not be spent
    // fighting that, so they collapse to the same shape rather than three.
    const parts = [1, 2, 3].map((n) =>
      assembleTitle({ partOf: 'The Veil Sanctum', partNumber: n }, n)
    )
    expect(new Set(parts.map(titleShape)).size).toBe(1)
  })
})
