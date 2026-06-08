import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/db-core', () => ({
  db: {
    dailyGoals: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: vi.fn(),
          filter: vi.fn(() => ({ toArray: vi.fn() })),
          toArray: vi.fn()
        }))
      })),
      add: vi.fn(),
      update: vi.fn()
    },
    projects: { add: vi.fn() },
    manuscripts: { add: vi.fn() }
  }
}))

describe('db-goals', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('getTodayDateString returns ISO date string', async () => {
    const { getTodayDateString } = await import('../../services/db-goals')
    const result = getTodayDateString()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  describe('getStreakData', () => {
    it('returns zeros when no entries', async () => {
      const { db } = await import('../../services/db-core')
      db.dailyGoals.where.mockReturnValue({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) }))
        }))
      })
      const { getStreakData } = await import('../../services/db-goals')
      const result = await getStreakData('proj-1')
      expect(result).toEqual({ currentStreak: 0, longestStreak: 0, lastWrittenDate: null })
    })

    it('calculates streak from consecutive days', async () => {
      const { db } = await import('../../services/db-core')
      const entries = [
        { date: '2026-06-08', wordCount: 500 },
        { date: '2026-06-07', wordCount: 300 },
        { date: '2026-06-06', wordCount: 200 }
      ]
      db.dailyGoals.where.mockReturnValue({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(entries) }))
        }))
      })
      const { getStreakData } = await import('../../services/db-goals')
      const result = await getStreakData('proj-1')
      expect(result.longestStreak).toBeGreaterThanOrEqual(3)
      expect(result.lastWrittenDate).toBe('2026-06-08')
    })

    it('handles gaps in writing days', async () => {
      const { db } = await import('../../services/db-core')
      const entries = [
        { date: '2026-06-08', wordCount: 500 },
        { date: '2026-06-05', wordCount: 300 },
        { date: '2026-06-04', wordCount: 200 },
        { date: '2026-06-03', wordCount: 100 }
      ]
      db.dailyGoals.where.mockReturnValue({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(entries) }))
        }))
      })
      const { getStreakData } = await import('../../services/db-goals')
      const result = await getStreakData('proj-1')
      expect(result.longestStreak).toBeGreaterThanOrEqual(3)
    })
  })

  describe('getLastSessionData', () => {
    it('returns null when no entries', async () => {
      const { db } = await import('../../services/db-core')
      db.dailyGoals.where.mockReturnValue({
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) }))
        }))
      })
      const { getLastSessionData } = await import('../../services/db-goals')
      expect(await getLastSessionData('proj-1')).toBeNull()
    })
  })
})
