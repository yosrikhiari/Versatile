import { ref } from 'vue'
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
import { useLocalStorage } from '../utils/useLocalStorage'
import { resume as resumeEmbeddingQueue } from '../services/embeddingQueue'
import { markStale, pruneEmbeddingCache } from '../services/researchDb'
import { resolveEmbeddingConfig } from '../services/embeddingConfig'
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
  /** Name of the configured embedding model when it is not installed, else ''. */
  const embeddingModelMissing = ref('')
  const hasLoaded = ref(false)
  const onboardingStatus = useLocalStorage(STORAGE_KEYS.ONBOARDING_V2, '')

  // Embedding models can't generate prose. Ollama's /api/tags doesn't reliably
  // distinguish them (family is model-specific — nomic-embed-text reports
  // 'nomic-bert'), so match on name. Heuristic, but it beats silently adopting
  // nomic-embed-text as the writer.
  const EMBEDDING_MODEL_NAME = /embed/i

  /**
   * Tag-tolerant match. /api/tags reports fully-qualified names
   * ("nomic-embed-text:latest") while config stores the bare name
   * ("nomic-embed-text"), so an exact compare reports an installed model as
   * missing.
   */
  function isInstalled(names: any, wanted: any) {
    if (!wanted) return true
    return names.some((n: any) => n === wanted || n.split(':')[0] === wanted.split(':')[0])
  }

  /** How long the startup probe waits for Ollama before treating it as absent. */
  const PROBE_TIMEOUT_MS = 5000

  /**
   * One request to `/api/tags` answers everything the banners need: whether
   * Ollama is reachable, and which generation and embedding models are pulled.
   *
   * This used to be two requests in series — a reachability check, then an
   * untimed model check — and the manuscript waited on both before loading.
   * `initializeApp` now runs this alongside the project load; nothing here is
   * needed to show the writer their text.
   */
  async function checkModelAvailability() {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch(`${getOllamaEndpoint()}/api/tags`, { signal: controller.signal })
      } finally {
        clearTimeout(timeout)
      }
      ollamaAvailable.value = response.ok
      if (!response.ok) return
      const data = await response.json()
      const modelNames = data.models?.map((m: any) => m.name) || []

      // Check the EMBEDDING model before the generation model's early return.
      //
      // These fail differently, which is why the check has to be separate. A
      // missing generation model breaks loudly — every call errors. A missing
      // embedding model breaks SILENTLY: embeddings fail, semantic retrieval
      // returns nothing, scenes are written without their retrieved context, and
      // the prose is merely worse. Nothing surfaces. ollamaService has exported
      // checkEmbeddingModelAvailable() for exactly this since it was written,
      // and nothing ever called it.
      const wantedEmbed = settingsStore.embeddingModel || EMBEDDING_DEFAULTS.model
      embeddingModelMissing.value = isInstalled(modelNames, wantedEmbed) ? '' : wantedEmbed
      if (embeddingModelMissing.value) {
        console.warn(
          `[useAppInitialization] Embedding model "${wantedEmbed}" is not installed. Semantic search and research retrieval will return nothing until it is pulled: ollama pull ${wantedEmbed}`
        )
      }

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

      const usable = modelNames.filter((n: any) => !EMBEDDING_MODEL_NAME.test(n)).sort()
      if (!usable.length) return

      const adopted = usable[0]
      console.warn(
        `[useAppInitialization] Default model "${DEFAULT_MODEL}" is not pulled; using "${adopted}" instead.`
      )
      settingsStore.setOllamaModel(adopted)
      adoptedModel.value = adopted
    } catch (e) {
      // Unreachable, refused, or timed out: local AI is off, writing is not.
      ollamaAvailable.value = false
      console.warn('[useAppInitialization] Ollama probe failed:', (e as Error)?.message || e)
    }
  }

  async function initializeApp(projectId = null) {
    // Start the network probe, but do not wait for it: the project comes out of
    // IndexedDB and should be on screen regardless of whether Ollama answers.
    const probe = checkModelAvailability()

    let hasProject = false
    if (projectId) {
      await projectStore.loadProject(projectId)
      hasProject = true
    } else {
      hasProject = await projectStore.loadLastProject()
    }

    if (!hasProject && !isOnboardingDismissed()) {
      hasLoaded.value = true
      await probe
      return { showOnboarding: true }
    } else if (projectStore.currentProjectId) {
      await loadProjectData()
    }

    hasLoaded.value = true
    // Settled before returning so callers still see a decided `ollamaAvailable`.
    await probe
    return { showOnboarding: false }
  }

  async function loadProjectData() {
    if (!projectStore.currentProjectId) return

    const projectId = projectStore.currentProjectId
    const archiveStore = useArchiveStore()

    // Independent IndexedDB reads, batched. They used to run one after another,
    // so opening a project paid eight sequential round trips before the first
    // panel could render anything.
    await Promise.all([
      sparkStore.loadHistory(projectId),
      polishStore.loadAnnotations(projectId),
      polishStore.loadSnippets(projectId),
      storyBibleStore.loadAll(projectId),
      manuscriptStore.loadManuscript(projectId),
      projectStore.loadAuthorProfile(),
      archiveStore.loadStateSnapshots(projectId)
    ])
    // The session baseline must include the structure, which was not loaded
    // yet when loadProject set it from the root document alone.
    projectStore.resetSessionCount()
    sparkStore.setProjectId(projectId)

    // loadStateSnapshots is newest-first, so its head is the latest snapshot.
    const latest = archiveStore.stateSnapshots?.[0] || (await getLatestStateSnapshot(projectId))
    if (latest) {
      const { snapshotToRecap } = useStateSummarizer()
      projectStore.lastSessionRecap = snapshotToRecap(latest.state)
    }

    const { regenerateAllDocuments } = useStoryDocuments()
    await regenerateAllDocuments(projectStore.currentProjectId)
    // Compared against the model the indexer will actually use, not the shipped
    // default. Comparing to the default meant switching embedding models never
    // marked anything stale, so the corpus kept its old vectors while new
    // queries were embedded with the new model — retrieval quietly went blind.
    const activeEmbedding = resolveEmbeddingConfig()
    const stale = await markStale(
      projectStore.currentProjectId,
      activeEmbedding.provider,
      activeEmbedding.model,
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
    embeddingModelMissing,
    hasLoaded,
    checkModelAvailability,
    initializeApp,
    loadProjectData,
    isOnboardingDismissed,
    onOnboardingComplete,
    onOnboardingSkip
  }
}
