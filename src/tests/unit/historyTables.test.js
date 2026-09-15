import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/services/db-core'
import { addSnapshot, getSnapshots, SNAPSHOT_CAP } from '@/services/db-snapshots'
import {
  saveStateSnapshot,
  getLatestStateSnapshot,
  getStateSnapshotHistory,
  saveSessionArchive,
  getSessionArchive,
  STATE_SNAPSHOT_CAP
} from '@/services/db-archive'

// The three append-only history tables used to grow by one row per autosave
// for the life of a project, and every read of "the latest" loaded all of
// them. These pin the bounded, index-driven behaviour against real Dexie.

let tick = 0
function stamp() {
  // Monotonic ISO timestamps so ordering is deterministic within a test.
  return new Date(Date.UTC(2025, 0, 1, 0, 0, 0, ++tick)).toISOString()
}

beforeEach(async () => {
  await db.snapshots.clear()
  await db.storyStateSnapshots.clear()
  await db.sessionArchive.clear()
  tick = 0
})

describe('content snapshots', () => {
  it('does not store a duplicate of the newest snapshot', async () => {
    const a = await addSnapshot(1, 7, '<p>same</p>')
    const b = await addSnapshot(1, 7, '<p>same</p>')
    expect(b).toBe(a)
    expect(await db.snapshots.count()).toBe(1)
  })

  it('keeps a labelled (manual) snapshot even when the content is unchanged', async () => {
    await addSnapshot(1, 7, '<p>same</p>')
    await addSnapshot(1, 7, '<p>same</p>', 'before the rewrite')
    expect(await db.snapshots.count()).toBe(2)
  })

  it('caps history per chapter and drops the oldest', async () => {
    for (let i = 0; i < SNAPSHOT_CAP + 5; i++) {
      await addSnapshot(1, 7, `<p>${i}</p>`)
    }
    // Another chapter's history is untouched by chapter 7's cap.
    await addSnapshot(1, 8, '<p>other</p>')

    const rows = await getSnapshots(1, 7)
    expect(rows).toHaveLength(SNAPSHOT_CAP)
    expect(rows[0].content).toBe(`<p>${SNAPSHOT_CAP + 4}</p>`)
    expect(rows.at(-1).content).toBe('<p>5</p>')
    expect(await getSnapshots(1, 8)).toHaveLength(1)
  })

  it('returns a chapter history newest-first', async () => {
    await addSnapshot(1, 7, '<p>one</p>')
    await addSnapshot(1, 7, '<p>two</p>')
    const rows = await getSnapshots(1, 7)
    expect(rows.map((r) => r.content)).toEqual(['<p>two</p>', '<p>one</p>'])
  })
})

describe('story state snapshots', () => {
  it('latest is the most recent row, history is newest-first and limited', async () => {
    for (let i = 0; i < 5; i++) {
      await db.storyStateSnapshots.add({
        projectId: 1,
        sessionId: 's',
        state: { i },
        timestamp: stamp()
      })
    }
    expect((await getLatestStateSnapshot(1)).state).toEqual({ i: 4 })
    const history = await getStateSnapshotHistory(1, 2)
    expect(history.map((h) => h.state.i)).toEqual([4, 3])
  })

  it('returns null with no rows and ignores other projects', async () => {
    await db.storyStateSnapshots.add({
      projectId: 2,
      sessionId: 's',
      state: {},
      timestamp: stamp()
    })
    expect(await getLatestStateSnapshot(1)).toBeNull()
  })

  it('caps rows per project on write', async () => {
    for (let i = 0; i < STATE_SNAPSHOT_CAP + 3; i++) {
      await saveStateSnapshot(1, 's', { i })
    }
    expect(await db.storyStateSnapshots.where('projectId').equals(1).count()).toBe(
      STATE_SNAPSHOT_CAP
    )
    expect((await getLatestStateSnapshot(1)).state).toEqual({ i: STATE_SNAPSHOT_CAP + 2 })
  })
})

describe('session archive', () => {
  it('lists newest-first, honours filters and stops at the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await db.sessionArchive.add({
        projectId: 1,
        type: i % 2 ? 'spark_prompt' : 'polish_analysis',
        data: { i },
        tags: i % 3 ? [] : ['tagged'],
        signal: i < 5 ? 'rejected' : 'accepted',
        timestamp: stamp()
      })
    }
    const all = await getSessionArchive(1, { limit: 3 })
    expect(all.map((e) => e.data.i)).toEqual([9, 8, 7])

    const sparks = await getSessionArchive(1, { types: ['spark_prompt'] })
    expect(sparks.every((e) => e.type === 'spark_prompt')).toBe(true)
    expect(sparks).toHaveLength(5)

    const accepted = await getSessionArchive(1, { minSignal: 'accepted' })
    expect(accepted.map((e) => e.data.i)).toEqual([9, 8, 7, 6, 5])

    const tagged = await getSessionArchive(1, { tags: ['tagged'] })
    expect(tagged.map((e) => e.data.i)).toEqual([9, 6, 3, 0])
  })

  it('"before" excludes the boundary and everything newer', async () => {
    const stamps = []
    for (let i = 0; i < 4; i++) {
      const timestamp = stamp()
      stamps.push(timestamp)
      await saveSessionArchive(1, 'spark_prompt', { i }, [], 'accepted')
      await db.sessionArchive
        .where('projectId')
        .equals(1)
        .last()
        .then((row) => db.sessionArchive.update(row.id, { timestamp }))
    }
    const older = await getSessionArchive(1, { before: stamps[2] })
    expect(older.map((e) => e.data.i)).toEqual([1, 0])
  })
})
