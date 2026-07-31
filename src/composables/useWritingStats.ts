import { ref, computed } from 'vue'
import { getDailyStatsForProjects } from '../services/dbService'

export interface DayCell {
  /** ISO `YYYY-MM-DD`. */
  date: string
  /** Net words added that day across all projects. Negative on a trimming day. */
  net: number
  /** Whether any project recorded a row that day. */
  tracked: boolean
}

export interface ProjectSeries {
  projectId: string | number
  /** Manuscript total on each recorded day, oldest first — a growth curve. */
  points: number[]
}

/** Local `YYYY-MM-DD`, matching how `db-goals` stamps rows. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/**
 * Writing history derived from the `dailyGoals` table.
 *
 * The stored `wordCount` is the manuscript's **total** on that date, not the
 * words written that day. Daily output is therefore a day-over-day delta per
 * project, summed across projects. A day where more was cut than added yields a
 * negative net; that is real and is reported as-is rather than hidden, though
 * only positive nets carry heatmap intensity (the ramp encodes words *added*).
 *
 * Days with no row are genuinely untracked, not zero — the distinction matters
 * for streaks and for the heatmap's empty cell.
 */
export function useWritingStats() {
  const loading = ref(false)
  /** Net words by ISO day, across all projects. */
  const dailyNet = ref<Map<string, number>>(new Map())
  const trackedDays = ref<Set<string>>(new Set())
  const perProject = ref<ProjectSeries[]>([])

  async function load(projectIds: Array<string | number>) {
    loading.value = true
    try {
      const rows = await getDailyStatsForProjects(projectIds)

      const byProject = new Map<string, any[]>()
      for (const row of rows) {
        const key = String(row.projectId)
        if (!byProject.has(key)) byProject.set(key, [])
        byProject.get(key)!.push(row)
      }

      const net = new Map<string, number>()
      const tracked = new Set<string>()
      const series: ProjectSeries[] = []

      for (const [projectId, entries] of byProject) {
        entries.sort((a, b) => String(a.date).localeCompare(String(b.date)))

        let previousTotal = 0
        for (const entry of entries) {
          const total = Number(entry.wordCount) || 0
          const delta = total - previousTotal
          previousTotal = total

          tracked.add(entry.date)
          net.set(entry.date, (net.get(entry.date) || 0) + delta)
        }

        series.push({ projectId, points: entries.map((e) => Number(e.wordCount) || 0) })
      }

      dailyNet.value = net
      trackedDays.value = tracked
      perProject.value = series
    } finally {
      loading.value = false
    }
  }

  /**
   * `weeks` columns of 7 days ending today, aligned so each column starts on a
   * Monday — the shape a contribution grid needs.
   */
  function buildGrid(weeks = 26): DayCell[][] {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Walk back to the Monday on or before today, then back `weeks - 1` more.
    const daysSinceMonday = (today.getDay() + 6) % 7
    const lastMonday = addDays(today, -daysSinceMonday)
    const start = addDays(lastMonday, -(weeks - 1) * 7)

    const columns: DayCell[][] = []
    for (let w = 0; w < weeks; w++) {
      const column: DayCell[] = []
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d)
        if (date > today) break
        const key = isoDay(date)
        column.push({
          date: key,
          net: dailyNet.value.get(key) ?? 0,
          tracked: trackedDays.value.has(key)
        })
      }
      columns.push(column)
    }
    return columns
  }

  /** Only positive days carry intensity — the ramp encodes words added. */
  const positiveDays = computed(() =>
    [...dailyNet.value.entries()].filter(([, n]) => n > 0).sort((a, b) => a[0].localeCompare(b[0]))
  )

  const totalWordsWritten = computed(() =>
    positiveDays.value.reduce((sum, [, n]) => sum + n, 0)
  )

  const activeDays = computed(() => positiveDays.value.length)

  const bestDay = computed(() => {
    let best: { date: string; net: number } | null = null
    for (const [date, net] of positiveDays.value) {
      if (!best || net > best.net) best = { date, net }
    }
    return best
  })

  const wordsThisWeek = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const monday = addDays(today, -((today.getDay() + 6) % 7))
    return positiveDays.value
      .filter(([date]) => date >= isoDay(monday))
      .reduce((sum, [, n]) => sum + n, 0)
  })

  /**
   * Streaks over days with positive output. Counted on consecutive calendar
   * days; the current streak stays alive if the last writing day was today or
   * yesterday, so an evening writer does not lose it at midnight.
   */
  const streaks = computed(() => {
    const days = positiveDays.value.map(([d]) => d)
    if (!days.length) return { current: 0, longest: 0 }

    let longest = 1
    let run = 1
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1])
      const cur = new Date(days[i])
      const gap = Math.round((cur.getTime() - prev.getTime()) / 86_400_000)
      run = gap === 1 ? run + 1 : 1
      if (run > longest) longest = run
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const last = days[days.length - 1]
    const isRecent = last === isoDay(today) || last === isoDay(addDays(today, -1))

    let current = 0
    if (isRecent) {
      current = 1
      for (let i = days.length - 1; i > 0; i--) {
        const gap = Math.round(
          (new Date(days[i]).getTime() - new Date(days[i - 1]).getTime()) / 86_400_000
        )
        if (gap === 1) current++
        else break
      }
    }
    return { current, longest }
  })

  /** Weekday with the most words written, for a "you write best on ___" line. */
  const bestWeekday = computed(() => {
    const NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const totals = new Array(7).fill(0)
    for (const [date, net] of positiveDays.value) {
      totals[new Date(date).getDay()] += net
    }
    const peak = Math.max(...totals)
    if (peak <= 0) return null
    return { name: NAMES[totals.indexOf(peak)], words: peak }
  })

  function seriesFor(projectId: string | number): number[] {
    return perProject.value.find((s) => String(s.projectId) === String(projectId))?.points || []
  }

  return {
    loading,
    load,
    buildGrid,
    seriesFor,
    dailyNet,
    totalWordsWritten,
    activeDays,
    bestDay,
    wordsThisWeek,
    streaks,
    bestWeekday
  }
}
