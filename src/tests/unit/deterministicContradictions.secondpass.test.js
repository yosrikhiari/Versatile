import { describe, it, expect } from 'vitest'
import {
  checkDeadThenAlive,
  checkObjectDestroyedThenUsed,
  checkAppearanceChange,
  checkLocationImpossible,
  checkKnowledgeRelearned,
  checkTimelineInversion,
  runDeterministicContradictionChecks
} from '@/services/generation/deterministicContradictions'

// Second-pass audit of the deterministic contradiction engine.
//
// The 100-chapter harness only seeded (and asserted) `dead_then_alive` via a
// self-test; the other five rules were executed but never triggered by any
// seeded scenario, so a false-negative bug in them would be invisible. This
// suite builds rich, interconnected entity-state timelines that exercise every
// rule's positive and negative paths and asserts no false positives on a long,
// internally-consistent timeline.

function makeState(over = {}) {
  return {
    projectId: 'p1',
    entityType: over.entityType ?? 'character',
    entityId: over.entityId ?? 'char-1',
    entityName: over.entityName ?? 'Kael',
    sceneId: over.sceneId ?? 's1',
    sceneNumber: over.sceneNumber ?? 1,
    chapterNumber: over.chapterNumber ?? 1,
    state: {
      present: false,
      status: 'unknown',
      condition: 'unknown',
      location: null,
      knows: [],
      attributes: {},
      ...(over.state || {})
    },
    sourceFacts: over.sourceFacts ?? [],
    stateHash: over.stateHash ?? 'h',
    version: 1,
    updatedAt: over.updatedAt ?? '2024-01-01T00:00:00.000Z'
  }
}

describe('second-pass: checkDeadThenAlive', () => {
  it('flags a death followed by an unexplained reappearance', () => {
    const states = [
      makeState({
        sceneId: 's5',
        chapterNumber: 5,
        sourceFacts: ['Kael died in the siege'],
        state: { present: false, status: 'dead' }
      }),
      makeState({
        sceneId: 's10',
        chapterNumber: 10,
        sourceFacts: ['Kael was seen in the market'],
        state: { present: true, status: 'unknown' }
      })
    ]
    const out = checkDeadThenAlive(states)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('dead_then_alive')
  })

  it('does NOT flag a legitimate revival (status alive with source facts)', () => {
    const states = [
      makeState({
        sceneId: 's5',
        chapterNumber: 5,
        sourceFacts: ['Kael died'],
        state: { present: false, status: 'dead' }
      }),
      makeState({
        sceneId: 's10',
        chapterNumber: 10,
        sourceFacts: ['Kael was resurrected by the rite'],
        state: { present: true, status: 'alive' }
      })
    ]
    expect(checkDeadThenAlive(states)).toHaveLength(0)
  })

  it('flags only once per death even if the character appears in many later scenes', () => {
    const states = [
      makeState({
        sceneId: 's5',
        chapterNumber: 5,
        sourceFacts: ['Kael died'],
        state: { present: false, status: 'dead' }
      }),
      makeState({
        sceneId: 's10',
        chapterNumber: 10,
        sourceFacts: ['Kael was seen'],
        state: { present: true }
      }),
      makeState({
        sceneId: 's11',
        chapterNumber: 11,
        sourceFacts: ['Kael spoke'],
        state: { present: true }
      })
    ]
    expect(checkDeadThenAlive(states)).toHaveLength(1)
  })
})

describe('second-pass: checkObjectDestroyedThenUsed', () => {
  it('flags an object destroyed then used intact again', () => {
    const states = [
      makeState({
        entityType: 'object',
        entityId: 'obj-1',
        entityName: 'the Goblet',
        sceneId: 's3',
        chapterNumber: 3,
        sourceFacts: ['the Goblet was destroyed'],
        state: { condition: 'destroyed' }
      }),
      makeState({
        entityType: 'object',
        entityId: 'obj-1',
        entityName: 'the Goblet',
        sceneId: 's8',
        chapterNumber: 8,
        sourceFacts: ['she drank from the Goblet'],
        state: { condition: 'intact' }
      })
    ]
    const out = checkObjectDestroyedThenUsed(states)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('object_destroyed_then_used')
  })

  it('does NOT flag a destroyed object that is never used again', () => {
    const states = [
      makeState({
        entityType: 'object',
        entityId: 'obj-1',
        entityName: 'the Goblet',
        sceneId: 's3',
        chapterNumber: 3,
        sourceFacts: ['the Goblet was destroyed'],
        state: { condition: 'destroyed' }
      })
    ]
    expect(checkObjectDestroyedThenUsed(states)).toHaveLength(0)
  })
})

describe('second-pass: checkAppearanceChange', () => {
  it('flags an attribute asserted two different ways', () => {
    const states = [
      makeState({
        sceneId: 's2',
        chapterNumber: 2,
        sourceFacts: ['Kael has blue eyes'],
        state: { attributes: { eye_color: 'blue' } }
      }),
      makeState({
        sceneId: 's9',
        chapterNumber: 9,
        sourceFacts: ['Kael has green eyes'],
        state: { attributes: { eye_color: 'green' } }
      })
    ]
    const out = checkAppearanceChange(states)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('appearance_change')
  })

  it('does NOT flag an attribute stated once and never restated', () => {
    const states = [
      makeState({
        sceneId: 's2',
        chapterNumber: 2,
        sourceFacts: ['Kael has blue eyes'],
        state: { attributes: { eye_color: 'blue' } }
      }),
      makeState({
        sceneId: 's9',
        chapterNumber: 9,
        sourceFacts: ['Kael drew his sword'],
        state: { attributes: {} }
      })
    ]
    expect(checkAppearanceChange(states)).toHaveLength(0)
  })
})

