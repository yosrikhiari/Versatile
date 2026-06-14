<script setup>
import { ref, watch, computed } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getDailyGoal, setDailyGoal } from '../../services/dbService'
import { getAvailableModels, getStoredOpenAIKey, setStoredOpenAIKey } from '../../services/ollamaService'
import { PROVIDERS, PROVIDER_LABELS, PROVIDER_LIST, PROVIDER_MODELS, FEATURE_LIST, FEATURE_LABELS, EMBEDDING_PROVIDER_LABELS, EMBEDDING_MODELS, EMBEDDING_THRESHOLD_MIN, EMBEDDING_THRESHOLD_MAX, EMBEDDING_THRESHOLD_STEP } from '../../config/ai'
import BaseIcon from '../shared/BaseIcon.vue'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useLocalStorage } from '../../composables/useLocalStorage'
import VoiceProfileDisplay from '../shared/VoiceProfileDisplay.vue'
import VoiceUploadModal from './VoiceUploadModal.vue'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close', 'model-changed'])

const projectStore = useProjectStore()
const settingsStore = useSettingsStore()
const goalInput = ref(500)
const availableModels = ref([])
const selectedModel = useLocalStorage(STORAGE_KEYS.OLLAMA_MODEL, '')
const openAIKey = ref('')
const activeTab = ref('goals')
const ollamaEndpoint = ref('')
const testingConnection = ref(false)
const connectionStatus = ref(null)
const showVoiceUpload = ref(false)

const apiKeys = ref({})
const testingProvider = ref(null)
const providerStatus = ref({})

const featureProviderSelections = ref({})
const featureModelSelections = ref({})

const NON_OLLAMA_PROVIDERS = computed(() =>
  PROVIDER_LIST.filter(p => p !== PROVIDERS.OLLAMA)
)

function getModelsForProvider(provider) {
  if (provider === PROVIDERS.OLLAMA) return availableModels.value
  if (provider === 'default' || !provider) return []
  return PROVIDER_MODELS[provider] || []
}

function onFeatureProviderChange(feature) {
  const provider = featureProviderSelections.value[feature]
  if (!provider || provider === 'default') {
    featureModelSelections.value[feature] = ''
  } else {
    const models = getModelsForProvider(provider)
    const currentModel = featureModelSelections.value[feature]
    if (!models.includes(currentModel)) {
      featureModelSelections.value[feature] = models[0] || ''
    }
  }
}

async function loadGoal() {
  if (!projectStore.currentProjectId) return
  const existing = await getDailyGoal(projectStore.currentProjectId)
  if (existing) {
    goalInput.value = existing.goalWords
  }
}

async function saveGoal() {
  if (!projectStore.currentProjectId) return
  const goal = parseInt(goalInput.value, 10)
  if (goal > 0) {
    await setDailyGoal(projectStore.currentProjectId, goal)
    projectStore.setDailyGoal(goal)
  }
  emit('close')
}

async function loadModels() {
  availableModels.value = await getAvailableModels()
  if (!selectedModel.value && settingsStore.ollamaModel) {
    selectedModel.value = settingsStore.ollamaModel
  }
}

async function testConnection() {
  testingConnection.value = true
  connectionStatus.value = null
  const result = await settingsStore.testOllamaConnection()
  connectionStatus.value = result
  testingConnection.value = false
}

function saveModel() {
  if (selectedModel.value) {
    settingsStore.setOllamaModel(selectedModel.value)
    emit('model-changed')
  }
}

function saveOpenAIKey() {
  settingsStore.setOpenaiApiKey(openAIKey.value)
  setStoredOpenAIKey(openAIKey.value)
}

function saveEndpoint() {
  settingsStore.setOllamaEndpoint(ollamaEndpoint.value)
  connectionStatus.value = null
}

function loadOpenAIKey() {
  openAIKey.value = settingsStore.openaiApiKey || getStoredOpenAIKey() || ''
}

function loadEndpoint() {
  ollamaEndpoint.value = settingsStore.ollamaEndpoint
}

function loadAllProviderKeys() {
  for (const p of NON_OLLAMA_PROVIDERS.value) {
    apiKeys.value[p] = settingsStore.getStoredApiKey(p) || ''
  }
}

