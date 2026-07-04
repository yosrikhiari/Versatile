<template>
  <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div
      class="bg-bg-tertiary rounded-xl shadow-xl max-w-md w-full border border-border-subtle max-h-[90vh] overflow-y-auto"
    >
      <div class="p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Database Recovery</h2>
          <button class="text-text-secondary hover:text-text-primary" @click="$emit('close')">
            <BaseIcon name="x" :size="20" />
          </button>
        </div>

        <!-- Database Status -->
        <div class="mb-6">
          <h3 class="text-sm font-medium text-text-primary mb-2">Database Health</h3>
          <div class="bg-bg-secondary rounded-lg p-4">
            <div v-if="healthCheck" class="space-y-2">
              <div class="flex items-center gap-2">
                <BaseIcon
                  :name="healthCheck.healthy ? 'check-circle' : 'alert-circle'"
                  :class="healthCheck.healthy ? 'text-green-500' : 'text-red-500'"
                  :size="20"
                />
                <span
                  class="text-sm"
                  :class="healthCheck.healthy ? 'text-green-500' : 'text-red-500'"
                >
                  {{ healthCheck.healthy ? 'Database is healthy' : 'Database has issues' }}
                </span>
              </div>
              <div v-if="healthCheck.stores" class="text-xs text-text-secondary space-y-1">
                <div
                  v-for="(info, store) in healthCheck.stores"
                  :key="store"
                  class="flex justify-between"
                >
                  <span>{{ store }}:</span>
                  <span :class="info.status === 'ok' ? 'text-green-500' : 'text-red-500'">
                    {{ info.status === 'ok' ? info.count + ' records' : 'Error' }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="text-text-secondary text-sm">
              Click "Check Database" to verify health
            </div>
          </div>
        </div>

        <!-- Database Size -->
        <div v-if="dbSize" class="mb-6">
          <h3 class="text-sm font-medium text-text-primary mb-2">Database Size</h3>
          <div class="bg-bg-secondary rounded-lg p-4">
            <div class="text-sm text-text-secondary">
              <div>Size: {{ dbSize.sizeMB }} MB ({{ dbSize.sizeKB }} KB)</div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="space-y-3">
          <button
            :disabled="working"
            class="w-full py-2 px-4 bg-accent text-accent-foreground rounded-lg font-medium hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            @click="checkHealth"
          >
            <BaseIcon v-if="working" name="loader-2" :size="16" class="animate-spin mr-2" />
            Check Database Health
          </button>

          <button
            :disabled="working"
            class="w-full py-2 px-4 bg-surface-hover text-text-primary rounded-lg font-medium hover:bg-surface-hover/80 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            @click="exportData"
          >
            Export All Data
          </button>

          <label
            class="w-full py-2 px-4 bg-surface-hover text-text-primary rounded-lg font-medium hover:bg-surface-hover/80 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 cursor-pointer block text-center"
          >
            Import Backup
            <input
              type="file"
              accept=".json"
              class="hidden"
              :disabled="working"
              @change="handleFileImport"
            />
          </label>

          <button
            class="w-full py-2 px-4 text-danger hover:bg-danger/10 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-danger"
            @click="showResetConfirm = true"
          >
            Reset Database (Destructive)
          </button>
        </div>

        <!-- Reset Confirmation -->
        <div
          v-if="showResetConfirm"
          class="mt-4 p-4 bg-danger/10 rounded-lg border border-danger/20"
        >
          <p class="text-sm text-danger mb-3">
            <BaseIcon name="alert-circle" :size="16" class="mr-1" />
            This will delete ALL data in your database. This cannot be undone.
          </p>
          <div class="flex gap-2">
            <button
              :disabled="working"
              class="flex-1 py-2 px-4 bg-danger text-white rounded-lg font-medium hover:bg-danger/90 disabled:opacity-50"
              @click="resetDatabase"
            >
              <BaseIcon v-if="working" name="loader-2" :size="14" class="animate-spin mr-1" />
              Yes, Reset Database
            </button>
            <button
              :disabled="working"
              class="px-4 py-2 bg-surface-hover text-text-primary rounded-lg font-medium"
              @click="showResetConfirm = false"
            >
              Cancel
            </button>
          </div>
        </div>

        <!-- Status Messages -->
        <div
          v-if="status"
          class="mt-4 p-3 rounded-lg"
          :class="
            status.type === 'success'
              ? 'bg-green-500/10 border border-green-500/20'
              : 'bg-red-500/10 border border-red-500/20'
          "
        >
          <p class="text-sm" :class="status.type === 'success' ? 'text-green-200' : 'text-red-200'">
            {{ status.message }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  checkDatabaseHealth,
  exportAllData,
  importData,
  resetDatabaseVersion,
  getDatabaseSize
} from '../../services/dbRecovery'
import { useNotifications } from '../../composables/useNotifications'
import BaseIcon from './BaseIcon.vue'

defineEmits(['close'])

const { showConfirm } = useNotifications()

const working = ref(false)
const healthCheck = ref(null)
const dbSize = ref(null)
const status = ref(null)
const showResetConfirm = ref(false)

async function checkHealth() {
  working.value = true
  status.value = null
  try {
    healthCheck.value = await checkDatabaseHealth()
    dbSize.value = await getDatabaseSize()
    if (healthCheck.value.healthy) {
      status.value = { type: 'success', message: 'Database is healthy!' }
    } else {
      status.value = {
        type: 'error',
        message: 'Database has issues. Consider exporting your data.'
      }
    }
  } catch (err) {
    status.value = { type: 'error', message: 'Failed to check database: ' + err.message }
  } finally {
    working.value = false
  }
}

async function exportData() {
  working.value = true
  status.value = null
  try {
    const allData = await exportAllData()
    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `versatile-recovery-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    status.value = { type: 'success', message: 'Data exported successfully!' }
  } catch (err) {
    status.value = { type: 'error', message: 'Export failed: ' + err.message }
  } finally {
    working.value = false
  }
}

async function handleFileImport(event) {
  const file = event.target.files[0]
  if (!file) return

  working.value = true
  status.value = null

  try {
    const text = await file.text()
    const data = JSON.parse(text)

    if (
      !(await showConfirm(
        'Import Backup',
        'This will replace ALL existing data. Continue?',
        'Import',
        'danger'
      ))
    ) {
      working.value = false
      return
    }

    await importData(data)
    status.value = { type: 'success', message: 'Data imported successfully!' }

    // Refresh health check
    setTimeout(() => checkHealth(), 1000)
  } catch (err) {
    status.value = { type: 'error', message: 'Import failed: ' + err.message }
  } finally {
    working.value = false
    event.target.value = '' // Reset input
  }
}

async function resetDatabase() {
  if (
    !(await showConfirm(
      'Reset Database',
      'ARE YOU SURE? This will delete ALL data permanently!',
      'Delete Data',
      'danger'
    ))
  ) {
    return
  }

  working.value = true
  status.value = null

  try {
    await resetDatabaseVersion()
    status.value = { type: 'success', message: 'Database reset. Please refresh the page.' }
    showResetConfirm.value = false
  } catch (err) {
    status.value = { type: 'error', message: 'Reset failed: ' + err.message }
  } finally {
    working.value = false
  }
}
</script>
