import { db } from './db-core'

export function getTodayDateString() {
  return new Date().toISOString().split('T')[0]
}

export async function getDailyGoal(projectId) {
  const today = getTodayDateString()
  return db.dailyGoals.where({ projectId, date: today }).first()
}

export async function setDailyGoal(projectId, goalWords) {
  const today = getTodayDateString()
  const existing = await db.dailyGoals.where({ projectId, date: today }).first()
  if (existing) {
    return db.dailyGoals.update(existing.id, { goalWords })
  }
  return db.dailyGoals.add({ projectId, date: today, goalWords, wordCount: 0 })
}

export async function updateDailyWordCount(projectId, wordCount) {
  const today = getTodayDateString()
  const existing = await db.dailyGoals.where({ projectId, date: today }).first()
  if (existing) {
    return db.dailyGoals.update(existing.id, { wordCount })
  }
  return db.dailyGoals.add({ projectId, date: today, goalWords: 500, wordCount })
}

export async function getStreakData(projectId) {
  const entries = await db.dailyGoals
    .where('projectId')
    .equals(projectId)
    .filter(e => e.wordCount > 0)
    .toArray()
    
  if (entries.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastWrittenDate: null }
  }
    
  entries.sort((a, b) => b.date.localeCompare(a.date))
    
  const today = getTodayDateString()
  const yesterday = getYesterdayDateString()
    
  let currentStreak = 0
  let longestStreak = 0
  let tempStreak = 0
  let prevDate = null
    
  for (const entry of entries) {
    if (prevDate === null) {
      if (entry.date === today || entry.date === yesterday) {
        currentStreak = 1
      } else {
        currentStreak = 0
      }
      tempStreak = 1
    } else {
      const daysDiff = dateDiff(prevDate, entry.date)
      if (daysDiff === 1) {
        tempStreak++
        if (currentStreak > 0) currentStreak++
      } else {
        longestStreak = Math.max(longestStreak, tempStreak)
        tempStreak = 1
        if (currentStreak > 0) currentStreak = 0
      }
    }
    prevDate = entry.date
  }
    
  longestStreak = Math.max(longestStreak, tempStreak)
  if (currentStreak > 0) currentStreak = longestStreak
    
  return {
    currentStreak,
    longestStreak,
    lastWrittenDate: entries[0].date
  }
}

function getYesterdayDateString() {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
}

function dateDiff(dateStr1, dateStr2) {
  const d1 = new Date(dateStr1)
  const d2 = new Date(dateStr2)
  const diffTime = Math.abs(d1.getTime() - d2.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export async function getLastSessionData(projectId) {
  const entries = await db.dailyGoals
    .where('projectId')
    .equals(projectId)
    .filter(e => e.wordCount > 0)
    .toArray()
    
  if (entries.length === 0) return null
    
  entries.sort((a, b) => b.date.localeCompare(a.date))
    
  const today = getTodayDateString()
  if (entries[0].date === today) return null
    
  return {
    date: entries[0].date,
    wordCount: entries[0].wordCount
  }
}
