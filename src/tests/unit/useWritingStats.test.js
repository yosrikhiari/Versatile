import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useWritingStats } from '@/composables/useWritingStats'

const rows = vi.hoisted(() => ({ value: [] }))

vi.mock('@/services/dbService', () => ({
  getDailyStatsForProjects: vi.fn(async () => rows.value)
}))

/** `dailyGoals` stores the manuscript TOTAL for that date, not the day's output. */
const row = (projectId, date, wordCount) => ({ projectId, date, wordCount, goalWords: 500 })

/** Local ISO day, matching how the composable and db-goals stamp dates. */
function daysAgo(n) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('useWritingStats', () => {
  beforeEach(() => {
    rows.value = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('derives daily output as a delta of running manuscript totals', async () => {
    rows.value = [row(1, daysAgo(2), 100), row(1, daysAgo(1), 450), row(1, daysAgo(0), 700)]

    const stats = useWritingStats()
    await stats.load([1])

    // 100 on the first tracked day, then +350, then +250.
    expect(stats.dailyNet.value.get(daysAgo(2))).toBe(100)
    expect(stats.dailyNet.value.get(daysAgo(1))).toBe(350)
    expect(stats.dailyNet.value.get(daysAgo(0))).toBe(250)
    expect(stats.totalWordsWritten.value).toBe(700)
  })

  it('sums same-day output across projects rather than letting one overwrite the other', async () => {
    rows.value = [row(1, daysAgo(0), 300), row(2, daysAgo(0), 200)]

    const stats = useWritingStats()
    await stats.load([1, 2])

    expect(stats.dailyNet.value.get(daysAgo(0))).toBe(500)
  })

  it('reports a trimming day as negative and excludes it from totals and streaks', async () => {
    rows.value = [row(1, daysAgo(1), 1000), row(1, daysAgo(0), 600)]

    const stats = useWritingStats()
    await stats.load([1])

    expect(stats.dailyNet.value.get(daysAgo(0))).toBe(-400)
    // Only words *added* count toward output and activity.
    expect(stats.totalWordsWritten.value).toBe(1000)
    expect(stats.activeDays.value).toBe(1)
  })

  it('counts a streak of consecutive days and keeps it alive from yesterday', async () => {
    rows.value = [
      row(1, daysAgo(3), 100),
      row(1, daysAgo(2), 200),
      row(1, daysAgo(1), 300)
      // nothing today — the streak should still stand
    ]

    const stats = useWritingStats()
    await stats.load([1])

    expect(stats.streaks.value.current).toBe(3)
    expect(stats.streaks.value.longest).toBe(3)
  })

  it('breaks the current streak once the last writing day is older than yesterday', async () => {
    rows.value = [row(1, daysAgo(9), 100), row(1, daysAgo(8), 200)]

    const stats = useWritingStats()
    await stats.load([1])

    expect(stats.streaks.value.current).toBe(0)
    expect(stats.streaks.value.longest).toBe(2)
  })

  it('treats an untracked day as absent, not as a zero', async () => {
    rows.value = [row(1, daysAgo(0), 500)]

    const stats = useWritingStats()
    await stats.load([1])

    expect(stats.dailyNet.value.has(daysAgo(5))).toBe(false)
    const grid = stats.buildGrid(4)
    const untracked = grid.flat().find((c) => c.date === daysAgo(5))
    expect(untracked).toBeDefined()
    expect(untracked.tracked).toBe(false)
    expect(untracked.net).toBe(0)
  })

  it('builds a grid of 7-day columns ending today', async () => {
    rows.value = [row(1, daysAgo(0), 10)]

    const stats = useWritingStats()
    await stats.load([1])

    const grid = stats.buildGrid(4)
    expect(grid).toHaveLength(4)
    // Every column but the last (which stops at today) is a full week.
    for (const column of grid.slice(0, -1)) expect(column).toHaveLength(7)
    expect(grid.at(-1).at(-1).date).toBe(daysAgo(0))
  })

  it('reports the best single day and the strongest weekday', async () => {
    rows.value = [row(1, daysAgo(2), 100), row(1, daysAgo(1), 1100), row(1, daysAgo(0), 1200)]

    const stats = useWritingStats()
    await stats.load([1])

    expect(stats.bestDay.value).toEqual({ date: daysAgo(1), net: 1000 })
    expect(stats.bestWeekday.value.words).toBe(1000)
  })

  it('returns empty figures with no history at all', async () => {
    const stats = useWritingStats()
    await stats.load([])

    expect(stats.activeDays.value).toBe(0)
    expect(stats.totalWordsWritten.value).toBe(0)
    expect(stats.bestDay.value).toBeNull()
    expect(stats.bestWeekday.value).toBeNull()
    expect(stats.streaks.value).toEqual({ current: 0, longest: 0 })
  })
})