function loadFeatureSelections() {
  for (const f of FEATURE_LIST) {
    const override = settingsStore.featureModels?.[f]
    featureProviderSelections.value[f] = override?.provider || 'default'
    featureModelSelections.value[f] = override?.model || ''
  }
}

async function testProvider(provider) {
  testingProvider.value = provider
  providerStatus.value[provider] = null
  const result = await settingsStore.testProviderConnection(provider)
  providerStatus.value[provider] = result
  testingProvider.value = null
}

function saveAllSettings() {
  saveEndpoint()
  saveModel()
  saveOpenAIKey()

  for (const p of NON_OLLAMA_PROVIDERS.value) {
    settingsStore.setStoredApiKey(p, apiKeys.value[p] || '')
  }

  for (const f of FEATURE_LIST) {
    const provider = featureProviderSelections.value[f]
    const model = featureModelSelections.value[f]
    settingsStore.setFeatureModel(f,
      provider && provider !== 'default' ? provider : null,
      model || null
    )
  }

  settingsStore.setEmbeddingProvider(settingsStore.embeddingProvider)
  settingsStore.setEmbeddingModel(settingsStore.embeddingModel)
  settingsStore.setEmbeddingThreshold(settingsStore.embeddingThreshold)

  emit('close')
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    loadGoal()
    loadModels()
    loadOpenAIKey()
    loadEndpoint()
    loadAllProviderKeys()
    loadFeatureSelections()
    activeTab.value = 'goals'
    connectionStatus.value = null
    providerStatus.value = {}
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" @click.self="emit('close')">
      <div class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-thin animate-scale-in">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-display font-semibold text-text-primary tracking-wide">Settings</h2>
          <button class="text-text-hint/50 hover:text-text-primary transition-all duration-150 btn-ghost rounded-lg p-1" @click="emit('close')">
            <BaseIcon name="x" :size="20" />
          </button>
        </div>

        <div class="flex gap-1 mb-6 border-b border-border-subtle/50 pb-2">
          <button
            :class="[
              'px-3 py-1.5 text-sm rounded-lg transition-all duration-150',
              activeTab === 'goals' ? 'bg-accent-glass text-accent' : 'text-text-hint/60 hover:text-text-secondary btn-ghost'
            ]"
            @click="activeTab = 'goals'"
          >
            Goals
          </button>
          <button
            :class="[
              'px-3 py-1.5 text-sm rounded-lg transition-all duration-150',
              activeTab === 'ai' ? 'bg-accent-glass text-accent' : 'text-text-hint/60 hover:text-text-secondary btn-ghost'
            ]"
            @click="activeTab = 'ai'"
          >
            AI Providers
          </button>
          <button
            :class="[
              'px-3 py-1.5 text-sm rounded-lg transition-all duration-150',
              activeTab === 'embedding' ? 'bg-accent-glass text-accent' : 'text-text-hint/60 hover:text-text-secondary btn-ghost'
            ]"
            @click="activeTab = 'embedding'"
          >
            Embeddings
          </button>
          <button
            :class="[
              'px-3 py-1.5 text-sm rounded-lg transition-all duration-150',
              activeTab === 'features' ? 'bg-accent-glass text-accent' : 'text-text-hint/60 hover:text-text-secondary btn-ghost'
            ]"
            @click="activeTab = 'features'"
          >
            Features
          </button>
          <button
            :class="[
              'px-3 py-1.5 text-sm rounded-lg transition-all duration-150',
              activeTab === 'voice' ? 'bg-accent-glass text-accent' : 'text-text-hint/60 hover:text-text-secondary btn-ghost'
            ]"
            @click="activeTab = 'voice'"
          >
            Voice
          </button>
        </div>

        <div v-if="activeTab === 'goals'">
          <div class="mb-4">
            <label for="goal-input" class="block text-sm font-medium text-text-secondary mb-2">
              Words per day
            </label>
            <input
              id="goal-input"
              v-model.number="goalInput"
              type="number"
              min="1"
              step="50"
              class="w-full px-4 py-2 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        <div v-if="activeTab === 'ai'" class="space-y-5">
          <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-medium text-text-primary">Global Defaults</h3>
            <div>
              <label for="default-provider" class="block text-xs text-text-secondary mb-1">Default Provider</label>
              <select
                id="default-provider"
                :value="settingsStore.aiProvider"
                class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                @change="settingsStore.setAIProvider($event.target.value)"
              >
                <option v-for="p in PROVIDER_LIST" :key="p" :value="p">
                  {{ PROVIDER_LABELS[p] }}
                </option>
              </select>
            </div>
            <div>
              <label for="fallback-provider" class="block text-xs text-text-secondary mb-1">Fallback Provider</label>
              <select
                id="fallback-provider"
                :value="settingsStore.aiProviderFallback"
                class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                @change="settingsStore.setAIProviderFallback($event.target.value)"
              >
                <option value="none">No fallback</option>
                <option v-for="p in PROVIDER_LIST" :key="p" :value="p">
                  {{ PROVIDER_LABELS[p] }}
                </option>
              </select>
              <p class="mt-1 text-[10px] text-text-hint">Used when the primary provider fails.</p>
            </div>
          </div>

          <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-medium text-text-primary">Ollama (Local)</h3>
            <div>
              <label for="ollama-endpoint" class="block text-xs text-text-secondary mb-1">Endpoint</label>
              <div class="flex gap-2">
                <input
                  id="ollama-endpoint"
                  v-model="ollamaEndpoint"
                  type="text"
                  placeholder="http://localhost:11434"
                  class="flex-1 px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  :disabled="testingConnection"
                  class="px-3 py-1.5 bg-surface-hover text-text-secondary rounded-lg hover:bg-bg-secondary disabled:opacity-50 text-sm"
                  @click="testConnection"
                >
                  {{ testingConnection ? '...' : 'Test' }}
                </button>
              </div>
              <div
                v-if="connectionStatus" :class="[
                  'mt-1 text-xs px-2 py-1 rounded',
                  connectionStatus.success ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                ]"
              >
                {{ connectionStatus.message }}
              </div>
            </div>
            <div>
              <label for="ollama-model" class="block text-xs text-text-secondary mb-1">Model</label>
              <select
                id="ollama-model"
                v-model="selectedModel"
                class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                <option value="">Select a model</option>
                <option v-for="model in availableModels" :key="model" :value="model">
                  {{ model }}
                </option>
              </select>
            </div>
          </div>

          <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-medium text-text-primary">API Keys</h3>
            <p class="text-[11px] text-warning/90 leading-snug">
              ⚠ Stored locally in your browser. Do not use a high-spend key.
            </p>
            <div v-for="p in NON_OLLAMA_PROVIDERS" :key="p" class="space-y-1">
              <label :for="'api-key-' + p" class="block text-xs text-text-secondary">{{ PROVIDER_LABELS[p] }}</label>
              <div class="flex gap-2">
                <input
                  :id="'api-key-' + p"
                  v-model="apiKeys[p]"
                  type="password"
                  :placeholder="`${p} API key`"
                  class="flex-1 px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono text-xs"
                />
                <button
                  :disabled="testingProvider === p || !apiKeys[p]"
                  class="px-3 py-1.5 bg-surface-hover text-text-secondary rounded-lg hover:bg-bg-secondary disabled:opacity-50 text-sm"
                  @click="testProvider(p)"
                >
                  {{ testingProvider === p ? '...' : 'Test' }}
                </button>
              </div>
              <div
                v-if="providerStatus[p]" :class="[
                  'mt-1 text-xs px-2 py-1 rounded',
                  providerStatus[p].success ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                ]"
              >
                {{ providerStatus[p].message }}
              </div>
            </div>
          </div>

          <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-medium text-text-primary">Per-Feature Model Overrides</h3>
            <p class="text-[10px] text-text-hint">Override the default provider/model for specific tasks. Set to "Default" to inherit from the global default above.</p>
            <div v-for="f in FEATURE_LIST" :key="f" class="flex gap-2 items-start">
              <div class="flex-1 min-w-0">
                <label :for="'feature-provider-' + f" class="block text-[10px] text-text-secondary mb-0.5">{{ FEATURE_LABELS[f] }}</label>
                <div class="flex gap-1.5">
                  <select
                    :id="'feature-provider-' + f"
                    v-model="featureProviderSelections[f]"
                    class="flex-[2] px-2 py-1 border border-border-subtle bg-bg-secondary text-text-primary rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
                    @change="onFeatureProviderChange(f)"
                  >
                    <option value="default">Default</option>
                    <option v-for="p in PROVIDER_LIST" :key="p" :value="p">
                      {{ p === PROVIDERS.OLLAMA ? 'Ollama' : p }}
                    </option>
                  </select>
                  <select
                    :id="'feature-model-' + f"
                    v-model="featureModelSelections[f]"
                    class="flex-[3] px-2 py-1 border border-border-subtle bg-bg-secondary text-text-primary rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent/30"
                    :disabled="!featureProviderSelections[f] || featureProviderSelections[f] === 'default'"
                  >
                    <option value="">Auto</option>
                    <option v-for="m in getModelsForProvider(featureProviderSelections[f])" :key="m" :value="m">
                      {{ m }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
            <h3 class="text-sm font-medium text-text-primary">Embeddings</h3>
            <div>
              <label for="embedding-provider" class="block text-xs text-text-secondary mb-1">Provider</label>
              <select
                id="embedding-provider"
                :value="settingsStore.embeddingProvider"
                class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                @change="settingsStore.setEmbeddingProvider($event.target.value)"
              >
                <option v-for="(label, key) in EMBEDDING_PROVIDER_LABELS" :key="key" :value="key">
                  {{ label }}
                </option>
              </select>
            </div>
            <div>
              <label for="embedding-model" class="block text-xs text-text-secondary mb-1">Model</label>
              <select
                id="embedding-model"
                :value="settingsStore.embeddingModel"
                class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                @change="settingsStore.setEmbeddingModel($event.target.value)"
              >
                <option value="nomic-embed-text">nomic-embed-text</option>
                <option v-for="m in (EMBEDDING_MODELS[settingsStore.embeddingProvider] || [])" :key="m" :value="m">
                  {{ m }}
                </option>
              </select>
            </div>
            <div>
              <label for="embedding-threshold" class="block text-xs text-text-secondary mb-1">
                Topic-shift threshold: {{ settingsStore.embeddingThreshold?.toFixed(2) }}
              </label>
              <input
                id="embedding-threshold"
                :value="settingsStore.embeddingThreshold"
                type="range"
                :min="EMBEDDING_THRESHOLD_MIN"
                :max="EMBEDDING_THRESHOLD_MAX"
                :step="EMBEDDING_THRESHOLD_STEP"
                class="w-full accent-accent"
                @input="settingsStore.setEmbeddingThreshold(parseFloat($event.target.value))"
              />
              <div class="flex justify-between text-[10px] text-text-hint mt-0.5">
                <span>More splits ({{ EMBEDDING_THRESHOLD_MIN }})</span>
                <span>Fewer splits ({{ EMBEDDING_THRESHOLD_MAX }})</span>
              </div>
            </div>
            <div v-if="settingsStore.embeddingProvider === 'mistral'" class="text-[10px] text-text-hint">
              Mistral key loaded from <code>.env</code> file.
            </div>
            <div v-else class="text-[10px] text-text-hint">
              Uses Ollama locally. No API key needed.
            </div>
          </div>
        </div>

        <div v-if="activeTab === 'voice'" class="space-y-5">
          <VoiceProfileDisplay />
          <div class="flex gap-2">
            <button
              class="flex-1 py-2 bg-surface-hover text-text-secondary rounded-lg font-medium hover:bg-bg-tertiary text-sm"
              @click="showVoiceUpload = true"
            >
              Upload Sample Text
            </button>
          </div>
          <VoiceUploadModal :is-open="showVoiceUpload" @close="showVoiceUpload = false" />
        </div>

        <div class="flex gap-3 mt-6">
          <button
            class="flex-1 py-2 bg-surface-hover text-text-secondary rounded-lg font-medium hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            v-if="activeTab === 'goals'"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
            @click="saveGoal"
          >
            Save
          </button>
          <button
            v-if="activeTab === 'ai'"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
            @click="saveAllSettings"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
