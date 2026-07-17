import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// The composable pulls in most of the app's stores and services at module scope.
// Only checkModelAvailability is under test here, so everything else is stubbed
// to the shallowest thing that still lets the composable construct.
vi.mock('@/services/ollamaService', () => ({
  checkOllamaConnection: vi.fn(() => Promise.resolve(true)),
  encrypt: vi.fn((s) => s),
  decrypt: vi.fn((s) => s)
}))
vi.mock('@/services/dbService', () => ({ getLatestStateSnapshot: vi.fn() }))
vi.mock('@/services/embeddingQueue', () => ({ resume: vi.fn() }))
vi.mock('@/services/researchDb', () => ({ markStale: vi.fn() }))
vi.mock('@/services/api', () => ({ getAuthHeaders: vi.fn(() => ({})) }))
vi.mock('@/services/aiService', () => ({ aiTestConnection: vi.fn() }))
vi.mock('@/composables/useStateSummarizer', () => ({
  useStateSummarizer: () => ({ summarizeState: vi.fn() })
}))
vi.mock('@/composables/useStoryDocuments', () => ({
  useStoryDocuments: () => ({ loadDocuments: vi.fn() })
}))

const storeStub = () => ({ $reset: vi.fn(), load: vi.fn(), loadAll: vi.fn() })
vi.mock('@/stores/projectStore', () => ({ useProjectStore: storeStub }))
vi.mock('@/stores/sparkStore', () => ({ useSparkStore: storeStub }))
vi.mock('@/stores/polishStore', () => ({ usePolishStore: storeStub }))
vi.mock('@/stores/storyBibleStore', () => ({ useStoryBibleStore: storeStub }))
vi.mock('@/stores/manuscriptStore', () => ({ useManuscriptStore: storeStub }))
vi.mock('@/stores/archiveStore', () => ({ useArchiveStore: storeStub }))

vi.mock('@/config/ollama', () => ({
  getOllamaEndpoint: vi.fn(() => 'http://localhost:11434'),
  DEFAULT_MODEL: 'qwen3:8b'
}))

vi.mock('@/config/ai', () => ({
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.75 },
  EMBEDDING_VERSION: 1
}))

// A minimal settings store standing in for the real one: the composable only
// reads .ollamaModel and calls .setOllamaModel().
let settings
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => settings
}))

const mockFetch = vi.fn()

let useAppInitialization
beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  setActivePinia(createPinia())
  global.fetch = mockFetch
  settings = {
    ollamaModel: 'qwen3:8b',
    embeddingModel: 'nomic-embed-text',
    setOllamaModel: vi.fn((m) => {
      settings.ollamaModel = m
    })
  }
  ;({ useAppInitialization } = await import('@/composables/useAppInitialization'))
})

function tagsReturning(names) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ models: names.map((name) => ({ name })) })
  })
}

describe('checkModelAvailability', () => {
  it('stays quiet when the configured model is pulled', async () => {
    tagsReturning(['qwen3:8b', 'phi4-mini:3.8b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(app.modelNotFound.value).toBe(false)
    expect(app.showModelBanner.value).toBe(false)
    expect(settings.setOllamaModel).not.toHaveBeenCalled()
  })

  it('adopts an installed model when the default is not pulled', async () => {
    // The shipped default is a guess about someone else's machine. If the user
    // never chose, every generation would fail with "model not found".
    tagsReturning(['phi4-mini:3.8b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(settings.setOllamaModel).toHaveBeenCalledWith('phi4-mini:3.8b')
    expect(app.adoptedModel.value).toBe('phi4-mini:3.8b')
    expect(app.modelNotFound.value).toBe(true)
  })

  it('never adopts an embedding model as the writer', async () => {
    tagsReturning(['nomic-embed-text:latest', 'phi4-mini:3.8b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(settings.setOllamaModel).toHaveBeenCalledWith('phi4-mini:3.8b')
  })

  it('adopts nothing when only embedding models are installed', async () => {
    tagsReturning(['nomic-embed-text:latest'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(settings.setOllamaModel).not.toHaveBeenCalled()
    expect(app.adoptedModel.value).toBe('')
    // Still warn — the user has no usable generation model at all.
    expect(app.showModelBanner.value).toBe(true)
  })

  it('respects a deliberate choice and does not override it', async () => {
    // They may be midway through pulling it. Warn, but do not second-guess.
    settings.ollamaModel = 'llama3:70b'
    tagsReturning(['phi4-mini:3.8b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(settings.setOllamaModel).not.toHaveBeenCalled()
    expect(settings.ollamaModel).toBe('llama3:70b')
    expect(app.showModelBanner.value).toBe(true)
  })

  it('adopts deterministically when several models are installed', async () => {
    tagsReturning(['phi4-mini:3.8b', 'aardvark:1b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(settings.setOllamaModel).toHaveBeenCalledWith('aardvark:1b')
  })

  it('adopts nothing when Ollama has no models at all', async () => {
    tagsReturning([])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(settings.setOllamaModel).not.toHaveBeenCalled()
    expect(app.showModelBanner.value).toBe(true)
  })

  it('does not throw when Ollama is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const app = useAppInitialization()
    await expect(app.checkModelAvailability()).resolves.toBeUndefined()
    expect(settings.setOllamaModel).not.toHaveBeenCalled()
  })
})

describe('embedding model availability', () => {
  it('flags a missing embedding model — it fails silently otherwise', async () => {
    // Found live: the machine had only phi4-mini, nomic-embed-text was gone, and
    // the app said nothing. Embeddings failed, semantic retrieval returned
    // nothing, and scenes were written without their research context — the only
    // symptom being worse prose, which a user would blame on the model.
    tagsReturning(['qwen3:8b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(app.embeddingModelMissing.value).toBe('nomic-embed-text')
  })

  it('accepts a tagged embedding model — :latest must not read as missing', async () => {
    // /api/tags reports "nomic-embed-text:latest" while config stores the bare
    // name. An exact compare would report an installed model as missing.
    tagsReturning(['qwen3:8b', 'nomic-embed-text:latest'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(app.embeddingModelMissing.value).toBe('')
  })

  it('checks the embedding model even when the generation model is fine', async () => {
    // Regression: the generation check returns early on success. The embedding
    // check has to run before it or it never runs at all in the happy path.
    tagsReturning(['qwen3:8b'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(app.modelNotFound.value).toBe(false)
    expect(app.embeddingModelMissing.value).toBe('nomic-embed-text')
  })

  it('respects a user-chosen embedding model over the default', async () => {
    settings.embeddingModel = 'mxbai-embed-large'
    tagsReturning(['qwen3:8b', 'nomic-embed-text:latest'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(app.embeddingModelMissing.value).toBe('mxbai-embed-large')
  })

  it('stays quiet when both models are installed', async () => {
    tagsReturning(['qwen3:8b', 'nomic-embed-text:latest'])
    const app = useAppInitialization()
    await app.checkModelAvailability()

    expect(app.embeddingModelMissing.value).toBe('')
    expect(app.modelNotFound.value).toBe(false)
  })
})
