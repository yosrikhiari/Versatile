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
import {
  WORKSPACE_TYPES as WORKSPACE_TYPES_RAW,
  WORKSPACE_TERMINOLOGY as WORKSPACE_TERMINOLOGY_RAW
} from '../config/workspace'
const WORKSPACE_TYPES = WORKSPACE_TYPES_RAW as Record<string, string>
const WORKSPACE_TERMINOLOGY = WORKSPACE_TERMINOLOGY_RAW as Record<string, any>
import { STORAGE_KEYS } from '../config/storageKeys'
import { useLocalStorage } from '../utils/useLocalStorage'
import { getSyncEngine } from '../services/sync-engine'
import { useAuthStore } from './authStore'
import { useManuscriptStore } from './manuscriptStore'
import { DOCUMENT_PROMPTS } from '../config/documentPrompts'

export const useProjectStore = defineStore('project', () => {
  const currentProjectId = ref<any | null>(null)
  const currentProjectName = ref('')
  const currentDescription = ref('')
  const currentCategory = ref('')
  /** Free-text genre ("Fantasy, Mystery"). `category` is the workspace type. */
  const currentGenre = ref('')
  const documentContent = ref('')
  const documentContentRaw = computed(() => stripHtmlTags(documentContent.value))
  const wordCount = ref(0)
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
    const cleanOverrides = JSON.parse(JSON.stringify(overrides))
    promptOverrides.value = { ...cleanOverrides }
    await updateProject(currentProjectId.value, { promptOverrides: cleanOverrides })
  }

  const activeWorkspaceType = computed(() => {
    const val = (currentCategory.value || '').toLowerCase().trim()
    const types = Object.values(WORKSPACE_TYPES)
    return types.includes(val) ? val : WORKSPACE_TYPES.CREATIVE
  })

  const terminology = computed(() => {
    return WORKSPACE_TERMINOLOGY[activeWorkspaceType.value]
  })

  /**
   * The structure vocabulary with lower-case forms ready for running text:
   * "No chapters yet", "3 chapters · 4 scenes". Components read these instead
   * of hard-coding "section"/"subsection", so a novel says Chapters/Scenes and
   * a screenplay says Scenes/Beats everywhere.
   */
  const structureTerms = computed(() => {
    const t = terminology.value
    return {
      sections: t.sections,
      section: t.section,
      subsections: t.subsections,
      subsection: t.subsection,
      sectionsLc: t.sections.toLowerCase(),
      sectionLc: t.section.toLowerCase(),
      subsectionsLc: t.subsections.toLowerCase(),
      subsectionLc: t.subsection.toLowerCase()
    }
  })

  const sessionProgress = computed(() => {
    return Math.min((sessionWordCount.value / sessionGoal.value) * 100, 100)
  })

  const dailyProgress = computed(() => {
    return Math.min((dailyWordCount.value / dailyGoal.value) * 100, 100)
  })

  const lastSaved = computed(() => lastSavedAt.value)

  /**
   * The whole manuscript: root document plus every section and subsection.
   * `wordCount` alone is the root document, which is empty for anyone who
   * writes in chapters. Progress surfaces read this one.
   */
  const manuscriptWordCount = computed(
    () => wordCount.value + useManuscriptStore().structuredWordCount
  )
  const sessionWordCount = computed(() =>
    Math.max(0, manuscriptWordCount.value - initialWordCount.value)
  )

  async function loadProject(id: any) {
    const [project, manuscript] = await Promise.all([getProject(id), getManuscript(id)])
    if (!project) return

    currentProjectId.value = id
    currentProjectName.value = project.name
    // `synopsis` is the pre-fix column name; older rows still carry it.
    currentDescription.value = project.description || project.synopsis || ''
    currentCategory.value = project.category || ''
    currentGenre.value = project.genre || ''
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

  // Immediate write — the actual debounce lives in useFlowSave's 10s
  // scheduleSave timer, which calls this. (Previously misnamed
  // saveDocumentDebounced despite containing no timer.)
  async function saveDocumentNow() {
    if (!currentProjectId.value) return
    try {
      await saveManuscript(currentProjectId.value, documentContent.value)
      await recordProgress()
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }

  /**
   * Bookkeeping that follows any manuscript write — root, section or
   * subsection: the "Saved" mark, today's total for the goal bar and the
   * heatmap, the streak, and the periodic snapshot. Section saves happen in
   * `useFlowSave`, which calls this so writing in chapters counts.
   */
  async function recordProgress() {
    if (!currentProjectId.value) return
    lastSavedAt.value = new Date().toISOString()
    const total = manuscriptWordCount.value
    // Denormalised onto the project row so the workspace index can show the
    // whole manuscript without loading every section of every project.
    await updateProject(currentProjectId.value, { wordCount: total })
    await updateDailyWordCount(currentProjectId.value, total)
    dailyWordCount.value = total
    await updateStreakAfterSave()
    autoSnapshot()
  }

  let wordCountTimer: any = null

  function debouncedUpdateWordCount(newContent: any, plainText: any) {
    clearTimeout(wordCountTimer)
    wordCountTimer = setTimeout(() => {
      const text = plainText || stripHtmlTags(newContent)
      wordCount.value = countWords(text)
    }, 300)
  }

  /** Minimum gap between automatic story-state snapshots. */
  const AUTO_SNAPSHOT_INTERVAL_MS = 5 * 60_000

  let snapshotTimer: any = null
  let lastAutoSnapshotAt = 0
  let lastAutoSnapshotKey = ''

  /**
   * Story-state snapshot after a save — throttled, and skipped when the
   * summary has not changed.
   *
   * This used to fire two seconds after every autosave and file each one as a
   * "session end" in the archive, so a writer saw a new "Writing session" row
   * every time they paused, the history table grew by one row per pause, and
   * each write re-read the whole table. The real session end is recorded by
   * the flow store when a session actually ends.
   */
  function autoSnapshot() {
    if (snapshotTimer) clearTimeout(snapshotTimer)
    const wait = Math.max(2000, AUTO_SNAPSHOT_INTERVAL_MS - (Date.now() - lastAutoSnapshotAt))
    snapshotTimer = setTimeout(async () => {
      try {
        const { useStateSummarizer } = await import('../composables/useStateSummarizer')
        const { useArchiveStore } = await import('./archiveStore')
        const { summarize } = useStateSummarizer()
        const snapshot = summarize()
        if (!snapshot) return
        const key = JSON.stringify(snapshot)
        if (key === lastAutoSnapshotKey) return
        lastAutoSnapshotKey = key
        lastAutoSnapshotAt = Date.now()
        await useArchiveStore().saveStateSnapshot(currentProjectId.value, 'auto_snapshot', snapshot)
      } catch (e) {
        console.error('[projectStore] autoSnapshot failed:', e)
      }
    }, wait)
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
    initialWordCount.value = manuscriptWordCount.value
  }

  async function updateDailyWordCountFromTotal() {
    if (!currentProjectId.value) return
    const total = manuscriptWordCount.value
    dailyWordCount.value = total
    await updateDailyWordCount(currentProjectId.value, total)
  }

  async function createNewProject(
    name: any,
    category: any = '',
    description: any = '',
    blueprintId: any = null
  ) {
    getSyncEngine().clearStoryId()

    // Owner must be stamped at creation. `createProject`'s `userId` defaults to
    // null, and `getAllProjects(userId)` filters on it — so a project made here
    // (onboarding, "Create new project") was written unowned and then vanished
    // from the workspace list and the project switcher. It was only reachable
    // by loading its id directly, which is why the header could name a project
    // the switcher refused to show.
    const authStore = useAuthStore()
    const ownerId = authStore.localUser?.id ?? authStore.user?.id ?? null

    const id = await createProject(name, '', description, ownerId, category)
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
    if (data.genre !== undefined) currentGenre.value = data.genre
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
    currentGenre,
    activeWorkspaceType,
    terminology,
    structureTerms,
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
    manuscriptWordCount,
    recordProgress,
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
    saveDocumentNow,
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
