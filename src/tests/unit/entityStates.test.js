import { describe, it, expect } from 'vitest'
import {
  deriveEntityStates,
  readEntityState,
  entityKeyFor,
  indexStatesByEntity,
  compareStatePosition,
  normalizeEntityName
} from '@/services/generation/entityStates'

// The `entityStates` table shipped in schema v45 with three accessors, a
// compound index and no writer — nothing ever put a row in it. These tests
// cover the derivation that finally does, and in particular the failure modes
// that make a continuity rule report against the author's own manuscript.

const digest = (over = {}) => ({
  subsectionId: 's1',
  sceneNumber: 1,
  chapterNumber: 1,
  location: 'The Drowned Gate',
  charactersPresent: ['Kael', 'Mira'],
  keyFacts: [],
  summary: '',
  facts: { characters: [], locations: [], events: [], objects: [] },
  ...over
})

const derive = (over) => deriveEntityStates({ projectId: 'p1', digest: digest(over), now: 'T' })
const forName = (rows, name) => rows.find((r) => r.entityName === name)

describe('deriveEntityStates', () => {
  it('records everyone on stage as present and alive, at the scene location', () => {
    const rows = derive()
    const kael = forName(rows, 'Kael')
    expect(kael.state.present).toBe(true)
    expect(kael.state.status).toBe('alive')
    expect(kael.state.location).toBe('The Drowned Gate')
    expect(kael.chapterNumber).toBe(1)
  })

  it('carries the chapter and scene number so rows can be ordered', () => {
    const rows = derive({ chapterNumber: 7, sceneNumber: 3 })
    expect(rows[0].chapterNumber).toBe(7)
    expect(rows[0].sceneNumber).toBe(3)
  })

  it('reads a death out of the facts', () => {
    const rows = derive({ keyFacts: ['Kael dies at the gate.'] })
    expect(forName(rows, 'Kael').state.status).toBe('dead')
    // The fact that produced the state is kept as the evidence a finding cites.
    expect(forName(rows, 'Kael').sourceFacts).toEqual(['Kael dies at the gate.'])
  })

  it('reads the summary too — a death is as likely stated there as listed as a fact', () => {
    const rows = derive({ summary: 'Mira is wounded holding the bridge.' })
    expect(forName(rows, 'Mira').state.status).toBe('injured')
  })

  it('does not invert a negated claim', () => {
    // "not dead" could be read as alive, but "the blade is not destroyed" says
    // nothing about whether it is intact or lost. Declining to assert is the
    // only rule that is right in every case.
    const rows = derive({ keyFacts: ['Kael is not dead.'] })
    expect(forName(rows, 'Kael').state.status).toBe('alive') // still just "on stage"
    expect(forName(rows, 'Kael').sourceFacts).toEqual([])
  })

  it('reads revival before death, so "returns from the dead" is not a death', () => {
    const rows = derive({ keyFacts: ['Kael returns from the dead.'] })
    expect(forName(rows, 'Kael').state.status).toBe('alive')
  })

  it('splits a compound fact so each clause lands on the right entity', () => {
    const rows = derive({ keyFacts: ['Kael survives, but Mira dies.'] })
    expect(forName(rows, 'Kael').state.status).toBe('alive')
    expect(forName(rows, 'Mira').state.status).toBe('dead')
  })

  it('takes the last state in a scene — wounded then killed ends dead', () => {
    const rows = derive({ keyFacts: ['Kael is wounded.', 'Kael dies.'] })
    expect(forName(rows, 'Kael').state.status).toBe('dead')
  })

  it('matches names on word boundaries so a prefix is not a hit', () => {
    const rows = deriveEntityStates({
      projectId: 'p1',
      digest: digest({ charactersPresent: ['Kae', 'Kael'], keyFacts: ['Kael dies.'] }),
      now: 'T'
    })
    expect(forName(rows, 'Kael').state.status).toBe('dead')
    expect(forName(rows, 'Kae').state.status).toBe('alive')
  })

  it('records a character named only in the facts as not present', () => {
    // A death reported offscreen is exactly the fact a later scene contradicts.
    const rows = derive({
      facts: { characters: ['Doran'], events: ['Doran was killed in the north.'] }
    })
    const doran = forName(rows, 'Doran')
    expect(doran.state.present).toBe(false)
    expect(doran.state.status).toBe('dead')
  })

  it('takes object names only from what the writer declared', () => {
    // The previous approach split destruction facts on whitespace and treated
    // every word over three characters as an object, so this fact alone used to
    // produce objects called "tower", "destroyed" and "fire".
    const rows = derive({
      facts: { objects: ['the Sunspear'] },
      keyFacts: ['The tower was destroyed by fire.', 'The Sunspear shatters.']
    })
    const objects = rows.filter((r) => r.entityType === 'object')
    expect(objects.map((o) => o.entityName)).toEqual(['the Sunspear'])
    expect(objects[0].state.condition).toBe('destroyed')
  })

  it('extracts knowledge topics', () => {
    const rows = derive({ keyFacts: ['Mira learns that the Order signed the warrant.'] })
    expect(forName(rows, 'Mira').state.knows).toEqual(['the order signed the warrant'])
  })

  it('ignores a knowledge verb with no topic behind it', () => {
    const rows = derive({ keyFacts: ['Mira learns.'] })
    expect(forName(rows, 'Mira').state.knows).toEqual([])
  })

  it('extracts physical attributes', () => {
    const rows = derive({ keyFacts: ['Kael has grey eyes.'] })
    expect(forName(rows, 'Kael').state.attributes).toEqual({ eye_color: 'grey' })
  })

  it('keys on the resolved bible id when the name resolves', () => {
    const rows = deriveEntityStates({
      projectId: 'p1',
      digest: digest({ charactersPresent: ['Kael'] }),
      resolve: (type, name) => (type === 'character' && name === 'Kael' ? 42 : null),
      now: 'T'
    })
    // Keying on the id, not the name: renaming a character in the bible must not
    // split their timeline in two.
    expect(forName(rows, 'Kael').entityId).toBe('42')
  })

  it('falls back to a name key for entities with no bible record', () => {
    expect(entityKeyFor('The Sunspear', null)).toBe('~the sunspear')
    expect(entityKeyFor('Kael', 7)).toBe('7')
  })

  it('returns nothing without a project or a scene id', () => {
    expect(deriveEntityStates({ projectId: '', digest: digest() })).toEqual([])
    expect(deriveEntityStates({ projectId: 'p1', digest: { subsectionId: null } })).toEqual([])
  })

  it('survives a malformed digest — it runs on the commit path', () => {
    expect(() =>
      deriveEntityStates({ projectId: 'p1', digest: { subsectionId: 's1', keyFacts: 'nope' } })
    ).not.toThrow()
  })

  it('changes the state hash when the state changes, and not otherwise', () => {
    const a = derive({ keyFacts: ['Kael dies.'] })
    const b = derive({ keyFacts: ['Kael dies.'] })
    const c = derive({ keyFacts: ['Kael is wounded.'] })
    expect(forName(a, 'Kael').stateHash).toBe(forName(b, 'Kael').stateHash)
    expect(forName(a, 'Kael').stateHash).not.toBe(forName(c, 'Kael').stateHash)
  })
})

