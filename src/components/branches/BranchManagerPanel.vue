<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useBranchStore } from '../../stores/branchStore'
import { useProjectStore } from '../../stores/projectStore'
import { useManuscriptStore } from '../../stores/manuscriptStore'
import BaseIcon from '../shared/BaseIcon.vue'

const branchStore = useBranchStore()
const projectStore = useProjectStore()
const manuscriptStore = useManuscriptStore()

const newBranchName = ref('')
const renameMap = ref({})
const renamingId = ref(null)
const compareA = ref(null)
const compareB = ref(null)

const branches = computed(() => branchStore.branches)

async function handleSwitch(branchId) {
  await branchStore.setActiveBranch(branchId)
}

function handleBranchSwitch() {
  manuscriptStore.loadManuscript(projectStore.currentProjectId)
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

async function handleDelete(branch) {
  await branchStore.removeBranch(branch.id)
}

async function handleCreate() {
  const name = newBranchName.value?.trim()
  if (!name) return
  await branchStore.forkBranch(projectStore.currentProjectId, name)
  newBranchName.value = ''
}

function statusLabel(status) {
  const map = { active: 'Active', merged: 'Merged', archived: 'Archived' }
  return map[status] || status
}

function statusColor(status) {
  const map = {
    active: 'var(--vers-status-success)',
    merged: 'var(--vers-status-info)',
    archived: 'var(--vers-text-muted)'
  }
  return map[status] || 'var(--vers-text-muted)'
}
</script>

<template>
  <div class="flex flex-col h-full">
    <header
      class="flex items-center justify-between px-4 h-12 border-b border-border-subtle shrink-0"
    >
      <h2 class="text-sm font-semibold text-text-primary">Branches</h2>
      <span class="text-2xs text-text-hint tabular-nums">{{ branches.length }} total</span>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <!-- Create new branch -->
      <div class="p-3 border-b border-border-subtle">
        <form class="flex gap-2" @submit.prevent="handleCreate">
          <input
            v-model="newBranchName"
            placeholder="New branch name..."
            class="flex-1 h-8 px-2.5 text-xs rounded-md bg-bg-tertiary border border-border-subtle text-text-primary placeholder:text-text-hint focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            class="h-8 px-3 text-xs font-medium rounded-md bg-accent text-accent-foreground hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-40 transition-opacity"
            :disabled="!newBranchName.trim()"
          >
            Create
          </button>
        </form>
      </div>

      <!-- Branch list -->
      <div class="p-2 space-y-1">
        <div
          v-for="branch in branches"
          :key="branch.id"
          class="group relative flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors duration-150"
          :class="[
            branch.id === branchStore.activeBranchId ? 'bg-accent/10' : 'hover:bg-surface-hover'
          ]"
        >
          <!-- Active indicator -->
          <div
            v-if="branch.id === branchStore.activeBranchId"
            class="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-sm bg-accent"
          ></div>

          <!-- Branch info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <BaseIcon
                :name="branch.name === 'main' ? 'git-branch' : 'git-branch'"
                :size="14"
                class="shrink-0"
                :class="branch.id === branchStore.activeBranchId ? 'text-accent' : 'text-text-hint'"
              />
              <template v-if="renamingId === branch.id">
                <input
                  ref="renameInput"
                  v-model="renameMap[branch.id]"
                  class="flex-1 h-7 px-2 text-xs rounded bg-bg-tertiary border border-border-subtle text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  @keydown.enter="confirmRename(branch)"
                  @keydown.escape="cancelRename"
                  @blur="confirmRename(branch)"
                />
              </template>
              <span v-else class="text-sm text-text-primary truncate font-medium">
                {{ branch.name }}
              </span>
              <span
                v-if="branch.name === 'main'"
                class="text-2xs px-1.5 py-0.5 rounded-full font-medium"
                style="
                  background: color-mix(in srgb, var(--vers-accent-primary) 15%, transparent);
                  color: var(--vers-accent-primary);
                "
              >
                default
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span
                class="text-2xs px-1.5 py-px rounded-full font-medium"
                :style="{
                  background: `color-mix(in srgb, ${statusColor(branch.status)} 15%, transparent)`,
                  color: statusColor(branch.status)
                }"
              >
                {{ statusLabel(branch.status) }}
              </span>
              <span v-if="branch.sourceBranchId" class="text-2xs text-text-hint">
                from {{ String(branch.sourceBranchId).slice(0, 8) }}
              </span>
              <span v-if="branch.createdAt" class="text-2xs text-text-hint">
                {{ new Date(branch.createdAt).toLocaleDateString() }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              v-if="branch.id !== branchStore.activeBranchId"
              class="grid place-items-center w-7 h-7 rounded text-text-hint hover:text-text-primary hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Switch to this branch"
              @click="
                handleSwitch(branch.id)
                handleBranchSwitch()
              "
            >
              <BaseIcon name="arrow-right" :size="14" />
            </button>
            <button
              class="grid place-items-center w-7 h-7 rounded text-text-hint hover:text-text-primary hover:bg-surface-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Rename"
              @click="startRename(branch)"
            >
              <BaseIcon name="pencil" :size="14" />
            </button>
            <button
              v-if="branch.name !== 'main'"
              class="grid place-items-center w-7 h-7 rounded text-text-hint hover:text-status-danger hover:bg-status-danger/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              title="Delete branch"
              @click="handleDelete(branch)"
            >
              <BaseIcon name="trash-2" :size="14" />
            </button>
          </div>
        </div>

        <div v-if="branches.length === 0" class="text-center py-8 text-text-hint text-xs">
          No branches yet. Create one above.
        </div>
      </div>
    </div>
  </div>
</template>
