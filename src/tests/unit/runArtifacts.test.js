/**
 * Group B artifacts — the tables a generation run never touched.
 *
 * From the WAL audit: `snapshots`, `storyStateSnapshots`, and `sessionArchive`
 * were all empty after a thirteen-scene run, so there was no rollback point, no
 * cross-session memory, and no run history.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAddSnapshot = vi.fn()
const mockSaveStateSnapshot = vi.fn()
const mockSaveSessionArchive = vi.fn()

vi.mock('@/services/db-snapshots', () => ({
  addSnapshot: (...a) => mockAddSnapshot(...a)
}))
vi.mock('@/services/db-archive', () => ({
  saveStateSnapshot: (...a) => mockSaveStateSnapshot(...a),
  saveSessionArchive: (...a) => mockSaveSessionArchive(...a)
}))

let snapshotBeforeRun, saveRunStateSnapshot, archiveRun, SIGNAL
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  mockAddSnapshot.mockResolvedValue('snap-id')
  mockSaveStateSnapshot.mockResolvedValue('state-id')
  mockSaveSessionArchive.mockResolvedValue('arch-id')
  const mod = await import('@/services/generation/runArtifacts')
  snapshotBeforeRun = mod.snapshotBeforeRun
  saveRunStateSnapshot = mod.saveRunStateSnapshot
  archiveRun = mod.archiveRun
  SIGNAL = (await import('@/config/archive')).SIGNAL
})

describe('snapshotBeforeRun', () => {
  const sections = [
    { id: 'c1', title: 'One', content: '<p>Existing prose.</p>' },
    { id: 'c2', title: 'Two', content: '<p>More prose.</p>' }
  ]

  it('captures a restore point per chapter with content', async () => {
    const r = await snapshotBeforeRun('p1', sections)
    expect(r.ok).toBe(true)
    expect(r.count).toBe(2)
    expect(mockAddSnapshot).toHaveBeenCalledTimes(2)
    // Per-chapter, because `snapshots` is keyed by [projectId+chapterId] and the
    // restore UI works one chapter at a time.
    expect(mockAddSnapshot).toHaveBeenCalledWith(
      'p1',
      'c1',
      '<p>Existing prose.</p>',
      'Before generation'
    )
  })

  it('skips empty chapters so the restore list stays useful', async () => {
    const r = await snapshotBeforeRun('p1', [
      ...sections,
      { id: 'c3', title: 'Empty', content: '' },
      { id: 'c4', title: 'Whitespace', content: '   ' },
      { id: 'c5', title: 'Missing' }
    ])
    expect(r.count).toBe(2)
    expect(mockAddSnapshot).toHaveBeenCalledTimes(2)
  })

  it('reports failures instead of swallowing them', async () => {
    mockAddSnapshot.mockRejectedValueOnce(new Error('quota exceeded'))
    const r = await snapshotBeforeRun('p1', sections)
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/quota exceeded/)
    // The second chapter still succeeded — one failure must not abort the rest.
    expect(r.count).toBe(1)
  })

  it('never throws on bad input', async () => {
    await expect(snapshotBeforeRun(null, null)).resolves.toMatchObject({ ok: true, count: 0 })
    await expect(snapshotBeforeRun('p1', undefined)).resolves.toMatchObject({ count: 0 })
  })
})

describe('saveRunStateSnapshot', () => {
  it('persists the state useContextRetrieval reads', async () => {
    const r = await saveRunStateSnapshot('p1', { wordCount: 12000 })
    expect(r.ok).toBe(true)
    expect(mockSaveStateSnapshot).toHaveBeenCalledWith('p1', null, { wordCount: 12000 })
  })

  it('reports a failure rather than throwing', async () => {
    mockSaveStateSnapshot.mockRejectedValue(new Error('db closed'))
    const r = await saveRunStateSnapshot('p1', { wordCount: 1 })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/db closed/)
  })

  it('no-ops without state', async () => {
    expect((await saveRunStateSnapshot('p1', null)).ok).toBe(true)
    expect(mockSaveStateSnapshot).not.toHaveBeenCalled()
  })
})

describe('archiveRun', () => {
  it('marks a clean run accepted', async () => {
    await archiveRun('p1', { scenesWritten: 10, wordCount: 12000, violations: [] })
    expect(mockSaveSessionArchive).toHaveBeenCalledWith(
      'p1',
      'session_end',
      expect.objectContaining({ scenesWritten: 10 }),
      ['generation'],
      SIGNAL.ACCEPTED
    )
  })

  it('marks a run with blocking violations partial, not accepted', async () => {
    // getSessionArchive filters on minSignal, so labelling a degraded run
    // "accepted" would feed it back into future context as though it went well.
    await archiveRun('p1', {
      scenesWritten: 5,
      wordCount: 4000,
      violations: [{ severity: 'block', message: 'no metadata' }]
    })
    expect(mockSaveSessionArchive.mock.calls[0][4]).toBe(SIGNAL.PARTIAL)
  })

  it('marks a halted run partial even with no violations', async () => {
    await archiveRun('p1', { scenesWritten: 3, wordCount: 2000, halted: true, violations: [] })
    expect(mockSaveSessionArchive.mock.calls[0][4]).toBe(SIGNAL.PARTIAL)
  })

  it('does not treat warnings as blocking', async () => {
    await archiveRun('p1', {
      scenesWritten: 9,
      wordCount: 9000,
      violations: [{ severity: 'warn', message: 'bible static' }]
    })
    expect(mockSaveSessionArchive.mock.calls[0][4]).toBe(SIGNAL.ACCEPTED)
  })

  it('reports a failure rather than throwing', async () => {
    mockSaveSessionArchive.mockRejectedValue(new Error('bad signal'))
    const r = await archiveRun('p1', { scenesWritten: 1, wordCount: 1 })
    expect(r.ok).toBe(false)
    expect(r.detail).toMatch(/bad signal/)
  })
})
