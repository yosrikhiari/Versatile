<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSnapshotStore } from '../../stores/snapshotStore'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import { useDebounceFn } from '@vueuse/core'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean,
  chapterId: Number
})

const emit = defineEmits(['close', 'restored'])

const snapshotStore = useSnapshotStore()
const projectStore = useProjectStore()
const manuscriptStore = useManuscriptStore()

const selectedSnapshot = ref(null)
const showConfirmRestore = ref(false)
const pendingRestore = ref(null)
const labelInput = ref('')
const showLabelInput = ref(false)
const newLabel = ref('')

const chapterSnapshots = computed(() => {
  if (props.chapterId === null) return []
  return snapshotStore.snapshots.filter(s => s.chapterId === props.chapterId)
})

const currentChapterContent = computed(() => {
  if (props.chapterId === null) return ''
  const scene = manuscriptStore.scenes.find(s => s.id === props.chapterId)
  return scene?.content || ''
})

function formatDate(ts) {
  const d = new Date(ts)
  return d.toLocaleString()
}

function getWordCount(content) {
  if (!content) return 0
  return content.split(/\s+/).filter(w => w.length > 0).length
}

function previewDiff(snapshot) {
  return snapshot.content || ''
}

function selectSnapshot(snapshot) {
  if (selectedSnapshot.value?.id === snapshot.id) {
    selectedSnapshot.value = null
  } else {
    selectedSnapshot.value = snapshot
  }
}

async function confirmRestore() {
  if (!selectedSnapshot.value) return
  pendingRestore.value = selectedSnapshot.value
  showConfirmRestore.value = true
}

async function doRestore() {
  if (!pendingRestore.value || !projectStore.currentProjectId) return
  await snapshotStore.restoreSnapshot(pendingRestore.value.id, projectStore.currentProjectId)
  emit('restored', pendingRestore.value.content)
  showConfirmRestore.value = false
  pendingRestore.value = null
  selectedSnapshot.value = null
}

async function removeSnapshot(snapshot) {
  if (!projectStore.currentProjectId) return
  if (confirm(`Delete this snapshot from ${formatDate(snapshot.timestamp)}?`)) {
    await snapshotStore.removeSnapshot(snapshot.id, projectStore.currentProjectId)
    if (selectedSnapshot.value?.id === snapshot.id) {
      selectedSnapshot.value = null
    }
  }
}

async function saveWithLabel() {
  if (!newLabel.value.trim() || !projectStore.currentProjectId || props.chapterId === null) return
  await snapshotStore.saveNewSnapshot(
    projectStore.currentProjectId,
    props.chapterId,
    currentChapterContent.value,
    newLabel.value.trim()
  )
  newLabel.value = ''
  showLabelInput.value = false
}

const autoSaveManual = useDebounceFn(() => {
  if (!projectStore.currentProjectId || props.chapterId === null) return
  if (currentChapterContent.value) {
    snapshotStore.saveNewSnapshot(
      projectStore.currentProjectId,
      props.chapterId,
      currentChapterContent.value,
      'manual save'
    )
  }
}, 2000)

onMounted(() => {
  if (projectStore.currentProjectId) {
    snapshotStore.loadSnapshots(projectStore.currentProjectId)
  }
})

