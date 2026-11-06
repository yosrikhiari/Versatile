/**
 * The two-client sync contract, executable.
 *
 * Versatile has no CRDT, no version token and no merge UI. The rules that ship
 * are simple and need to stay visible:
 *   - clean rows follow the server on pull;
 *   - dirty rows keep local edits on pull and win on the next push;
 *   - push is last-writer-wins;
 *   - an edit made during a push/pull request is never marked synced/overwritten;
 *   - a remote story deletion removes the clean subtree, including rows nested
 *     under a child (volume memberships), and preserves a dirty subtree.
 */
import { describe, it, expect } from 'vitest'
import { createFakeSyncServer, createClient, wireConfigs } from '../helpers/fakeSyncServer'
import { isPushComplete } from '@/services/sync-engine'

function setup() {
  const server = wireConfigs(createFakeSyncServer())
  server.seedStory('story-1', { title: 'Salt Road' })
  const a = createClient(server)
  const b = createClient(server)
  return { server, a, b }
}

async function seedProject(client, id = 'p1') {
  await client.create('projects', { id, name: 'Salt Road', apiId: 'story-1' }, { synced: true })
  client.idMap.setMapping('projects', id, 'story-1')
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('two clients, one story', () => {
  it('a clean row follows the server on pull', async () => {
    const { server, a, b } = setup()
    await seedProject(a)
    await seedProject(b)
    await a.create('characters', { id: 'c1', projectId: 'p1', name: 'Halim' })
    expect(await a.push('characters')).toMatchObject({ pushed: 1, failed: 0 })

    await b.pull('characters', 'story-1', 'p1')
    const pulled = [...b.db.characters.rows.values()][0]
    expect(pulled.name).toBe('Halim')

    a.edit('characters', 'c1', { name: 'Halim the Elder' })
    await a.push('characters')
    await b.pull('characters', 'story-1', 'p1')

    expect(b.db.characters.rows.get(pulled.id).name).toBe('Halim the Elder')
    expect(server.rowsFor('characters', 'story-1')[0].name).toBe('Halim the Elder')
  })

  it('keeps a dirty row through pull, then last writer wins', async () => {
    const { server, a, b } = setup()
    await seedProject(a)
    await seedProject(b)
    await a.create('characters', { id: 'c1', projectId: 'p1', name: 'Base' })
    await a.push('characters')
    await b.pull('characters', 'story-1', 'p1')
    const localId = [...b.db.characters.rows.keys()][0]

    a.edit('characters', 'c1', { name: 'From A' })
    await a.push('characters')

    b.edit('characters', localId, { name: 'From B' })
    await b.pull('characters', 'story-1', 'p1')
    expect(b.db.characters.rows.get(localId).name).toBe('From B')

    await b.push('characters')
    expect(server.rowsFor('characters', 'story-1')[0].name).toBe('From B')

    await a.pull('characters', 'story-1', 'p1')
    expect(a.db.characters.rows.get('c1').name).toBe('From B')
  })

  it('does not overwrite an edit made while a pull is in flight', async () => {
    const { server, a, b } = setup()
    await seedProject(a)
    await seedProject(b)
    await a.create('characters', { id: 'c1', projectId: 'p1', name: 'Base' })
    await a.push('characters')
    await b.pull('characters', 'story-1', 'p1')
    const localId = [...b.db.characters.rows.keys()][0]

    let release
    const gate = new Promise((resolve) => (release = resolve))
    server.hook = async ({ url, options }) => {
      if (url.includes('/entity') && !options.method) await gate
    }

    const pulling = b.pull('characters', 'story-1', 'p1')
    await tick()
    b.edit('characters', localId, { name: 'Edited during pull' })
    release()
    await pulling

    expect(b.db.characters.rows.get(localId).name).toBe('Edited during pull')
    expect(b.db.characters.rows.get(localId).syncStatus).toBe('pending-update')
  })

  it('keeps an edit made while a push is in flight pending, then sends it', async () => {
    const { server, a } = setup()
    await seedProject(a)
    server.seedRow('characters', 'story-1', 'character-1', { name: 'Base' })
    await a.create(
      'characters',
      { id: 'c1', projectId: 'p1', name: 'Base', apiId: 'character-1' },
      { synced: true }
    )
    a.idMap.setMapping('characters', 'c1', 'character-1')

    a.edit('characters', 'c1', { name: 'In flight' })

    let release
    const gate = new Promise((resolve) => (release = resolve))
    server.hook = async ({ url, options }) => {
      if (url.includes('/sync/batch') && options.method === 'POST') await gate
    }

    const pushing = a.push('characters')
    await tick()
    a.edit('characters', 'c1', { name: 'After the request started' })
    release()
    await pushing

    expect(a.db.characters.rows.get('c1').syncStatus).toBe('pending-update')
    expect(server.rowsFor('characters', 'story-1')[0].name).toBe('In flight')

    server.hook = null
    await a.push('characters')
    expect(a.db.characters.rows.get('c1').syncStatus).toBe('synced')
    expect(server.rowsFor('characters', 'story-1')[0].name).toBe('After the request started')
  })
})

describe('remote story deletion', () => {
  it('removes volume memberships nested under a deleted volume', async () => {
    const { server, a } = setup()
    await seedProject(a)
    await a.create(
      'volumes',
      { id: 'v1', projectId: 'p1', title: 'Volume I', apiId: 'volume-1' },
      { synced: true }
    )
    await a.create(
      'volumeEntities',
      {
        id: 've1',
        volumeId: 'v1',
        entityType: 'Character',
        entityId: 'c1',
        apiId: 'volume-entity-1'
      },
      { synced: true }
    )
    server.tombstones.push({ table: 'projects', rowId: 'story-1', storyId: 'story-1' })

    const result = await a.tombstones('story-1')

    expect(result).toEqual({ applied: 1, skipped: 0 })
    expect(a.db.projects.rows.has('p1')).toBe(false)
    expect(a.db.volumes.rows.has('v1')).toBe(false)
    expect(a.db.volumeEntities.rows.has('ve1')).toBe(false)
  })

  it('preserves the whole subtree when a nested membership is dirty', async () => {
    const { server, a } = setup()
    await seedProject(a)
    await a.create(
      'volumes',
      { id: 'v1', projectId: 'p1', title: 'Volume I', apiId: 'volume-1' },
      { synced: true }
    )
    await a.create(
      'volumeEntities',
      {
        id: 've1',
        volumeId: 'v1',
        entityType: 'Character',
        entityId: 'c1',
        apiId: 'volume-entity-1'
      },
      { synced: true }
    )
    a.edit('volumeEntities', 've1', { isPrimary: false })
    server.tombstones.push({ table: 'projects', rowId: 'story-1', storyId: 'story-1' })

    const result = await a.tombstones('story-1')

    expect(result).toEqual({ applied: 0, skipped: 1 })
    expect(a.db.projects.rows.has('p1')).toBe(true)
    expect(a.db.volumes.rows.has('v1')).toBe(true)
    expect(a.db.volumeEntities.rows.get('ve1').isPrimary).toBe(false)
  })
})

describe('lastSync', () => {
  it('is not stamped while rows are deferred behind a parent', () => {
    expect(isPushComplete({ failed: 0, deferred: 0 })).toBe(true)
    expect(isPushComplete({ failed: 0, deferred: 1 })).toBe(false)
    expect(isPushComplete({ failed: 1, deferred: 0 })).toBe(false)
  })
})
