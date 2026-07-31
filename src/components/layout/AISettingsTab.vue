<script setup>
import { ref, computed } from 'vue'
import { useSettingsStore } from '../../stores/settingsStore'
import {
  PROVIDERS,
  PROVIDER_LABELS,
  PROVIDER_LIST,
  PROVIDER_MODELS,
  FEATURE_LIST,
  FEATURE_LABELS,
  EMBEDDING_PROVIDER_LABELS,
  EMBEDDING_MODELS,
  EMBEDDING_THRESHOLD_MIN,
  EMBEDDING_THRESHOLD_MAX,
  EMBEDDING_THRESHOLD_STEP
} from '../../config/ai'
import {
  getAvailableModels,
  getStoredOpenAIKey,
  setStoredOpenAIKey
} from '../../services/ollamaService'
import { getOllamaUtilityModel, setOllamaUtilityModel } from '../../config/ollama'

const emit = defineEmits(['close', 'model-changed'])
const settingsStore = useSettingsStore()

const testingConnection = ref(false)
const connectionStatus = ref(null)
const ollamaEndpoint = ref('')
const selectedModel = ref('')
const availableModels = ref([])
const selectedUtilityModel = ref(getOllamaUtilityModel() || '')
const openAIKey = ref('')
const apiKeys = ref({})
const testingProvider = ref(null)
const providerStatus = ref({})
const newFallback = ref('')
const featureProviderSelections = ref({})
const featureModelSelections = ref({})

const NON_OLLAMA_PROVIDERS = computed(() => PROVIDER_LIST.filter((p) => p !== PROVIDERS.OLLAMA))

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

function saveUtilityModel() {
  setOllamaUtilityModel(selectedUtilityModel.value || null)
}

async function saveOpenAIKey() {
  await settingsStore.setOpenaiApiKey(openAIKey.value)
  await setStoredOpenAIKey(openAIKey.value)
}

function saveEndpoint() {
  settingsStore.setOllamaEndpoint(ollamaEndpoint.value)
  connectionStatus.value = null
}

async function loadOpenAIKey() {
  var stored = await getStoredOpenAIKey()
  openAIKey.value = settingsStore.openaiApiKey || stored || ''
}

function loadEndpoint() {
  ollamaEndpoint.value = settingsStore.ollamaEndpoint
}

