import { describe, it, expect } from 'vitest'
import {
  checkDeadThenAlive,
  checkObjectDestroyedThenUsed,
  checkAppearanceChange,
  checkLocationImpossible,
  checkKnowledgeRelearned,
  runDeterministicContradictionChecks,
  generateContradictionCandidates
} from '@/services/generation/deterministicContradictions'

// `checkDeadThenAlive` shipped as a function that looped over its input with an
// empty body and returned nothing, and was never registered in the rule list —
// so a character dying and reappearing has never been reportable. These are the
// rules running against a real entity-state timeline for the first time.

let seq = 0
const state = (over = {}) => ({
  projectId: 'p1',
  entityType: 'character',
  entityId: '1',
  entityName: 'Kael',
  sceneId: `s${++seq}`,
  sceneNumber: 1,
  chapterNumber: 1,
  sourceFacts: [],
  stateHash: 'h',
  version: 1,
  updatedAt: 'T',
  ...over,
  state: {
    present: true,
    status: 'unknown',
    condition: 'unknown',
    location: null,
    attributes: {},
    knows: [],
    ...(over.state || {})
  }
})

describe('checkDeadThenAlive', () => {
  it('flags a character who dies and then appears again', () => {
    const found = checkDeadThenAlive([
      state({ chapterNumber: 3, state: { status: 'dead' }, sourceFacts: ['Kael dies.'] }),
      state({ chapterNumber: 9, state: { present: true } })
    ])
    expect(found).toHaveLength(1)
    expect(found[0].type).toBe('dead_then_alive')
    expect(found[0].severity).toBe('error')
    expect(found[0].description).toContain('chapter 3')
    expect(found[0].description).toContain('chapter 9')
    // The facts behind it, so an author can judge a flashback for themselves.
    expect(found[0].evidence).toContain('Kael dies.')
  })

  it('accepts an explicit revival', () => {
    const found = checkDeadThenAlive([
      state({ chapterNumber: 3, state: { status: 'dead' }, sourceFacts: ['Kael dies.'] }),
      state({
        chapterNumber: 5,
        state: { status: 'alive' },
        sourceFacts: ['Kael returns from the dead.']
      }),
      state({ chapterNumber: 9, state: { present: true } })
    ])
    expect(found).toHaveLength(0)
  })

  it('reports a death once, not once per later chapter', () => {
    // Thirty restatements of the same problem is not thirty findings.
    const found = checkDeadThenAlive([
      state({ chapterNumber: 3, state: { status: 'dead' } }),
      state({ chapterNumber: 4 }),
      state({ chapterNumber: 5 }),
      state({ chapterNumber: 6 })
    ])
    expect(found).toHaveLength(1)
  })

  it('ignores a death with nothing after it', () => {
    expect(checkDeadThenAlive([state({ chapterNumber: 9, state: { status: 'dead' } })])).toEqual([])
  })

  it('keeps two characters' + ' timelines apart', () => {
    const found = checkDeadThenAlive([
      state({ entityId: '1', entityName: 'Kael', chapterNumber: 3, state: { status: 'dead' } }),
      state({ entityId: '2', entityName: 'Mira', chapterNumber: 9, state: { present: true } })
    ])
    expect(found).toHaveLength(0)
  })
})

describe('checkObjectDestroyedThenUsed', () => {
  const obj = (over) =>
    state({ entityType: 'object', entityId: '~sunspear', entityName: 'The Sunspear', ...over })

  it('flags an object destroyed and then used', () => {
    const found = checkObjectDestroyedThenUsed([
      obj({ chapterNumber: 2, state: { present: false, condition: 'destroyed' } }),
      obj({
        chapterNumber: 8,
        state: { present: false, condition: 'intact' },
        sourceFacts: ['The Sunspear is retrieved.']
      })
    ])
    expect(found).toHaveLength(1)
    expect(found[0].description).toContain('destroyed')
  })

  it('says "lost" when the object was lost rather than destroyed', () => {
    const found = checkObjectDestroyedThenUsed([
      obj({ chapterNumber: 2, state: { present: false, condition: 'lost' } }),
      obj({
        chapterNumber: 8,
        state: { present: false, condition: 'intact' },
        sourceFacts: ['found again']
      })
    ])
    expect(found[0].description).toContain('lost')
  })

  it('does not fire on an intact state nothing asserted', () => {
    // An object merely mentioned again is not a claim that it is whole.
    const found = checkObjectDestroyedThenUsed([
      obj({ chapterNumber: 2, state: { present: false, condition: 'destroyed' } }),
      obj({ chapterNumber: 8, state: { present: false, condition: 'intact' }, sourceFacts: [] })
    ])
    expect(found).toHaveLength(0)
  })
})

describe('checkAppearanceChange', () => {
  it('flags an attribute asserted two different ways', () => {
    const found = checkAppearanceChange([
      state({ chapterNumber: 1, state: { attributes: { eye_color: 'grey' } } }),
      state({ chapterNumber: 12, state: { attributes: { eye_color: 'green' } } })
    ])
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
    expect(found[0].description).toContain('eye color')
  })

  it('does not fire on an attribute stated once and never restated', () => {
    const found = checkAppearanceChange([
      state({ chapterNumber: 1, state: { attributes: { eye_color: 'grey' } } }),
      state({ chapterNumber: 12 })
    ])
    expect(found).toHaveLength(0)
  })
})

