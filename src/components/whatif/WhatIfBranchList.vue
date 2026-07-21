<script setup>
import { ref, onMounted, computed } from 'vue'
import { useWhatIfStore } from '../../stores/whatIfStore'
import { useProjectStore } from '../../stores/projectStore'
import { getSections, getSubsections } from '../../services/dbService'
import BaseIcon from '../shared/BaseIcon.vue'

defineProps({
  collapsed: { type: Boolean, default: false }
})

const whatIfStore = useWhatIfStore()
const projectStore = useProjectStore()

const divergedData = ref([])
const expandedBranches = ref(new Set())
const open = ref(false)

async function loadDiverged() {
  const projectId = projectStore.currentProjectId
  if (!projectId) return
  await whatIfStore.loadBranches(projectId)

  const result = []
  for (const branch of whatIfStore.branches) {
    if (branch.status !== 'divergent') continue
    const sections = await getSections(projectId, branch.id)
    const sectionsWithSubs = []
    for (const section of sections) {
      const subs = await getSubsections(projectId, section.id, branch.id)
      sectionsWithSubs.push({ ...section, subsections: subs })
    }
    result.push({ branch, sections: sectionsWithSubs })
  }
  divergedData.value = result
}

function toggleBranch(branchId) {
  const next = new Set(expandedBranches.value)
  if (next.has(branchId)) {
    next.delete(branchId)
  } else {
    next.add(branchId)
  }
  expandedBranches.value = next
}

async function handleAccept(branchId) {
  await whatIfStore.accept(branchId)
  await loadDiverged()
}

async function handleDelete(branchId) {
  await whatIfStore.removeBranch(branchId)
  divergedData.value = divergedData.value.filter((d) => d.branch.id !== branchId)
}

const hasWhatIfBranches = computed(() => divergedData.value.length > 0)

onMounted(loadDiverged)
</script>

<template>
  <div v-if="!collapsed && hasWhatIfBranches" class="mt-2 border-t border-border-subtle pt-2">
    <button
      class="flex items-center gap-2 w-full px-3 h-8 rounded-md text-[0.75rem] text-text-secondary hover:bg-surface-hover transition-colors duration-150"
      @click="open = !open"
    >
      <BaseIcon name="shuffle" :size="14" class="text-yellow-500 shrink-0" />
      <span class="font-medium">What-If Branches</span>
      <span class="ml-auto text-[0.625rem] text-text-hint">{{ divergedData.length }}</span>
      <BaseIcon
        name="chevron-down"
        :size="12"
        class="text-text-hint transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Transition name="fade">
      <div v-if="open" class="mt-1 space-y-1">
        <div
          v-for="{ branch, sections } in divergedData"
          :key="branch.id"
          class="rounded-md border border-border-subtle overflow-hidden"
        >
          <button
            class="flex items-center gap-2 w-full px-3 py-2 text-[0.8125rem] hover:bg-surface-hover transition-colors"
            @click="toggleBranch(branch.id)"
          >
            <BaseIcon name="git-branch" :size="14" class="text-yellow-500 shrink-0" />
            <span class="flex-1 min-w-0 truncate text-left">{{ branch.name }}</span>
            <span class="text-[0.625rem] text-text-hint">{{ sections.length }} sections</span>
          </button>

          <Transition name="fade">
            <div v-if="expandedBranches.has(branch.id)" class="border-t border-border-subtle">
              <div v-for="section in sections" :key="section.id" class="px-3 py-2 border-b border-border-subtle last:border-b-0">
                <div class="flex items-center gap-2">
                  <BaseIcon name="file-text" :size="12" class="text-text-hint shrink-0" />
                  <span class="text-[0.75rem] text-text-primary truncate flex-1">{{ section.title }}</span>
                  <span class="text-[0.625rem] text-text-hint">{{ section.subsections?.length || 0 }} subs</span>
                </div>
                <div v-if="section.subsections?.length" class="mt-1 ml-5 space-y-1">
                  <div
                    v-for="sub in section.subsections"
                    :key="sub.id"
                    class="flex items-center gap-2"
                  >
                    <span
                      class="w-1.5 h-1.5 rounded-full shrink-0"
                      :class="sub.contentStatus === 'generated' ? 'bg-green-500' : 'bg-yellow-400'"
                    />
                    <span class="text-[0.6875rem] text-text-secondary truncate">{{ sub.title || 'Untitled' }}</span>
                    <span
                      v-if="sub.contentStatus === 'divergent'"
                      class="text-[0.625rem] text-yellow-500 ml-auto"
                    >pending</span>
                  </div>
                </div>
              </div>

              <div class="flex gap-1 p-2 border-t border-border-subtle bg-bg-secondary/30">
                <button
                  class="flex-1 text-[0.6875rem] py-1 rounded bg-green-600/10 text-green-600 hover:bg-green-600/20 transition-colors"
                  @click="handleAccept(branch.id)"
                >
                  Accept
                </button>
                <button
                  class="flex-1 text-[0.6875rem] py-1 rounded bg-red-600/10 text-red-600 hover:bg-red-600/20 transition-colors"
                  @click="handleDelete(branch.id)"
                >
                  Delete
                </button>
              </div>
            </div>
          </Transition>
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
