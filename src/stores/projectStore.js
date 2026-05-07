import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getManuscript, saveManuscript, getProject, createProject, updateProject, getAllProjects, updateDailyWordCount, getDailyGoal, getStreakData, getLastSessionData } from '../services/dbService'
import { countWords } from '../utils/textUtils'

export const useProjectStore = defineStore('project', () => {
  const currentProjectId = ref(null)
  const currentProjectName = ref('')
  const currentDescription = ref('')
  const currentCategory = ref('')
  const documentContent = ref('')
  const wordCount = ref(0)
  const sessionWordCount = ref(0)
  const sessionGoal = ref(500)
  const dailyGoal = ref(500)
  const dailyWordCount = ref(0)
  const lastSavedAt = ref(null)
  const lastWrittenAt = ref(null)
  const initialWordCount = ref(0)
  const currentStreak = ref(0)
  const longestStreak = ref(0)
  const lastSessionDate = ref(null)
  const lastSessionWords = ref(0)

  const sessionProgress = computed(() => {
    return Math.min((sessionWordCount.value / sessionGoal.value) * 100, 100)
  })

  const dailyProgress = computed(() => {
    return Math.min((dailyWordCount.value / dailyGoal.value) * 100, 100)
  })

  const lastSaved = computed(() => lastSavedAt.value)

  async function loadProject(id) {
    const project = await getProject(id)
    if (!project) return

    currentProjectId.value = id
    currentProjectName.value = project.name
    currentDescription.value = project.description || ''
    currentCategory.value = project.category || ''
    lastWrittenAt.value = project.updatedAt

    const manuscript = await getManuscript(id)
    if (manuscript) {
      documentContent.value = manuscript.content || ''
      wordCount.value = manuscript.wordCount || 0
      initialWordCount.value = manuscript.wordCount || 0
    }

    await loadDailyGoal()
    await loadStreak()
    await loadLastSession()
  }

  async function loadStreak() {
    if (!currentProjectId.value) return
    const data = await getStreakData(currentProjectId.value)
    currentStreak.value = data.currentStreak || 0
    longestStreak.value = data.longestStreak || 0
  }

  async function loadLastSession() {
    if (!currentProjectId.value) return
    const data = await getLastSessionData(currentProjectId.value)
    if (data) {
      lastSessionDate.value = data.date
      lastSessionWords.value = data.wordCount
    } else {
      lastSessionDate.value = null
      lastSessionWords.value = 0
    }
  }

  async function updateStreakAfterSave() {
    if (!currentProjectId.value) return
    const data = await getStreakData(currentProjectId.value)
    currentStreak.value = data.currentStreak || 0
    longestStreak.value = data.longestStreak || 0
  }

  async function saveDocumentDebounced() {
    if (!currentProjectId.value) return
    try {
      await saveManuscript(currentProjectId.value, documentContent.value)
      lastSavedAt.value = new Date().toISOString()
      await updateDailyWordCount(currentProjectId.value, wordCount.value)
      dailyWordCount.value = wordCount.value
      await updateStreakAfterSave()
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }

  function updateContent(newContent) {
    documentContent.value = newContent
    const words = countWords(newContent)
    wordCount.value = words
    sessionWordCount.value = Math.max(0, words - initialWordCount.value)
  }

  function setSessionGoal(n) {
    sessionGoal.value = n
  }

  function setDailyGoal(n) {
    dailyGoal.value = n
  }

  async function loadDailyGoal() {
    if (!currentProjectId.value) return
    const existing = await getDailyGoal(currentProjectId.value)
    if (existing) {
      dailyGoal.value = existing.goalWords
      dailyWordCount.value = existing.wordCount
    }
  }

  function resetSessionCount() {
    initialWordCount.value = wordCount.value
    sessionWordCount.value = 0
  }

  async function updateDailyWordCountFromTotal() {
    if (!currentProjectId.value) return
    dailyWordCount.value = wordCount.value
    await updateDailyWordCount(currentProjectId.value, wordCount.value)
  }

  async function createNewProject(name, category = '', description = '') {
    const id = await createProject(name, category, description)
    await loadProject(id)
    return id
  }

  async function updateProjectInfo(data) {
    if (!currentProjectId.value) return
    await updateProject(currentProjectId.value, data)
    if (data.name !== undefined) currentProjectName.value = data.name
    if (data.category !== undefined) currentCategory.value = data.category
    if (data.description !== undefined) currentDescription.value = data.description
  }

  async function loadLastProject() {
    const projects = await getAllProjects()
    if (projects.length > 0) {
      const lastProject = projects.reduce((latest, p) => 
        new Date(p.updatedAt) > new Date(latest.updatedAt) ? p : latest
      )
      await loadProject(lastProject.id)
      return true
    }
    return false
  }

  return {
    currentProjectId,
    currentProjectName,
    currentDescription,
    currentCategory,
    documentContent,
    wordCount,
    sessionWordCount,
    sessionGoal,
    dailyGoal,
    dailyWordCount,
    lastSavedAt,
    lastSaved,
    lastWrittenAt,
    sessionProgress,
    dailyProgress,
    currentStreak,
    longestStreak,
    lastSessionDate,
    lastSessionWords,
    loadProject,
    saveDocumentDebounced,
    updateContent,
    setSessionGoal,
    setDailyGoal,
    loadDailyGoal,
    resetSessionCount,
    updateDailyWordCountFromTotal,
    createNewProject,
    updateProjectInfo,
    loadLastProject
  }
})