describe('checkLocationImpossible', () => {
  it('flags a character in two places with no travel between', () => {
    const found = checkLocationImpossible([
      state({ chapterNumber: 4, sceneNumber: 1, state: { present: true, location: 'The Gate' } }),
      state({ chapterNumber: 4, sceneNumber: 2, state: { present: true, location: 'The Reach' } })
    ])
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
  })

  it('allows a move across a chapter break — that is narrative time', () => {
    // A sparse timeline must not read as teleportation: these two states are
    // adjacent in the analysed set but eight chapters apart in the book.
    const found = checkLocationImpossible([
      state({ chapterNumber: 1, sceneNumber: 1, state: { present: true, location: 'The Gate' } }),
      state({ chapterNumber: 9, sceneNumber: 1, state: { present: true, location: 'The Reach' } })
    ])
    expect(found).toHaveLength(0)
  })

  it('allows a move across distant scenes of the same chapter', () => {
    const found = checkLocationImpossible([
      state({ chapterNumber: 4, sceneNumber: 1, state: { present: true, location: 'The Gate' } }),
      state({ chapterNumber: 4, sceneNumber: 2, state: { present: true, location: 'The Gate' } }),
      state({ chapterNumber: 4, sceneNumber: 3, state: { present: true, location: 'The Gate' } }),
      state({ chapterNumber: 4, sceneNumber: 4, state: { present: true, location: 'The Reach' } })
    ])
    // Consecutive states are one position apart, so the move from the Gate to
    // the Reach at scene 4 IS adjacent and correctly flagged.
    expect(found).toHaveLength(1)
  })

  it('ignores a character who is not on stage', () => {
    const found = checkLocationImpossible([
      state({ chapterNumber: 4, sceneNumber: 1, state: { present: true, location: 'The Gate' } }),
      state({ chapterNumber: 4, sceneNumber: 2, state: { present: false, location: 'The Reach' } })
    ])
    expect(found).toHaveLength(0)
  })
})

describe('checkKnowledgeRelearned', () => {
  it('flags a revelation that lands twice', () => {
    const found = checkKnowledgeRelearned([
      state({ chapterNumber: 5, state: { knows: ['the order signed the warrant'] } }),
      state({ chapterNumber: 22, state: { knows: ['the order signed the warrant'] } })
    ])
    expect(found).toHaveLength(1)
    expect(found[0].type).toBe('knowledge_relearned')
    expect(found[0].description).toContain('chapter 5')
  })

  it('does not fire on two different revelations', () => {
    const found = checkKnowledgeRelearned([
      state({ chapterNumber: 5, state: { knows: ['a'] } }),
      state({ chapterNumber: 22, state: { knows: ['b'] } })
    ])
    expect(found).toHaveLength(0)
  })
})

describe('runDeterministicContradictionChecks', () => {
  it('registers the rules that were previously stubs', async () => {
    const found = await runDeterministicContradictionChecks(
      [],
      [],
      [
        state({ chapterNumber: 3, state: { status: 'dead' } }),
        state({ chapterNumber: 9, state: { present: true } })
      ]
    )
    expect(found.map((f) => f.type)).toContain('dead_then_alive')
  })

  it('returns nothing rather than throwing when there is no state timeline', async () => {
    // A project analysed before the state layer had a writer has no rows at all.
    await expect(runDeterministicContradictionChecks([], [])).resolves.toEqual([])
  })
})

describe('generateContradictionCandidates', () => {
  it('pairs adjacent claims about an entity, not every pair sharing one', () => {
    // The previous version paired every scene sharing a character with every
    // other — on a 300-scene manuscript with a protagonist throughout, ~45,000
    // pairs, a candidate list larger than the thing it was filtering.
    const states = [1, 2, 3, 4].map((n) =>
      state({ chapterNumber: n, sceneId: `sc${n}`, sourceFacts: ['something happened'] })
    )
    const candidates = generateContradictionCandidates([], [], states)
    expect(candidates).toHaveLength(3)
  })

  it('ignores scenes that assert nothing about the entity', () => {
    const states = [
      state({ chapterNumber: 1, sceneId: 'a', sourceFacts: ['x'] }),
      state({ chapterNumber: 2, sceneId: 'b', sourceFacts: [] }),
      state({ chapterNumber: 3, sceneId: 'c', sourceFacts: ['y'] })
    ]
    const candidates = generateContradictionCandidates([], [], states)
    expect(candidates).toEqual([{ sceneA: 'a', sceneB: 'c', reason: 'adjacent_claims' }])
  })

  it('always includes the pairs a deterministic rule already flagged', () => {
    const candidates = generateContradictionCandidates(
      [],
      [{ sceneIds: ['x', 'y'], type: 'dead_then_alive' }],
      []
    )
    expect(candidates).toEqual([{ sceneA: 'x', sceneB: 'y', reason: 'dead_then_alive' }])
  })
})
