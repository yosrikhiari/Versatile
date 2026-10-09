import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db, exportDatabase, backupFileName, downloadBackup } from '@/services/db-core'

describe('backupFileName', () => {
  it('names the file by date for the recovery shelf', () => {
    expect(backupFileName(new Date('2026-10-09T12:00:00Z'))).toBe(
      'versatile-recovery-2026-10-09.json'
    )
  })
})

describe('exportDatabase', () => {
  beforeAll(async () => {
    await db.open()
  })

  beforeEach(async () => {
    await db.characters.clear()
  })

  it('dumps every table, including seeded rows', async () => {
    await db.characters.add({ id: 'b1', projectId: 'p1', name: 'Kept' })

    const dump = await exportDatabase()

    expect(Object.keys(dump)).toContain('characters')
    expect(Object.keys(dump)).toContain('projects')
    expect(dump.characters).toHaveLength(1)
    expect(dump.characters[0]).toMatchObject({ id: 'b1', name: 'Kept' })
  })
})

describe('downloadBackup', () => {
  it('reports false when the download shelf throws instead of crashing recovery', () => {
    const original = URL.createObjectURL
    URL.createObjectURL = () => {
      throw new Error('no shelf')
    }
    try {
      // The recovery path treats this as "backup missed", never as a crash.
      expect(downloadBackup({ characters: [] })).toBe(false)
    } finally {
      URL.createObjectURL = original
    }
  })

  it('saves through the download shelf when available', () => {
    expect(downloadBackup({ characters: [] })).toBe(true)
  })
})
