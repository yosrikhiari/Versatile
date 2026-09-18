import { describe, it, expect, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { DexieSaver } from '@/composables/generation/graph/dexieSaver'
import { emptyCheckpoint } from '@langchain/langgraph-checkpoint'

// A private Dexie instance with the same store string as schema v54, so this
// suite does not depend on (or dirty) the app database.
function makeTable() {
  const db = new Dexie(`saver-test-${Math.random().toString(36).slice(2)}`)
  db.version(1).stores({ graphCheckpoints: 'threadId, projectId, updatedAt' })
  return db.table('graphCheckpoints')
}

const cfg = (threadId, checkpointId) => ({
  configurable: {
    thread_id: threadId,
    checkpoint_ns: '',
    ...(checkpointId ? { checkpoint_id: checkpointId } : {})
  }
})

describe('DexieSaver', () => {
  let table
  beforeEach(() => {
    table = makeTable()
  })

  it('round-trips a checkpoint through Dexie and hydrates a fresh instance from it', async () => {
    const saver = new DexieSaver(table, 'p1')
    const cp = { ...emptyCheckpoint(), id: 'cp-1', channel_values: { scenes: [{ index: 0 }] } }
    const saved = await saver.put(cfg('t1'), cp, { source: 'loop', step: 1, parents: {} })
    expect(saved.configurable.checkpoint_id).toBe('cp-1')

    const rows = await table.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ threadId: 't1', projectId: 'p1' })

    // A new saver (a new tab) sees the checkpoint without ever having put it.
    const fresh = new DexieSaver(table, 'p1')
    const tuple = await fresh.getTuple(cfg('t1'))
    expect(tuple.checkpoint.id).toBe('cp-1')
    expect(tuple.checkpoint.channel_values.scenes).toEqual([{ index: 0 }])
  })

  it('the latest checkpoint wins and pending writes survive a reload', async () => {
    const saver = new DexieSaver(table, 'p1')
    await saver.put(
      cfg('t1'),
      { ...emptyCheckpoint(), id: 'cp-1' },
      { source: 'loop', step: 1, parents: {} }
    )
    const second = await saver.put(
      cfg('t1', 'cp-1'),
      { ...emptyCheckpoint(), id: 'cp-2' },
      { source: 'loop', step: 2, parents: {} }
    )
    await saver.putWrites(second, [['scenes', [{ index: 1 }]]], 'task-a')

    const fresh = new DexieSaver(table, 'p1')
    const tuple = await fresh.getTuple(cfg('t1'))
    expect(tuple.checkpoint.id).toBe('cp-2')
    expect(tuple.parentConfig.configurable.checkpoint_id).toBe('cp-1')
    expect(tuple.pendingWrites).toEqual([['task-a', 'scenes', [{ index: 1 }]]])

    const listed = []
    for await (const t of fresh.list(cfg('t1'))) listed.push(t.checkpoint.id)
    expect(listed).toEqual(['cp-2', 'cp-1'])
  })

  it('deleteThread removes the row', async () => {
    const saver = new DexieSaver(table, 'p1')
    await saver.put(
      cfg('t1'),
      { ...emptyCheckpoint(), id: 'cp-1' },
      { source: 'loop', step: 1, parents: {} }
    )
    await saver.deleteThread('t1')
    expect(await table.count()).toBe(0)
    expect(await new DexieSaver(table, 'p1').getTuple(cfg('t1'))).toBeUndefined()
  })
})
