<script setup>
import { ref, computed } from 'vue'
import { useBranchStore } from '../../stores/branchStore'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import BaseIcon from '../shared/BaseIcon.vue'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['close'])

const branchStore = useBranchStore()
const projectStore = useProjectStore()
const manuscriptStore = useManuscriptStore()

const searchQuery = ref('')
const newBranchName = ref('')
const renameMap = ref({})
const renamingId = ref(null)

const branches = computed(() => branchStore.branches)

const filteredBranches = computed(() => {
  if (!searchQuery.value.trim()) return branches.value
  const q = searchQuery.value.toLowerCase()
  return branches.value.filter((b) => b.name.toLowerCase().includes(q))
})

async function handleSwitch(branchId) {
  await branchStore.setActiveBranch(branchId)
  manuscriptStore.loadManuscript(projectStore.currentProjectId)
}

async function handleDelete(branch) {
  await branchStore.removeBranch(branch.id)
}

async function handleCreate() {
  const name = newBranchName.value?.trim()
  if (!name) return
  await branchStore.forkBranch(projectStore.currentProjectId, name)
  newBranchName.value = ''
}

function startRename(branch) {
  renamingId.value = branch.id
  renameMap.value[branch.id] = branch.name
}

async function confirmRename(branch) {
  const newName = renameMap.value[branch.id]?.trim()
  if (newName && newName !== branch.name) {
    await branchStore.renameBranch(branch.id, newName)
  }
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

function handleOverlayClick(event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays < 1) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays} days ago`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`
  const diffYears = Math.floor(diffMonths / 12)
  return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/60"
        @click="handleOverlayClick"
      >
        <div
          class="bg-bg-primary rounded-xl shadow-warm-2xl w-full max-w-2xl mx-4 overflow-hidden border border-border-subtle"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
            <h2 class="text-base font-semibold text-text-primary">Branches</h2>
            <div class="flex items-center gap-2">
              <span class="text-xs text-text-hint tabular-nums"
                >{{ branches.length }} branches</span
              >
              <button
                class="p-1 text-text-hint hover:text-text-primary rounded-lg hover:bg-surface-hover transition-all duration-150 btn-ghost"
                @click="emit('close')"
              >
                <BaseIcon name="x" :size="18" />
              </button>
            </div>
          </div>

          <!-- Toolbar: search + create -->
          <div class="flex items-center gap-3 px-6 py-3 border-b border-border-subtle">
            <div class="relative flex-1">
              <BaseIcon
                name="search"
                :size="14"
                class="absolute left-3 top-1/2 -translate-y-1/2 text-text-hint pointer-events-none"
              />
              <input
                v-model="searchQuery"
                placeholder="Find a branch..."
                class="w-full h-9 pl-9 pr-3 text-sm rounded-lg bg-bg-tertiary border border-border-subtle text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-shadow"
              />
            </div>
            <form class="flex gap-2 shrink-0" @submit.prevent="handleCreate">
              <input
                v-model="newBranchName"
                placeholder="New branch name"
                class="h-9 w-44 px-3 text-sm rounded-lg bg-bg-tertiary border border-border-subtle text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-2 focus:ring-accent transition-shadow"
              />
              <button
                type="submit"
                class="h-9 px-4 text-sm font-medium rounded-lg bg-accent text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-40 transition-all"
                :disabled="!newBranchName.trim()"
              >
                New branch
              </button>
            </form>
          </div>

          <!-- Branch list -->
          <div class="max-h-[55vh] overflow-y-auto scrollbar-thin">
            <div v-for="(branch, idx) in filteredBranches" :key="branch.id" class="group">
              <div
                class="px-6 py-3 flex items-center gap-4 hover:bg-surface-hover transition-colors"
              >
                <!-- Branch icon + name -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <BaseIcon
                      name="git-branch"
                      :size="15"
                      class="shrink-0 mt-px"
                      :class="
                        branch.id === branchStore.activeBranchId ? 'text-accent' : 'text-text-hint'
                      "
                    />
                    <template v-if="renamingId === branch.id">
                      <input
                        v-model="renameMap[branch.id]"
                        class="h-7 px-2 text-sm rounded bg-bg-tertiary border border-border-subtle text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                        autofocus
                        @keydown.enter="confirmRename(branch)"
                        @keydown.escape="cancelRename"
                        @blur="confirmRename(branch)"
                      />
                    </template>
                    <button
                      v-else
                      class="text-sm font-semibold text-accent hover:underline truncate text-left"
                      @click="handleSwitch(branch.id)"
                    >
                      {{ branch.name }}
                    </button>
                    <span
                      v-if="branch.name === 'main'"
                      class="text-xs px-1.5 py-0.5 rounded-full font-medium border shrink-0"
                      :style="{
                        borderColor:
                          'color-mix(in srgb, var(--vers-accent-primary) 30%, transparent)',
                        background:
                          'color-mix(in srgb, var(--vers-accent-primary) 12%, transparent)',
                        color: 'var(--vers-accent-primary)'
                      }"
                    >
                      default
                    </span>
                    <span
                      v-if="branch.id === branchStore.activeBranchId && branch.name !== 'main'"
                      class="text-xs px-1.5 py-0.5 rounded-full font-medium border shrink-0"
                      :style="{
                        borderColor:
                          'color-mix(in srgb, var(--vers-status-success) 30%, transparent)',
                        background:
                          'color-mix(in srgb, var(--vers-status-success) 12%, transparent)',
                        color: 'var(--vers-status-success)'
                      }"
                    >
                      active
                    </span>
                  </div>
                  <div class="flex items-center gap-2 mt-0.5 ml-[23px]">
                    <span class="text-xs text-text-hint">{{
                      timeAgo(branch.createdAt) ? `Updated ${timeAgo(branch.createdAt)}` : ''
                    }}</span>
                  </div>
                </div>

                <!-- Actions -->
                <div
                  class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <button
                    v-if="branch.id !== branchStore.activeBranchId"
                    class="grid place-items-center w-8 h-8 rounded-md text-text-hint hover:text-accent hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title="Switch to this branch"
                    @click="handleSwitch(branch.id)"
                  >
                    <BaseIcon name="arrow-left-right" :size="15" />
                  </button>
                  <button
                    class="grid place-items-center w-8 h-8 rounded-md text-text-hint hover:text-text-primary hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title="Rename branch"
                    @click="startRename(branch)"
                  >
                    <BaseIcon name="pencil" :size="15" />
                  </button>
                  <button
                    v-if="branch.name !== 'main'"
                    class="grid place-items-center w-8 h-8 rounded-md text-text-hint hover:text-status-danger hover:bg-status-danger/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    title="Delete this branch"
                    @click="handleDelete(branch)"
                  >
                    <BaseIcon name="trash-2" :size="15" />
                  </button>
                </div>
              </div>
              <div
                v-if="idx < filteredBranches.length - 1"
                class="mx-6 border-b border-border-subtle"
              ></div>
            </div>

            <div
              v-if="filteredBranches.length === 0"
              class="text-center py-12 text-text-hint text-sm"
            >
              {{
                searchQuery
                  ? 'No branches match your search.'
                  : 'No branches yet. Create one above.'
              }}
            </div>
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
.modal-enter-from > div:last-child,
.modal-leave-to > div:last-child {
  transform: scale(0.96);
}
</style>
