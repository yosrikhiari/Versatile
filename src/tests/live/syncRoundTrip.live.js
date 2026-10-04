/**
 * Real push / pull round trip against the running API and Postgres.
 *
 *   docker compose up -d postgres redis api        (API on :5171)
 *   npx vitest run --config vitest.live.config.js src/tests/live/syncRoundTrip.live.js
 *
 * Device A writes two projects (branches, a volume, chapters, a scene,
 * characters, a location, a research document, a manuscript) and pushes.
 * The local database is then wiped and pulled back as device B, which edits
 * and deletes and pushes again. Every step is checked against the server's
 * own answers, not the client's view of them. Before 2026-10-04 no part of
 * this had ever been run: every response was read through its { data }
 * envelope, so nothing got a server id.
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/services/db-core'
import { setAuth } from '@/services/api'
import { getSyncEngine, destroySyncEngine, syncStatus } from '@/services/sync-engine'

const BASE = process.env.SYNC_API || 'http://localhost:5171'
const realFetch = globalThis.fetch
let token = ''

/** Raw server read, envelope stripped, for checking what actually landed. */
async function server(path) {
  const res = await realFetch(`${BASE}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  expect(res.status, path).toBe(200)
  const body = await res.json()
  return body.data
}

const TABLES = [
  'projects',
  'branches',
  'volumes',
  'characters',
  'locations',
  'plotThreads',
  'sections',
  'subsections',
  'characterRelationships',
  'volumeEntities',
  'manuscripts',
  'researchDocuments',
  'researchChunks',
  'researchTags',
  'pendingDeletions'
]

async function wipeLocal() {
  for (const t of TABLES) await db[t].clear()
  localStorage.removeItem('versatile_story_api_id')
}

describe('sync round trip (live API)', () => {
  let engine
  const ids = {}

  beforeAll(async () => {
    // api() fetches relative '/api/...' paths; point them at the live API.
    globalThis.fetch = (url, opts) =>
      realFetch(typeof url === 'string' && url.startsWith('/api') ? BASE + url : url, opts)

    const stamp = Date.now()
    const res = await realFetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `sync${stamp}@example.test`,
        username: `sync${stamp}`,
        password: `Sync-test-${stamp}!`
      })
    })
    expect(res.status).toBe(200)
    const auth = (await res.json()).data
    token = auth.token
    setAuth(auth.token, auth.refreshToken)

    await db.open()
    await wipeLocal()
    engine = getSyncEngine()
    await engine.init()
  })

  afterAll(() => {
    destroySyncEngine()
    globalThis.fetch = realFetch
  })

  it('device A: pushes two projects, each to its own story, links intact', async () => {
    const p1 = await db.projects.add({ name: 'Salt Road', genre: 'fantasy' })
    const p2 = await db.projects.add({ name: 'Second Book' })
    const main = await db.branches.add({ projectId: p1, name: 'main', status: 'active' })
    const fork = await db.branches.add({ projectId: p1, name: 'what if', sourceBranchId: main })
    const vol = await db.volumes.add({ projectId: p1, title: 'Book One', sortOrder: 0 })
    const ines = await db.characters.add({ projectId: p1, name: 'Ines', role: 'lead' })
    await db.locations.add({ projectId: p1, name: 'The Docks', description: 'wet' })
    await db.characters.add({ projectId: p2, name: 'Only In Book Two' })
    const ch = await db.sections.add({
      projectId: p1,
      title: 'Chapter 3',
      order: 3,
      volumeId: vol,
      branchId: fork
    })
    await db.subsections.add({
      projectId: p1,
      sectionId: ch,
      title: 'Scene 1',
      order: 2,
      content: '<p>x</p>',
      branchId: fork
    })
    await db.researchDocuments.add({
      projectId: p1,
      fileName: 'notes.md',
      fileType: 'md',
      text: 'salt'
    })
    await db.manuscripts.add({ projectId: p1, content: 'Once', wordCount: 1 })
    Object.assign(ids, { p1, p2, main, fork, vol, ines, ch })

    // First cycle sends the projects; their children wait for a story id.
    await engine.push()
    await engine.push()

    expect(syncStatus.failedTables).toEqual([])
    const pending = []
    for (const t of TABLES.slice(0, -1)) {
      const n = await db[t].where('syncStatus').anyOf('pending-create', 'pending-update').count()
      if (n) pending.push(`${t}:${n}`)
    }
    expect(pending).toEqual([])

    const s1 = (await db.projects.get(p1)).apiId
    const s2 = (await db.projects.get(p2)).apiId
    expect(s1).toMatch(/^[0-9a-f-]{36}$/)
    expect(s2).not.toBe(s1)

    const stories = await server('/story?pageSize=100')
    expect(stories.items.map((s) => s.title).sort()).toEqual(['Salt Road', 'Second Book'])

    const e1 = await server(`/story/${s1}/entity`)
    expect(e1.map((e) => `${e.type}:${e.name}`).sort()).toEqual([
      'Character:Ines',
      'Location:The Docks'
    ])
    const e2 = await server(`/story/${s2}/entity`)
    expect(e2.map((e) => e.name)).toEqual(['Only In Book Two'])

    const branches = await server(`/story/${s1}/branch`)
    const srvMain = branches.find((b) => b.name === 'main')
    const srvFork = branches.find((b) => b.name === 'what if')
    expect(srvFork.sourceBranchId).toBe(srvMain.id)

    const [section] = await server(`/story/${s1}/section`)
    const volumes = await server(`/story/${s1}/volume`)
    expect(section).toMatchObject({ title: 'Chapter 3', order: 3, branchId: srvFork.id })
    expect(section.volumeId).toBe(volumes.items[0].id)

    const [scene] = await server(`/story/${s1}/subsection`)
    expect(scene).toMatchObject({ sectionId: section.id, order: 2, branchId: srvFork.id })

    const [doc] = await server(`/story/${s1}/research-document`)
    expect(doc).toMatchObject({ fileName: 'notes.md', fileType: 'md', content: 'salt' })

    const [ms] = await server(`/story/${s1}/manuscript`)
    expect(ms).toMatchObject({ title: 'Manuscript', content: 'Once', wordCount: 1 })
  })

  it('device B: pulls everything back into the right projects and tables', async () => {
    // A new device: no engine, no local rows. The engine goes first so its
    // delete hook does not queue the wipe as deletions.
    destroySyncEngine()
    await wipeLocal()
    engine = getSyncEngine()
    await engine.init()

    await engine.pull()
    expect(syncStatus.lastError).toBeNull()

    const projects = await db.projects.toArray()
    expect(projects.map((p) => p.name).sort()).toEqual(['Salt Road', 'Second Book'])
    const b1 = projects.find((p) => p.name === 'Salt Road').id
    const b2 = projects.find((p) => p.name === 'Second Book').id

    const chars = await db.characters.toArray()
    expect(chars.map((c) => `${c.projectId === b1 ? 1 : 2}:${c.name}`).sort()).toEqual([
      '1:Ines',
      '2:Only In Book Two'
    ])
    const locs = await db.locations.toArray()
    expect(locs.map((l) => l.name)).toEqual(['The Docks'])

    const branches = await db.branches.where({ projectId: b1 }).toArray()
    const main = branches.find((b) => b.name === 'main')
    const fork = branches.find((b) => b.name === 'what if')
    expect(fork.sourceBranchId).toBe(main.id)

    const [vol] = await db.volumes.where({ projectId: b1 }).toArray()
    const [section] = await db.sections.where({ projectId: b1 }).toArray()
    expect(section).toMatchObject({
      title: 'Chapter 3',
      order: 3,
      volumeId: vol.id,
      branchId: fork.id
    })
    const [scene] = await db.subsections.where({ projectId: b1 }).toArray()
    expect(scene).toMatchObject({ sectionId: section.id, order: 2, branchId: fork.id })

    const [doc] = await db.researchDocuments.where({ projectId: b1 }).toArray()
    expect(doc).toMatchObject({ fileName: 'notes.md', text: 'salt' })
    expect(await db.characters.where({ projectId: b2 }).count()).toBe(1)
    Object.assign(ids, { b1, sectionB: section.id })
  })

  it('device B: an edit that clears a link and a delete both reach the server', async () => {
    await db.sections.update(ids.sectionB, { volumeId: null, title: 'Chapter 3 (moved)' })
    const ines = await db.characters.where({ projectId: ids.b1, name: 'Ines' }).first()
    await db.characters.delete(ines.id)
    // The delete is queued after its transaction commits.
    await new Promise((r) => setTimeout(r, 50))
    expect(await db.pendingDeletions.count()).toBe(1)

    await engine.push()
    expect(syncStatus.failedTables).toEqual([])
    expect(await db.pendingDeletions.count()).toBe(0)

    const s1 = (await db.projects.get(ids.b1)).apiId
    const [section] = await server(`/story/${s1}/section`)
    expect(section.title).toBe('Chapter 3 (moved)')
    expect(section.volumeId).toBeNull()
    const entities = await server(`/story/${s1}/entity`)
    expect(entities.map((e) => e.name)).toEqual(['The Docks'])
  })
})