onUnmounted(() => {
  snapshotStore.stopAutoSave()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 bg-black/30 z-50 flex justify-end"
      @click.self="emit('close')"
    >
      <div class="w-[420px] h-full bg-bg-secondary border-l border-border-subtle flex flex-col overflow-hidden shadow-xl">
        <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between shrink-0">
          <span class="font-spark text-accent tracking-wide">History</span>
          <div class="flex items-center gap-2">
            <button
              @click="showLabelInput = true"
              class="px-2 py-1 text-xs bg-bg-tertiary text-text-secondary rounded hover:bg-surface-hover font-ui"
              title="Save snapshot with label"
            >
              <BaseIcon name="save" :size="14" />
            </button>
            <button
              @click="emit('close')"
              class="text-text-hint hover:text-text-secondary"
            >
              <BaseIcon name="x" :size="18" />
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="chapterSnapshots.length === 0" class="text-center py-12">
            <BaseIcon name="clock" :size="32" class="text-text-hint mx-auto mb-3" />
            <p class="text-sm text-text-hint font-ui">No snapshots yet</p>
            <p class="text-xs text-text-hint font-ui mt-1">Save manually or auto-save will create them</p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="snapshot in chapterSnapshots"
              :key="snapshot.id"
              :class="[
                'rounded-lg border transition-all cursor-pointer',
                selectedSnapshot?.id === snapshot.id
                  ? 'border-accent bg-accent/5'
                  : 'border-border-subtle hover:border-text-hint'
              ]"
              @click="selectSnapshot(snapshot)"
            >
              <div class="p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-text-hint font-ui">
                      {{ formatDate(snapshot.timestamp) }}
                    </div>
                    <div v-if="snapshot.label" class="text-sm text-text-primary font-ui mt-0.5 truncate">
                      {{ snapshot.label }}
                    </div>
                    <div class="text-xs text-text-hint font-ui mt-0.5">
                      {{ getWordCount(snapshot.content) }} words
                    </div>
                  </div>
                  <button
                    @click.stop="removeSnapshot(snapshot)"
                    class="text-text-hint hover:text-danger shrink-0 p-1"
                    title="Delete snapshot"
                  >
                    <BaseIcon name="trash-2" :size="14" />
                  </button>
                </div>

                <div v-if="selectedSnapshot?.id === snapshot.id" class="mt-3 pt-3 border-t border-border-subtle">
                  <div class="text-xs text-text-hint font-ui mb-2">Preview</div>
                  <div class="text-sm text-text-secondary font-body max-h-40 overflow-y-auto bg-bg-tertiary rounded p-2 whitespace-pre-wrap">
                    {{ previewDiff(snapshot).slice(0, 500) }}{{ previewDiff(snapshot).length > 500 ? '...' : '' }}
                  </div>
                  <button
                    @click.stop="confirmRestore"
                    class="mt-2 w-full py-1.5 bg-accent text-white text-xs rounded font-ui hover:bg-accent/90"
                  >
                    Restore this version
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="px-4 py-3 border-t border-border-subtle shrink-0">
          <button
            @click="autoSaveManual"
            class="w-full py-2 bg-bg-tertiary text-text-secondary text-sm rounded-lg hover:bg-surface-hover font-ui"
          >
            Save Snapshot Now
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showConfirmRestore"
      class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      @click.self="showConfirmRestore = false"
    >
      <div class="bg-bg-tertiary rounded-xl shadow-xl p-6 max-w-sm w-full border border-border-subtle">
        <h3 class="text-lg font-semibold text-text-primary mb-2 font-ui">Restore Snapshot?</h3>
        <p class="text-sm text-text-secondary mb-4 font-ui">
          This will replace the current scene content with the snapshot from {{ pendingRestore ? formatDate(pendingRestore.timestamp) : '' }}.
          This cannot be undone.
        </p>
        <div class="flex gap-2">
          <button
            @click="showConfirmRestore = false"
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
          >
            Cancel
          </button>
          <button
            @click="doRestore"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui"
          >
            Restore
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showLabelInput"
      class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      @click.self="showLabelInput = false"
    >
      <div class="bg-bg-tertiary rounded-xl shadow-xl p-6 max-w-sm w-full border border-border-subtle">
        <h3 class="text-lg font-semibold text-text-primary mb-2 font-ui">Label Snapshot</h3>
        <input
          v-model="newLabel"
          type="text"
          placeholder="e.g. Before adding climax..."
          class="w-full px-3 py-2 border border-border-subtle rounded-lg bg-bg-secondary text-text-primary text-sm mb-4 font-ui focus:outline-none focus:ring-2 focus:ring-accent/50"
          @keyup.enter="saveWithLabel"
          autofocus
        />
        <div class="flex gap-2">
          <button
            @click="showLabelInput = false; newLabel = ''"
            class="flex-1 py-2 bg-bg-secondary text-text-secondary rounded-lg font-medium hover:bg-surface-hover font-ui"
          >
            Cancel
          </button>
          <button
            @click="saveWithLabel"
            :disabled="!newLabel.trim()"
            class="flex-1 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 font-ui disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>