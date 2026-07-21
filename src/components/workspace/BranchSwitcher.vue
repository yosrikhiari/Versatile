<script setup>
import { ref, computed } from 'vue'
import { useBranchStore } from '../../stores/branchStore'
import { useProjectStore } from '../../stores/projectStore'
import BaseIcon from '../shared/BaseIcon.vue'
import AppTooltip from '../shared/AppTooltip.vue'

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['switch'])

const branchStore = useBranchStore()
const projectStore = useProjectStore()

const open = ref(false)
const renaming = ref(null)
const renameValue = ref('')

const sortedBranches = computed(() => {
  return [...branchStore.branches].sort((a, b) => {
    if (a.name === 'main') return -1
    if (b.name === 'main') return 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
})

function toggle() {
  open.value = !open.value
}

function select(id) {
  branchStore.setActiveBranch(id)
  open.value = false
  emit('switch', id)
}

function startRename(branch) {
  renaming.value = branch.id
  renameValue.value = branch.name
}

async function confirmRename(id) {
  if (renameValue.value.trim()) {
    await branchStore.renameBranch(id, renameValue.value.trim())
  }
  renaming.value = null
}

function cancelRename() {
  renaming.value = null
}

async function handleCreate() {
  const projectId = projectStore.currentProjectId
  if (!projectId) return
  const name = prompt('Branch name:')
  if (name && name.trim()) {
    await branchStore.forkBranch(projectId, name.trim())
  }
}
</script>

<template>
  <div class="relative" v-if="!collapsed">
    <button
      class="flex items-center gap-2 w-full px-3 h-9 rounded-md text-[0.8125rem] text-text-primary hover:bg-surface-hover transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      @click="toggle"
    >
      <BaseIcon name="git-branch" :size="16" class="text-accent shrink-0" />
      <span class="truncate font-medium">{{ branchStore.activeBranch?.name || 'main' }}</span>
      <BaseIcon
        name="chevron-down"
        :size="14"
        class="ml-auto shrink-0 text-text-hint transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Transition name="fade">
      <div
        v-if="open"
        class="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-primary border border-border-subtle rounded-lg shadow-lg overflow-hidden"
      >
        <div class="px-3 py-2 text-[0.6875rem] font-medium uppercase tracking-wider text-text-hint">
          Branches
        </div>
        <div class="max-h-48 overflow-y-auto">
          <div
            v-for="branch in sortedBranches"
            :key="branch.id"
            class="flex items-center gap-2 px-3 py-2 text-[0.8125rem] cursor-pointer hover:bg-surface-hover transition-colors duration-150 group"
            :class="branch.id === branchStore.activeBranchId ? 'text-accent bg-accent/5' : 'text-text-primary'"
            @click="select(branch.id)"
          >
            <BaseIcon name="git-branch" :size="14" class="shrink-0" :class="branch.id === branchStore.activeBranchId ? 'text-accent' : 'text-text-hint'" />
            <template v-if="renaming === branch.id">
              <input
                v-model="renameValue"
                class="flex-1 min-w-0 bg-surface-secondary rounded px-1.5 py-0.5 text-[0.8125rem] outline-none focus:ring-1 focus:ring-accent"
                @keyup.enter="confirmRename(branch.id)"
                @keyup.escape="cancelRename"
                @blur="confirmRename(branch.id)"
                autofocus
              />
            </template>
            <span v-else class="flex-1 min-w-0 truncate">{{ branch.name }}</span>
            <span
              v-if="branch.status === 'divergent'"
              class="text-[0.625rem] text-yellow-500 font-medium ml-1"
            >what-if</span>
            <span
              v-if="branch.id === branchStore.activeBranchId"
              class="text-[0.625rem] text-accent font-medium ml-1"
            >active</span>
            <AppTooltip
              v-if="branch.description && renaming !== branch.id"
              :text="branch.description"
            >
              <BaseIcon name="info" :size="12" class="text-text-hint ml-1" />
            </AppTooltip>
            <AppTooltip
              v-if="renaming !== branch.id && branch.name !== 'main'"
              text="Rename"
            >
              <button
                class="opacity-0 group-hover:opacity-100 ml-auto text-text-hint hover:text-text-primary transition-opacity duration-150"
                @click.stop="startRename(branch)"
              >
                <BaseIcon name="pencil" :size="12" />
              </button>
            </AppTooltip>
          </div>
        </div>
        <div class="border-t border-border-subtle px-3 py-2">
          <button
            class="flex items-center gap-2 text-[0.8125rem] text-text-secondary hover:text-text-primary transition-colors duration-150 w-full"
            @click="handleCreate"
          >
            <BaseIcon name="plus" :size="14" />
            Create branch
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
