<script setup>
import { ref, watch } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { getDailyGoal, setDailyGoal } from '../../services/dbService'
import BaseIcon from '../shared/BaseIcon.vue'
import BaseTab from '../ui/BaseTab.vue'
import BaseButton from '../ui/BaseButton.vue'
import VoiceProfileDisplay from '../shared/VoiceProfileDisplay.vue'
import VoiceUploadModal from './VoiceUploadModal.vue'
import AISettingsTab from './AISettingsTab.vue'
import ActiveLearningPanel from '../eval/ActiveLearningPanel.vue'
import { useActiveLearning } from '../../composables/useActiveLearning'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close', 'model-changed'])

const projectStore = useProjectStore()
const goalInput = ref(500)
const activeTab = ref('goals')
const activeLearning = useActiveLearning()
const showVoiceUpload = ref(false)

const tabOptions = [
  { key: 'goals', label: 'Goals' },
  { key: 'ai', label: 'AI Providers' },
  { key: 'eval', label: 'Evaluation' },
  { key: 'voice', label: 'Voice' },
  { key: 'privacy', label: 'Privacy' }
]

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

async function runActiveLearning() {
  const pid = projectStore.currentProjectId
  if (!pid) return
  await activeLearning.analyze(pid)
}

watch(
  () => props.show,
  async (newVal) => {
    if (newVal) {
      loadGoal()
      activeTab.value = 'goals'
    }
  }
)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        @click.self="emit('close')"
      >
        <div
          class="glass-modal rounded-xl shadow-warm-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto scrollbar-thin"
        >
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-ui font-semibold text-text-primary tracking-wide">Settings</h2>
            <button
              class="text-text-hint hover:text-text-primary transition-all duration-150 btn-ghost rounded-lg p-1"
              @click="emit('close')"
            >
              <BaseIcon name="x" :size="20" />
            </button>
          </div>

          <div class="flex gap-1 mb-6 border-b border-border-subtle pb-2">
            <BaseTab
              v-for="t in tabOptions"
              :key="t.key"
              variant="segment"
              size="sm"
              :active="activeTab === t.key"
              @click="activeTab = t.key"
            >
              {{ t.label }}
            </BaseTab>
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
                class="w-full px-4 py-2 border border-border-subtle bg-bg-tertiary text-text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          <AISettingsTab v-if="activeTab === 'ai'" @model-changed="emit('model-changed')" />

          <div v-if="activeTab === 'eval'" class="space-y-4">
            <ActiveLearningPanel
              :analysis-report="activeLearning.analysisReport.value"
              :analysis-error="activeLearning.analysisError.value"
              :is-analyzing="activeLearning.isAnalyzing.value"
              :recommendations="activeLearning.recommendations.value"
              :below-threshold-recs="activeLearning.belowThresholdRecs.value"
              :no-data-recs="activeLearning.noDataRecs.value"
              :has-actionable-items="activeLearning.hasActionableItems.value"
              :calibration="activeLearning.calibration.value"
              :get-custom-threshold="activeLearning.getCustomThreshold"
              :set-custom-threshold="activeLearning.setCustomThreshold"
              :get-calibration-example="activeLearning.getCalibrationExample"
              :set-calibration-example="activeLearning.setCalibrationExample"
              :reset-thresholds="activeLearning.resetThresholds"
              :reset-all-for-workspace="activeLearning.resetAllForWorkspace"
              @run-analysis="runActiveLearning"
            />
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

          <div v-if="activeTab === 'privacy'" class="space-y-5">
            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">Your Data, Your Control</h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                Versatile is designed so your novel never leaves your device except to the AI
                provider you explicitly choose. Here's how your data is handled:
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">Local Storage (IndexedDB)</h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                Your manuscripts, story bible, character profiles, scene graph, and all writing data
                are stored entirely in your browser's IndexedDB database on your local machine. No
                copy is sent to any server for storage.
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">AI Provider Data</h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                When you generate prose, evaluate scenes, or use AI-assisted features, the relevant
                context (scene text, prompts, character data) is sent to the AI provider you have
                configured in the AI Providers tab. Your API keys are stored locally in your browser
                — we never send them to our servers.
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">
                Backend &amp; Multi-Tenant Isolation
              </h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                If you use the optional backend sync, all data is isolated per organization using
                row-level security. Every database query is scoped to your organization's ID,
                enforced at both the API layer and the database level so no other user can access
                your work.
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">Export &amp; Backup</h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                You can export your entire project — manuscript, bible, and scene graph — as a
                single JSON file at any time via the Editor menu. Restore it later on any device.
                This gives you full portability and an offline backup you control.
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">Encryption</h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                IndexedDB storage is encrypted at rest by the browser's native encryption
                mechanisms. Communication with AI providers and the backend API is encrypted via
                TLS/HTTPS in transit.
              </p>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <BaseButton variant="secondary" size="md" class="flex-1" @click="emit('close')">
              Cancel
            </BaseButton>
            <BaseButton
              v-if="activeTab === 'goals'"
              variant="primary"
              size="md"
              class="flex-1"
              @click="saveGoal"
            >
              Save
            </BaseButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from > div,
.modal-leave-to > div {
  transform: scale(0.95);
}
</style>
