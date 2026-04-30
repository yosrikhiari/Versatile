<script setup>
import { ref, onMounted, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { getDailyGoal, setDailyGoal } from '../../services/dbService'
import { getAvailableModels, getStoredOpenAIKey, setStoredOpenAIKey } from '../../services/ollamaService'
import BaseIcon from '../shared/BaseIcon.vue'
import DatabaseRecovery from '../shared/DatabaseRecovery.vue'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close', 'model-changed'])

const projectStore = useProjectStore()
const settingsStore = useSettingsStore()
const goalInput = ref(500)
const availableModels = ref([])
const selectedModel = ref('')
const openAIKey = ref('')
const activeTab = ref('goals')
const ollamaEndpoint = ref('')
const testingConnection = ref(false)
const connectionStatus = ref(null)
const showRecovery = ref(false)

const MODEL_STORAGE_KEY = 'versatile_ollama_model'

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
  selectedModel.value = settingsStore.ollamaModel || localStorage.getItem(MODEL_STORAGE_KEY) || ''
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
    localStorage.setItem(MODEL_STORAGE_KEY, selectedModel.value)
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

watch(() => props.show, (newVal) => {
  if (newVal) {
    loadGoal()
    loadModels()
    loadOpenAIKey()
    loadEndpoint()
    activeTab.value = 'goals'
    connectionStatus.value = null
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="emit('close')">
      <div class="bg-bg-secondary border border-border-subtle rounded-xl shadow-xl p-6 max-w-md w-full">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-text-primary">Settings</h2>
          <button @click="emit('close')" class="text-text-hint hover:text-text-primary">
            <BaseIcon name="x" :size="20" />
          </button>
        </div>

        <div class="flex gap-2 mb-6 border-b border-border-subtle pb-2">
          <button
            @click="activeTab = 'goals'"
            :class="[
              'px-3 py-1.5 text-sm rounded-t',
              activeTab === 'goals' ? 'bg-bg-tertiary text-text-primary' : 'text-text-hint hover:text-text-secondary'
            ]"
          >
            Goals
          </button>
          <button
            @click="activeTab = 'ai'"
            :class="[
              'px-3 py-1.5 text-sm rounded-t',
              activeTab === 'ai' ? 'bg-bg-tertiary text-text-primary' : 'text-text-hint hover:text-text-secondary'
            ]"
          >
            AI Settings
          </button>
        </div>

        <div v-if="activeTab === 'goals'">
          <div class="mb-4">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Words per day
            </label>
            <input
              v-model.number="goalInput"
              type="number"
              min="1"
              step="50"
              class="w-full px-4 py-2 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          </div>
        </div>

        <div v-if="activeTab === 'ai'">
          <div class="mb-4">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Ollama Endpoint
            </label>
            <div class="flex gap-2">
              <input
                v-model="ollamaEndpoint"
                type="text"
                placeholder="http://localhost:11434"
                class="flex-1 px-4 py-2 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <button
                @click="testConnection"
                :disabled="testingConnection"
                class="px-4 py-2 bg-bg-tertiary text-text-secondary rounded-lg hover:bg-surface-hover disabled:opacity-50"
              >
                {{ testingConnection ? 'Testing...' : 'Test' }}
              </button>
            </div>
            <div v-if="connectionStatus" :class="[
              'mt-2 text-xs px-2 py-1 rounded',
              connectionStatus.success ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
            ]">
              {{ connectionStatus.message }}
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              Ollama Model
            </label>
            <select
              v-model="selectedModel"
              class="w-full px-4 py-2 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">Select a model</option>
              <option v-for="model in availableModels" :key="model" :value="model">
                {{ model }}
              </option>
            </select>
            <p class="mt-1 text-xs text-text-hint">
              Select the Ollama model to use for AI features.
            </p>
          </div>

          <div class="mb-4 pt-4 border-t border-border-subtle">
            <label class="block text-sm font-medium text-text-secondary mb-2">
              OpenAI API Key (Optional)
            </label>
            <input
              v-model="openAIKey"
              type="password"
              placeholder="sk-..."
              class="w-full px-4 py-2 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <p class="mt-1 text-xs text-text-hint">
              Fallback if Ollama is unavailable.
            </p>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            @click="emit('close')"
            class="flex-1 py-2 bg-surface-hover text-text-secondary rounded-lg font-medium hover:bg-bg-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Cancel
          </button>
          <button
            v-if="activeTab === 'goals'"
            @click="saveGoal"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Save
          </button>
          <button
            v-if="activeTab === 'ai'"
            @click="saveEndpoint(); saveModel(); saveOpenAIKey(); emit('close')"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
