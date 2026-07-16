import { ref } from 'vue'
import { checkOllamaConnection } from '../services/ollamaService'
import { getOllamaEndpoint, DEFAULT_MODEL } from '../config/ollama'
import { useSettingsStore } from '../stores/settingsStore'
import { useProjectStore } from '../stores/projectStore'
import { useSparkStore } from '../stores/sparkStore'
import { usePolishStore } from '../stores/polishStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useArchiveStore } from '../stores/archiveStore'
import { getLatestStateSnapshot } from '../services/dbService'
import { useStateSummarizer } from './useStateSummarizer'
import { useStoryDocuments } from './useStoryDocuments'
import { STORAGE_KEYS } from '../config/storageKeys'
import { useLocalStorage } from './useLocalStorage'
import { resume as resumeEmbeddingQueue } from '../services/embeddingQueue'
import { markStale, pruneEmbeddingCache } from '../services/researchDb'
import { EMBEDDING_DEFAULTS, EMBEDDING_VERSION } from '../config/ai'

export function useAppInitialization() {
  const settingsStore = useSettingsStore()
  const projectStore = useProjectStore()
  const sparkStore = useSparkStore()
  const polishStore = usePolishStore()
  const storyBibleStore = useStoryBibleStore()
  const manuscriptStore = useManuscriptStore()

  const ollamaAvailable = ref(true)
  const modelNotFound = ref(false)
  const showModelBanner = ref(false)
  const adoptedModel = ref('')
  const hasLoaded = ref(false)
  const onboardingStatus = useLocalStorage(STORAGE_KEYS.ONBOARDING_V2, '')

  // Embedding models can't generate prose. Ollama's /api/tags doesn't reliably
  // distinguish them (family is model-specific — nomic-embed-text reports
  // 'nomic-bert'), so match on name. Heuristic, but it beats silently adopting
  // nomic-embed-text as the writer.
  const EMBEDDING_MODEL_NAME = /embed/i

  async function checkModelAvailability() {
    try {
      const response = await fetch(`${getOllamaEndpoint()}/api/tags`)
      if (!response.ok) return
      const data = await response.json()
      const modelNames = data.models?.map((m) => m.name) || []

      // Check the model generation actually calls (settingsStore.ollamaModel, via
      // resolveFeatureConfig). config/ollama.js's getOllamaModel() reads a
      // localStorage key nothing ever writes, so it always returned the constant
      // default — the banner cleared for a model the user had not selected, and
      // stayed silent when their real one was missing.
      if (modelNames.includes(settingsStore.ollamaModel)) return

      modelNotFound.value = true
      showModelBanner.value = true

      // The configured model isn't pulled, so every generation would fail with
      // "model not found". A shipped default is only ever a guess about someone
      // else's machine, so when the user has not chosen one, adopt whatever is
      // actually installed. If they DID choose (value differs from the default),
      // respect it — they may be midway through pulling it — and just warn.
      if (settingsStore.ollamaModel !== DEFAULT_MODEL) return

      const usable = modelNames.filter((n) => !EMBEDDING_MODEL_NAME.test(n)).sort()
      if (!usable.length) return

      const adopted = usable[0]
      console.warn(
        `[useAppInitialization] Default model "${DEFAULT_MODEL}" is not pulled; using "${adopted}" instead.`
      )
      settingsStore.setOllamaModel(adopted)
      adoptedModel.value = adopted
    } catch (e) {
      console.error('[useAppInitialization] checkModelAvailability failed:', e)
    }
  }

  async function initializeApp(projectId = null) {
    const ollamaOk = await checkOllamaConnection()
    ollamaAvailable.value = ollamaOk

    if (ollamaOk) {
      await checkModelAvailability()
    }

    let hasProject = false
    if (projectId) {
      await projectStore.loadProject(projectId)
      hasProject = true
    } else {
      hasProject = await projectStore.loadLastProject()
    }

    if (!hasProject && !isOnboardingDismissed()) {
      hasLoaded.value = true
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
    const stale = await markStale(
      projectStore.currentProjectId,
      EMBEDDING_DEFAULTS.provider,
      EMBEDDING_DEFAULTS.model,
      EMBEDDING_VERSION
    )
    if (stale > 0) {
      console.info(`[resume] Marked ${stale} chunks stale (model/version change)`)
    }
    const recovered = await resumeEmbeddingQueue(projectStore.currentProjectId)
    if (recovered > 0) {
      console.info(`[resume] Re-indexing ${recovered} unembedded chunks`)
    }

    // pruneEmbeddingCache was written but never called from anywhere, so the
    // Dexie embeddingCache table grew without bound for the life of the install.
    // Once per app start is enough — it is an LRU trim, not a hot path.
    try {
      const pruned = await pruneEmbeddingCache()
      if (pruned > 0) {
        console.info(`[resume] Pruned ${pruned} stale embedding cache entries`)
      }
    } catch (e) {
      console.warn('[resume] Embedding cache prune failed (non-fatal):', e)
    }
  }

  function isOnboardingDismissed() {
    return onboardingStatus.value === 'done'
  }

  async function onOnboardingComplete() {
    onboardingStatus.value = 'done'

    if (projectStore.currentProjectId) {
      await loadProjectData()
    }

    return { showOnboarding: false }
  }

  function onOnboardingSkip() {
    onboardingStatus.value = 'done'
    return { showOnboarding: false }
  }

  return {
    ollamaAvailable,
    modelNotFound,
    showModelBanner,
    adoptedModel,
    hasLoaded,
    checkModelAvailability,
    initializeApp,
    loadProjectData,
    isOnboardingDismissed,
    onOnboardingComplete,
    onOnboardingSkip
  }
}
