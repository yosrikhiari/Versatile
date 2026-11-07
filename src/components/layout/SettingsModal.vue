<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useProjectStore } from '../../stores/projectStore'
import { useAuthStore } from '../../stores/authStore'
import { getSyncEngine, syncStatus } from '../../services/sync-engine'
import { hasToken } from '../../services/api'
import { useNetworkStatus } from '../../composables/useNetworkStatus'
import { useNotifications } from '../../composables/useNotifications'
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

// Escape closes like every other modal (shared Modal.vue does this; this
// bespoke shell never did — Escape left the backdrop swallowing all clicks).
function onKeydown(e) {
  if (e.key === 'Escape' && props.show) emit('close')
}

watch(
  () => props.show,
  (visible) => {
    if (visible) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

const projectStore = useProjectStore()
const authStore = useAuthStore()
const { addToast } = useNotifications()
const { pendingCount, refreshPendingCount } = useNetworkStatus({ pollMs: 10000 })
const activeTab = ref('ai')
const activeLearning = useActiveLearning()
const showVoiceUpload = ref(false)
const syncBusy = ref(false)
/** @type {import('vue').Ref<number | null>} */
const eligibleLocalCount = ref(null)
const canServerSync = computed(() => hasToken() && !!authStore.user)

async function refreshMigrationPreview() {
  if (!canServerSync.value) {
    eligibleLocalCount.value = null
    return
  }
  try {
    const engine = getSyncEngine()
    await engine.init()
    const { eligible } = await engine.countLocalRowsForSync()
    eligibleLocalCount.value = eligible
  } catch {
    eligibleLocalCount.value = null
  }
}

watch(
  () => [props.show, activeTab.value, canServerSync.value],
  ([visible, tab]) => {
    if (visible && tab === 'sync') refreshMigrationPreview().catch(() => {})
  }
)

function formatSyncTime(value) {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

async function syncNow() {
  if (!canServerSync.value) {
    addToast('Sign in to a server account to sync across browsers.', 'warning')
    return
  }
  syncBusy.value = true
  try {
    const engine = getSyncEngine()
    await engine.init()
    await engine.syncNow()
    await refreshPendingCount()
    await refreshMigrationPreview()
    if (syncStatus.state === 'error' || syncStatus.lastError) {
      addToast(syncStatus.lastError || 'Sync finished with errors.', 'warning')
    } else {
      addToast('Sync complete.', 'success')
    }
  } catch (err) {
    addToast(err?.message || 'Sync failed.', 'error')
  } finally {
    syncBusy.value = false
  }
}

async function migrateLocalData() {
  if (!canServerSync.value) {
    addToast('Sign in to a server account first.', 'warning')
    return
  }
  syncBusy.value = true
  try {
    const engine = getSyncEngine()
    await engine.init()
    const { queued } = await engine.queueLocalRowsForSync()
    await engine.syncNow()
    await refreshPendingCount()
    await refreshMigrationPreview()
    addToast(
      queued > 0
        ? `Queued ${queued} local record(s) and synced.`
        : 'No unsynced local records found. Sync completed.',
      'success'
    )
  } catch (err) {
    addToast(err?.message || 'Migration sync failed.', 'error')
  } finally {
    syncBusy.value = false
  }
}

// The daily word goal used to live here as a "Goals" tab holding one number
// input — which made the modal collapse to almost nothing on open. It is stored
// per project, so it moved to Project Settings > General, next to the rest of
// that project's configuration and where the header's goal bar already leads.
const tabOptions = [
  { key: 'ai', label: 'AI Providers' },
  { key: 'eval', label: 'Evaluation' },
  { key: 'voice', label: 'Voice' },
  { key: 'sync', label: 'Sync' },
  { key: 'privacy', label: 'Privacy' }
]

async function runActiveLearning() {
  const pid = projectStore.currentProjectId
  if (!pid) return
  await activeLearning.analyze(pid)
}

watch(
  () => props.show,
  (newVal) => {
    if (newVal) activeTab.value = 'ai'
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
            <h2 class="type-display text-sm text-text-primary">Settings</h2>
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

          <!--
            `@close` was never wired: this tab's own Save button ends in
            `emit('close')`, so it saved and then sat there looking like nothing
            had happened.
          -->
          <AISettingsTab
            v-if="activeTab === 'ai'"
            @model-changed="emit('model-changed')"
            @close="emit('close')"
          />

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
                Upload sample text
              </button>
            </div>
            <VoiceUploadModal :is-open="showVoiceUpload" @close="showVoiceUpload = false" />
          </div>

          <div v-if="activeTab === 'sync'" class="space-y-4">
            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">Cloud sync</h3>
              <p class="text-xs text-text-secondary leading-relaxed">
                Sign in to a server account to sync synced project data across browsers. This device
                keeps a local copy (offline-first). Sync is not end-to-end encrypted, and
                simultaneous edits use last-writer-wins — see the sync limitations in project docs.
              </p>
              <p v-if="!canServerSync" class="text-xs text-warning">
                You’re not signed in to a server account. Local-only browser accounts don’t sync
                across browsers.
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-2">
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-text-secondary">Status</span>
                <span class="text-xs text-text-primary font-medium capitalize">{{
                  syncStatus.state || 'idle'
                }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-text-secondary">Last sync</span>
                <span class="text-xs text-text-primary">{{
                  formatSyncTime(syncStatus.lastSync)
                }}</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span class="text-xs text-text-secondary">Pending local changes</span>
                <span class="text-xs text-text-primary tabular-nums">{{ pendingCount }}</span>
              </div>
              <p v-if="syncStatus.lastError" class="text-xs text-danger pt-1">
                {{ syncStatus.lastError }}
              </p>
              <p v-if="syncStatus.failedTables?.length" class="text-xs text-warning">
                Needs attention: {{ syncStatus.failedTables.join(', ') }}
              </p>
            </div>

            <div class="bg-bg-tertiary rounded-lg p-4 space-y-3">
              <h3 class="text-sm font-medium text-text-primary">Actions</h3>
              <p v-if="canServerSync" class="text-xs text-text-secondary">
                Local records never uploaded (eligible to queue):
                <span class="text-text-primary tabular-nums">{{ eligibleLocalCount ?? '—' }}</span>
              </p>
              <div class="flex flex-wrap gap-2">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :disabled="!canServerSync || syncBusy || syncStatus.state === 'syncing'"
                  @click="syncNow"
                >
                  {{ syncBusy || syncStatus.state === 'syncing' ? 'Syncing...' : 'Sync now' }}
                </BaseButton>
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :disabled="!canServerSync || syncBusy || syncStatus.state === 'syncing'"
                  @click="migrateLocalData"
                >
                  {{
                    eligibleLocalCount && eligibleLocalCount > 0
                      ? `Queue ${eligibleLocalCount} local record(s)`
                      : 'Queue unsynced local data'
                  }}
                </BaseButton>
                <BaseButton
                  v-if="canServerSync"
                  variant="ghost"
                  size="sm"
                  :disabled="syncBusy || syncStatus.state === 'syncing'"
                  @click="refreshMigrationPreview"
                >
                  Refresh
                </BaseButton>
              </div>
              <p class="text-xs text-text-secondary leading-relaxed">
                "Queue unsynced local data" marks local records that were never uploaded as pending,
                then runs sync. Use this after signing in on a device that already has local
                projects. It does not upload local-only tables (settings, caches, study data, etc.).
              </p>
            </div>
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

          <!--
            "Close", not "Cancel". Nothing here is discardable: the AI tab has
            its own Save, and every other panel writes as you change it. Offering
            "Cancel" promised a rollback that never existed.
          -->
          <div class="flex justify-end mt-6">
            <BaseButton variant="secondary" size="md" @click="emit('close')"> Close </BaseButton>
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