describe('readEntityState', () => {
  it('leaves an object intact when nothing is said about it', () => {
    const { state } = readEntityState([], 'Sunspear', {
      present: false,
      location: null,
      type: 'object'
    })
    expect(state.condition).toBe('intact')
  })

  it('treats recovery as restoring the object', () => {
    const { state } = readEntityState(['The Sunspear is retrieved.'], 'The Sunspear', {
      present: false,
      location: null,
      type: 'object'
    })
    expect(state.condition).toBe('intact')
  })
})

describe('ordering', () => {
  const at = (chapterNumber, sceneNumber) => ({ chapterNumber, sceneNumber })

  it('orders by chapter, then scene', () => {
    expect(compareStatePosition(at(1, 5), at(2, 1))).toBeLessThan(0)
    expect(compareStatePosition(at(2, 1), at(2, 3))).toBeLessThan(0)
    expect(compareStatePosition(at(3, 1), at(3, 1))).toBe(0)
  })

  it('still orders correctly when no chapter numbers exist at all', () => {
    // A backfilled manuscript has scene numbers long before it has chapters.
    expect(compareStatePosition(at(null, 2), at(null, 9))).toBeLessThan(0)
  })

  it('groups by entity and sorts each group into story order', () => {
    const rows = [
      { entityType: 'character', entityId: '1', chapterNumber: 3, sceneNumber: 1 },
      { entityType: 'character', entityId: '1', chapterNumber: 1, sceneNumber: 1 },
      { entityType: 'object', entityId: '~blade', chapterNumber: 2, sceneNumber: 1 }
    ]
    const index = indexStatesByEntity(rows)
    expect([...index.keys()]).toEqual(['character:1', 'object:~blade'])
    expect(index.get('character:1').map((r) => r.chapterNumber)).toEqual([1, 3])
  })
})

describe('normalizeEntityName', () => {
  it('is case and whitespace insensitive, and total', () => {
    expect(normalizeEntityName('  Kael ')).toBe('kael')
    expect(normalizeEntityName(null)).toBe('')
    expect(normalizeEntityName(42)).toBe('')
  })
})