describe('second-pass: checkLocationImpossible', () => {
  it('flags a character in two places in the same chapter with no travel between', () => {
    const states = [
      makeState({
        sceneId: 's5',
        chapterNumber: 3,
        sceneNumber: 5,
        sourceFacts: ['at the Gate'],
        state: { present: true, location: 'the Gate' }
      }),
      makeState({
        sceneId: 's6',
        chapterNumber: 3,
        sceneNumber: 6,
        sourceFacts: ['at the Reach'],
        state: { present: true, location: 'the Reach' }
      })
    ]
    const out = checkLocationImpossible(states)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('location_impossible')
  })

  it('does NOT flag locations in different chapters (narrative time passed)', () => {
    const states = [
      makeState({
        sceneId: 's5',
        chapterNumber: 3,
        sceneNumber: 5,
        sourceFacts: ['at the Gate'],
        state: { present: true, location: 'the Gate' }
      }),
      makeState({
        sceneId: 's6',
        chapterNumber: 9,
        sceneNumber: 6,
        sourceFacts: ['at the Reach'],
        state: { present: true, location: 'the Reach' }
      })
    ]
    expect(checkLocationImpossible(states)).toHaveLength(0)
  })
})

describe('second-pass: checkKnowledgeRelearned', () => {
  it('flags the same topic learned twice', () => {
    const states = [
      makeState({
        sceneId: 's2',
        chapterNumber: 2,
        sourceFacts: ['learns the gate location'],
        state: { knows: ['the gate location'] }
      }),
      makeState({
        sceneId: 's10',
        chapterNumber: 10,
        sourceFacts: ['learns the gate location again'],
        state: { knows: ['the gate location'] }
      })
    ]
    const out = checkKnowledgeRelearned(states)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('knowledge_relearned')
  })

  it('does NOT flag two different topics', () => {
    const states = [
      makeState({ sceneId: 's2', chapterNumber: 2, state: { knows: ['the gate location'] } }),
      makeState({ sceneId: 's10', chapterNumber: 10, state: { knows: ['the cipher'] } })
    ]
    expect(checkKnowledgeRelearned(states)).toHaveLength(0)
  })
})

describe('second-pass: checkTimelineInversion', () => {
  it('flags a first scene that references a time before it', () => {
    const digests = [
      { subsectionId: 's1', sceneNumber: 1, summary: 'Yesterday the war began.', keyFacts: [] }
    ]
    const out = checkTimelineInversion(digests)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('timeline_inversion')
  })

  it('does NOT flag a non-first scene', () => {
    const digests = [
      { subsectionId: 's2', sceneNumber: 2, summary: 'yesterday the war began', keyFacts: [] }
    ]
    expect(checkTimelineInversion(digests)).toHaveLength(0)
  })
})

describe('second-pass: no false positives on a long, consistent timeline', () => {
  it('produces zero contradictions across an interrelated 12-scene arc', async () => {
    const states = [
      makeState({
        sceneId: 's1',
        chapterNumber: 1,
        entityName: 'Kael',
        sourceFacts: ['Kael lives at the Gate'],
        state: { present: true, status: 'alive', location: 'the Gate', knows: ['the Gate exists'] }
      }),
      makeState({
        sceneId: 's2',
        chapterNumber: 2,
        entityName: 'Kael',
        sourceFacts: ['Kael has blue eyes'],
        state: {
          present: true,
          status: 'alive',
          location: 'the Gate',
          attributes: { eye_color: 'blue' }
        }
      }),
      makeState({
        sceneId: 's3',
        chapterNumber: 3,
        entityName: 'Kael',
        sourceFacts: ['Kael travels to the Reach'],
        state: { present: true, status: 'alive', location: 'the Reach' }
      }),
      makeState({
        sceneId: 's4',
        chapterNumber: 4,
        entityName: 'Kael',
        sourceFacts: ['Kael meets Mira'],
        state: { present: true, status: 'alive', location: 'the Reach', knows: ['Mira'] }
      }),
      makeState({
        sceneId: 's5',
        chapterNumber: 5,
        entityName: 'Kael',
        sourceFacts: ['Kael has blue eyes still'],
        state: {
          present: true,
          status: 'alive',
          location: 'the Reach',
          attributes: { eye_color: 'blue' }
        }
      }),
      makeState({
        sceneId: 's6',
        chapterNumber: 6,
        entityName: 'Kael',
        sourceFacts: ['Kael returns to the Gate'],
        state: { present: true, status: 'alive', location: 'the Gate' }
      }),
      makeState({
        entityType: 'object',
        entityId: 'obj-1',
        entityName: 'the Goblet',
        sceneId: 's2',
        chapterNumber: 2,
        sourceFacts: ['the Goblet is intact'],
        state: { condition: 'intact' }
      }),
      makeState({
        entityType: 'object',
        entityId: 'obj-1',
        entityName: 'the Goblet',
        sceneId: 's6',
        chapterNumber: 6,
        sourceFacts: ['the Goblet is intact'],
        state: { condition: 'intact' }
      })
    ]
    const out = await runDeterministicContradictionChecks([], [], states)
    expect(out).toHaveLength(0)
  })
})
