import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getManuscript,
  saveManuscript,
  getProject,
  createProject,
  updateProject,
  getAllProjects,
  updateDailyWordCount,
  getDailyGoal,
  getStreakData,
  getLastSessionData,
  saveAuthorProfile,
  getAuthorProfile
} from '../services/dbService'
import { countWords, stripHtmlTags } from '../utils/textUtils'
import { WORKSPACE_TYPES as WORKSPACE_TYPES_RAW, WORKSPACE_TERMINOLOGY as WORKSPACE_TERMINOLOGY_RAW } from '../config/workspace'
const WORKSPACE_TYPES = WORKSPACE_TYPES_RAW as Record<string, string>
const WORKSPACE_TERMINOLOGY = WORKSPACE_TERMINOLOGY_RAW as Record<string, any>
import { STORAGE_KEYS } from '../config/storageKeys'
import { useLocalStorage } from '../utils/useLocalStorage'
import { getSyncEngine } from '../services/sync-engine'
import { DOCUMENT_PROMPTS } from '../config/documentPrompts'

export const useProjectStore = defineStore('project', () => {
  const currentProjectId = ref<any | null>(null)
  const currentProjectName = ref('')
  const currentDescription = ref('')
  const currentCategory = ref('')
  const documentContent = ref('')
  const documentContentRaw = computed(() => stripHtmlTags(documentContent.value))
  const wordCount = ref(0)
  const sessionWordCount = ref(0)
  const sessionGoal = useLocalStorage(STORAGE_KEYS.SESSION_GOAL, 500)
  const dailyGoal = ref(500)
  const dailyWordCount = ref(0)
  const lastSavedAt = ref<any | null>(null)
  const lastWrittenAt = ref<any | null>(null)
  const initialWordCount = ref(0)
  const currentStreak = ref(0)
  const longestStreak = ref(0)
  const lastSessionDate = ref<any | null>(null)
  const lastSessionWords = ref(0)
  const authorVoiceProfile = ref<any | null>(null)
  const lastSessionRecap = ref<any | null>(null)
  const promptOverrides = ref<any>({})

  function getActivePrompts(categoryType: any) {
    const base = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative
    const overrides = promptOverrides.value
    const result: any = { ...base }
    for (const role of ['writer', 'critic', 'revisor', 'director']) {
      if (overrides[role]) {
        result[role] = overrides[role]
      }
    }
    return result
  }

  async function loadPromptOverrides() {
    if (!currentProjectId.value) return
    const project = await getProject(currentProjectId.value)
    if (project?.promptOverrides) {
      promptOverrides.value = { ...project.promptOverrides }
    }
  }

  async function savePromptOverrides(overrides: any) {
    if (!currentProjectId.value) return
    promptOverrides.value = { ...overrides }
    await updateProject(currentProjectId.value, { promptOverrides: overrides })
  }

  const activeWorkspaceType = computed(() => {
    const val = (currentCategory.value || '').toLowerCase().trim()
    const types = Object.values(WORKSPACE_TYPES)
    return types.includes(val) ? val : WORKSPACE_TYPES.CREATIVE
  })

  const terminology = computed(() => {
    return WORKSPACE_TERMINOLOGY[activeWorkspaceType.value]
  })

  const sessionProgress = computed(() => {
    return Math.min((sessionWordCount.value / sessionGoal.value) * 100, 100)
  })

  const dailyProgress = computed(() => {
    return Math.min((dailyWordCount.value / dailyGoal.value) * 100, 100)
  })

  const lastSaved = computed(() => lastSavedAt.value)

  async function loadProject(id: any) {
    const [project, manuscript] = await Promise.all([getProject(id), getManuscript(id)])
    if (!project) return

    currentProjectId.value = id
    currentProjectName.value = project.name
    currentDescription.value = project.description || ''
    currentCategory.value = project.category || ''
    lastWrittenAt.value = project.updatedAt

    if (manuscript) {
      documentContent.value = manuscript.content || ''
      wordCount.value = manuscript.wordCount || 0
      initialWordCount.value = manuscript.wordCount || 0
    }

    await Promise.all([loadDailyGoal(), loadStreak(), loadLastSession(), loadPromptOverrides()])
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

  async function loadAuthorProfile() {
    if (!currentProjectId.value) return
    authorVoiceProfile.value = await getAuthorProfile(currentProjectId.value)
  }

  async function updateAuthorVoiceProfile(data: any) {
    if (!currentProjectId.value) return
    await saveAuthorProfile(currentProjectId.value, data)
    authorVoiceProfile.value = { ...authorVoiceProfile.value, ...data }
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
      autoSnapshot()
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }

  let wordCountTimer: any = null

  function debouncedUpdateWordCount(newContent: any, plainText: any) {
    clearTimeout(wordCountTimer)
    wordCountTimer = setTimeout(() => {
      const text = plainText || stripHtmlTags(newContent)
      const words = countWords(text)
      wordCount.value = words
      sessionWordCount.value = Math.max(0, words - initialWordCount.value)
    }, 300)
  }

  let snapshotTimer: any = null
  function autoSnapshot() {
    if (snapshotTimer) clearTimeout(snapshotTimer)
    snapshotTimer = setTimeout(async () => {
      try {
        const { useStateSummarizer } = await import('../composables/useStateSummarizer')
        const { useArchiveStore } = await import('./archiveStore')
        const { summarize, snapshotToContextString } = useStateSummarizer()
        const snapshot = summarize()
        if (snapshot) {
          const archiveStore = useArchiveStore()
          await archiveStore.saveEndOfSessionState(
            currentProjectId.value,
            'auto_snapshot',
            snapshot
          )
        }
      } catch (e) {
        console.error('[projectStore] autoSnapshot failed:', e)
      }
    }, 2000)
  }

  function updateContent(newContent: any, plainText: any) {
    documentContent.value = newContent
    debouncedUpdateWordCount(newContent, plainText)
  }

  function setSessionGoal(n: any) {
    sessionGoal.value = n
  }

  function setDailyGoal(n: any) {
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

  async function createNewProject(name: any, category: any = '', description: any = '', blueprintId: any = null) {
    getSyncEngine().clearStoryId()
    const id = await createProject(name, category, description)
    await loadProject(id)

    try {
      await updateAuthorVoiceProfile({
        data: {
          genreFocus: category,
          sessionCount: 0,
          totalWordsWritten: 0,
          favoriteLenses: [],
          rejectedLenses: [],
          sparkTypesUsed: [],
          commonStrengths: [],
          commonWeaknesses: []
        }
      })
    } catch (e) {
      console.error('[projectStore] Failed to init author profile:', e)
    }

    if (blueprintId) {
      try {
        const { BLUEPRINTS } = await import('../config/blueprints')
        const { useManuscriptStore } = await import('./manuscriptStore')
        const categoryBlueprints = BLUEPRINTS[category] || []
        const blueprint: any = categoryBlueprints.find((b: any) => b.id === blueprintId)
        if (blueprint) {
          const manuscriptStore = useManuscriptStore()
          for (const section of blueprint.sections) {

            const sectionId = await manuscriptStore.addSectionData(id, {
              title: section.title,
              summary: section.summary,
              status: 'draft'
            })
            for (const sub of section.subsections) {
              await manuscriptStore.addSubsectionData(id, sectionId, {
                title: sub.title,
                summary: sub.summary,
                content: sub.content,
                status: 'draft'
              })
            }
          }
        }
      } catch (err) {
        console.error('Failed to apply blueprint during project creation:', err)
      }
    }

    return id
  }

  async function updateProjectInfo(data: any) {
    if (!currentProjectId.value) return
    await updateProject(currentProjectId.value, data)
    if (data.name !== undefined) currentProjectName.value = data.name
    if (data.category !== undefined) currentCategory.value = data.category
    if (data.description !== undefined) currentDescription.value = data.description
  }

  async function loadLastProject() {
    const projects = await getAllProjects()
    if (projects.length > 0) {
      const lastProject = projects.reduce((latest: any, p: any) =>
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
    activeWorkspaceType,
    terminology,
    documentContent,
    documentContentRaw,
    wordCount,
    initialWordCount,
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
    authorVoiceProfile,
    lastSessionRecap,
    promptOverrides,
    getActivePrompts,
    loadPromptOverrides,
    savePromptOverrides,
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
    loadLastProject,
    loadAuthorProfile,
    updateAuthorVoiceProfile
  }
})