async function loadAllProviderKeys() {
  for (const p of NON_OLLAMA_PROVIDERS.value) {
    apiKeys.value[p] = (await settingsStore.getStoredApiKey(p)) || ''
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

async function saveAllSettings() {
  saveEndpoint()
  saveModel()
  await saveOpenAIKey()
  for (const p of NON_OLLAMA_PROVIDERS.value) {
    await settingsStore.setStoredApiKey(p, apiKeys.value[p] || '')
  }
  for (const f of FEATURE_LIST) {
    const provider = featureProviderSelections.value[f]
    const model = featureModelSelections.value[f]
    settingsStore.setFeatureModel(
      f,
      provider && provider !== 'default' ? provider : null,
      model || null
    )
  }
  settingsStore.setEmbeddingProvider(settingsStore.embeddingProvider)
  settingsStore.setEmbeddingModel(settingsStore.embeddingModel)
  settingsStore.setEmbeddingThreshold(settingsStore.embeddingThreshold)
  emit('close')
}

const availableFallbacks = computed(() => {
  const primary = settingsStore.aiProvider
  const chain = settingsStore.aiFallbackChain
  return PROVIDER_LIST.filter((p) => p !== primary && !chain.includes(p))
})

function addFallback() {
  if (!newFallback.value) return
  const chain = [...settingsStore.aiFallbackChain, newFallback.value]
  settingsStore.setAIFallbackChain(chain)
  newFallback.value = ''
}

function removeFallbackAt(index) {
  const chain = settingsStore.aiFallbackChain.filter((_, i) => i !== index)
  settingsStore.setAIFallbackChain(chain)
}

function updateFallbackAt(index, value) {
  const chain = [...settingsStore.aiFallbackChain]
  chain[index] = value
  settingsStore.setAIFallbackChain(chain)
}

defineExpose({
  loadModels,
  loadOpenAIKey,
  loadEndpoint,
  loadAllProviderKeys,
  loadFeatureSelections
})
</script>

<template>
  <div class="space-y-5">
    <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
      <h3 class="text-sm font-medium text-text-primary">Global Defaults</h3>

      <!--
        The one switch that decides whether anything leaves this machine.
        Placed first because it overrides every control below it — showing the
        provider pickers above it would imply they still apply.
      -->
      <label class="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          :checked="settingsStore.localOnly"
          class="mt-0.5 accent-accent"
          @change="settingsStore.setLocalOnly($event.target.checked)"
        />
        <span class="min-w-0">
          <span class="block text-xs text-text-primary">Run everything locally</span>
          <span class="block text-2xs text-text-hint leading-relaxed">
            Every model call goes to Ollama on this machine. Overrides the provider, fallback chain
            and per-feature settings below — no request reaches a hosted provider.
          </span>
        </span>
      </label>

      <div
        v-if="settingsStore.localOnly"
        class="text-2xs text-text-hint leading-relaxed border-l-2 border-border-subtle pl-2"
      >
        The settings below are kept but not used while this is on. Turn it off to route individual
        features to a hosted model.
      </div>

      <div>
        <label for="default-provider" class="block text-xs text-text-secondary mb-1"
          >Default Provider</label
        >
        <select
          id="default-provider"
          :value="settingsStore.aiProvider"
          class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          @change="settingsStore.setAIProvider($event.target.value)"
        >
          <option v-for="p in PROVIDER_LIST" :key="p" :value="p">
            {{ PROVIDER_LABELS[p] }}
          </option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-text-secondary mb-1">Fallback Chain</label>
        <div class="space-y-1.5">
          <div
            v-for="(fb, i) in settingsStore.aiFallbackChain"
            :key="i"
            class="flex gap-1.5 items-center"
          >
            <span class="text-2xs text-text-hint w-4 shrink-0">{{ i + 1 }}.</span>
            <select
              :value="fb"
              class="flex-1 px-2 py-1 border border-border-subtle bg-bg-secondary text-text-primary rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent"
              @change="updateFallbackAt(i, $event.target.value)"
            >
              <option v-for="p in PROVIDER_LIST" :key="p" :value="p">
                {{ PROVIDER_LABELS[p] }}
              </option>
            </select>
            <button
              class="text-text-hint hover:text-danger text-xs leading-none p-0.5"
              title="Remove"
              @click="removeFallbackAt(i)"
            >
              &times;
            </button>
          </div>
        </div>
        <div class="mt-1.5 flex gap-1.5">
          <select
            v-model="newFallback"
            class="flex-1 px-2 py-1 border border-border-subtle bg-bg-secondary text-text-primary rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="" disabled>Select provider</option>
            <option v-for="p in availableFallbacks" :key="p" :value="p">
              {{ PROVIDER_LABELS[p] }}
            </option>
          </select>
          <button
            class="px-2 py-1 bg-accent text-accent-foreground rounded text-xs hover:bg-accent-hover disabled:opacity-40"
            :disabled="!newFallback"
            @click="addFallback"
          >
            Add
          </button>
        </div>
        <p class="mt-1 text-2xs text-text-hint">Tried in order when the primary provider fails.</p>
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
            class="flex-1 px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
          v-if="connectionStatus"
          :class="[
            'mt-1 text-xs px-2 py-1 rounded',
            connectionStatus.success
              ? 'bg-bg-secondary text-success'
              : 'bg-bg-secondary text-danger'
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
          class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="">Select a model</option>
          <option v-for="model in availableModels" :key="model" :value="model">
            {{ model }}
          </option>
        </select>
      </div>
      <div>
        <label for="ollama-utility-model" class="block text-xs text-text-secondary mb-1">
          Utility model (optional)
        </label>
        <select
          id="ollama-utility-model"
          v-model="selectedUtilityModel"
          class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          @change="saveUtilityModel"
        >
          <option value="">Same as main model</option>
          <option v-for="model in availableModels" :key="model" :value="model">
            {{ model }}
          </option>
        </select>
        <p class="text-11px text-text-hint mt-1 leading-snug">
          Used for planning, metadata, relationships and spine — short structured calls, not prose.
          A smaller model that fits entirely in VRAM finishes these several times faster, and a
          10-chapter plan is ~11 of them before any prose is written.
        </p>
      </div>
    </div>

    <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
      <h3 class="text-sm font-medium text-text-primary">API Keys</h3>
      <p class="text-11px text-warning leading-snug">
        ⚠ Keys are encrypted and stored in localStorage (same-origin). Treat this as obfuscation —
        any code running on this page can read them. Use session-only keys or restricted API keys
        with spend limits.
      </p>
      <div v-for="p in NON_OLLAMA_PROVIDERS" :key="p" class="space-y-1">
        <label :for="'api-key-' + p" class="block text-xs text-text-secondary">{{
          PROVIDER_LABELS[p]
        }}</label>
        <div class="flex gap-2">
          <input
            :id="'api-key-' + p"
            v-model="apiKeys[p]"
            type="password"
            :placeholder="`${p} API key`"
            class="flex-1 px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent font-mono text-xs"
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
          v-if="providerStatus[p]"
          :class="[
            'mt-1 text-xs px-2 py-1 rounded',
            providerStatus[p].success
              ? 'bg-bg-secondary text-success'
              : 'bg-bg-secondary text-danger'
          ]"
        >
          {{ providerStatus[p].message }}
        </div>
      </div>
    </div>

    <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
      <h3 class="text-sm font-medium text-text-primary">Per-Feature Model Overrides</h3>
      <p class="text-2xs text-text-hint">
        Override the default provider/model for specific tasks. Set to "Default" to inherit from the
        global default above.
      </p>
      <div v-for="f in FEATURE_LIST" :key="f" class="flex gap-2 items-start">
        <div class="flex-1 min-w-0">
          <label :for="'feature-provider-' + f" class="block text-2xs text-text-secondary mb-0.5">{{
            FEATURE_LABELS[f]
          }}</label>
          <div class="flex gap-1.5">
            <select
              :id="'feature-provider-' + f"
              v-model="featureProviderSelections[f]"
              class="flex-[2] px-2 py-1 border border-border-subtle bg-bg-secondary text-text-primary rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent"
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
              class="flex-[3] px-2 py-1 border border-border-subtle bg-bg-secondary text-text-primary rounded text-xs focus:outline-none focus:ring-2 focus:ring-accent"
              :disabled="
                !featureProviderSelections[f] || featureProviderSelections[f] === 'default'
              "
            >
              <option value="">Auto</option>
              <option
                v-for="m in getModelsForProvider(featureProviderSelections[f])"
                :key="m"
                :value="m"
              >
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
        <label for="embedding-provider" class="block text-xs text-text-secondary mb-1"
          >Provider</label
        >
        <select
          id="embedding-provider"
          :value="settingsStore.embeddingProvider"
          class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
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
          class="w-full px-3 py-1.5 border border-border-subtle bg-bg-secondary text-text-primary rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          @change="settingsStore.setEmbeddingModel($event.target.value)"
        >
          <option value="nomic-embed-text">nomic-embed-text</option>
          <option
            v-for="m in EMBEDDING_MODELS[settingsStore.embeddingProvider] || []"
            :key="m"
            :value="m"
          >
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
        <div class="flex justify-between text-2xs text-text-hint mt-0.5">
          <span>More splits ({{ EMBEDDING_THRESHOLD_MIN }})</span>
          <span>Fewer splits ({{ EMBEDDING_THRESHOLD_MAX }})</span>
        </div>
      </div>
      <div v-if="settingsStore.embeddingProvider === 'mistral'" class="text-2xs text-text-hint">
        Mistral key loaded from <code>.env</code> file.
      </div>
      <div v-else class="text-2xs text-text-hint">Uses Ollama locally. No API key needed.</div>
    </div>

    <div class="flex gap-3 mt-6">
      <button
        class="flex-1 px-3 py-1.5 bg-bg-tertiary text-text-secondary rounded-lg hover:bg-surface-hover text-sm font-medium"
        @click="emit('close')"
      >
        Cancel
      </button>
      <button
        class="flex-1 px-3 py-1.5 bg-accent text-bg-primary rounded-lg hover:bg-accent-hover text-sm font-medium"
        @click="saveAllSettings"
      >
        Save
      </button>
    </div>
  </div>
</template>
