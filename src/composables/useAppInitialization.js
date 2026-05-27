import { ref } from 'vue'
import { checkOllamaConnection } from '../services/ollamaService'
import { getOllamaModel, getOllamaEndpoint } from '../config/ollama'
import { useProjectStore } from '../stores/projectStore'
import { useSparkStore } from '../stores/sparkStore'
import { usePolishStore } from '../stores/polishStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useArchiveStore } from '../stores/archiveStore'
import { getLatestStateSnapshot } from '../services/dbService'
import { useStateSummarizer } from './useStateSummarizer'
import { useStoryDocuments } from './useStoryDocuments'

export function useAppInitialization() {
  const projectStore = useProjectStore()
  const sparkStore = useSparkStore()
  const polishStore = usePolishStore()
  const storyBibleStore = useStoryBibleStore()
  const manuscriptStore = useManuscriptStore()

  const ollamaAvailable = ref(true)
  const modelNotFound = ref(false)
  const showModelBanner = ref(false)
  const hasLoaded = ref(false)

  async function checkModelAvailability() {
    try {
      const response = await fetch(`${getOllamaEndpoint()}/api/tags`)
      if (response.ok) {
        const data = await response.json()
        const modelNames = data.models?.map(m => m.name) || []
        if (!modelNames.includes(getOllamaModel())) {
          modelNotFound.value = true
          showModelBanner.value = true
        }
      }
    } catch (e) {
      console.error('[useAppInitialization] checkModelAvailability failed:', e)
    }
  }

  async function initializeApp() {
    const ollamaOk = await checkOllamaConnection()
    ollamaAvailable.value = ollamaOk
    
    if (ollamaOk) {
      await checkModelAvailability()
    }
    
    const hasProject = await projectStore.loadLastProject()
    if (!hasProject && !isOnboardingDismissed()) {
      return { showOnboarding: true }
    } else if (projectStore.currentProjectId) {
      await loadProjectData()
    }
    
    hasLoaded.value = true
    return { showOnboarding: false }
  }

  async function loadProjectData() {
    if (!projectStore.currentProjectId) return
    
    await sparkStore.loadHistory(projectStore.currentProjectId)
    await polishStore.loadAnnotations(projectStore.currentProjectId)
    await polishStore.loadSnippets(projectStore.currentProjectId)
    await storyBibleStore.loadAll(projectStore.currentProjectId)
    await manuscriptStore.loadManuscript(projectStore.currentProjectId)
    sparkStore.setProjectId(projectStore.currentProjectId)

    const archiveStore = useArchiveStore()
    await projectStore.loadAuthorProfile()
    await archiveStore.loadStateSnapshots(projectStore.currentProjectId)
    const { snapshotToRecap } = useStateSummarizer()
    const latest = await getLatestStateSnapshot(projectStore.currentProjectId)
    if (latest) {
      projectStore.lastSessionRecap = snapshotToRecap(latest.state)
    }

    const { regenerateAllDocuments } = useStoryDocuments()
    await regenerateAllDocuments(projectStore.currentProjectId)
  }

  function isOnboardingDismissed() {
    return localStorage.getItem('versatile_onboarding_v2') === 'done'
  }

  async function onOnboardingComplete() {
    localStorage.setItem('versatile_onboarding_v2', 'done')
    
    if (projectStore.currentProjectId) {
      await loadProjectData()
    }
    
    return { showOnboarding: false }
  }

  function onOnboardingSkip() {
    localStorage.setItem('versatile_onboarding_v2', 'done')
    return { showOnboarding: false }
  }

  return {
    ollamaAvailable,
    modelNotFound,
    showModelBanner,
    hasLoaded,
    checkModelAvailability,
    initializeApp,
    loadProjectData,
    isOnboardingDismissed,
    onOnboardingComplete,
    onOnboardingSkip
  }
}
