import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getBranches,
  getBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  ensureMainBranch
} from '../services/dbService'
import { useLoading } from '../composables/useLoading'
import { useProjectStore } from './projectStore'

export const useBranchStore = defineStore('branch', () => {
  const activeBranchId = ref(null)

  const {
    items: branches,
    isLoading,
    load: loadBranches
  } = useLoading(async (projectId) => {
    const all = await getBranches(projectId)
    if (all.length === 0) {
      const main = await ensureMainBranch(projectId)
      return [main]
    }
    return all
  })

  const activeBranch = computed(() => {
    if (!activeBranchId.value) return null
    return branches.value.find((b) => b.id === activeBranchId.value) || null
  })

  const isMainBranch = computed(() => activeBranch.value?.name === 'main')

  async function setActiveBranch(branchId) {
    activeBranchId.value = branchId
  }

  async function initForProject(projectId) {
    await loadBranches(projectId)
    if (branches.value.length > 0 && !activeBranchId.value) {
      const main = branches.value.find((b) => b.name === 'main')
      activeBranchId.value = main ? main.id : branches.value[0].id
    }
  }

  async function forkBranch(projectId, name, sourceBranchId = null) {
    const branch = await createBranch(projectId, name, sourceBranchId || activeBranchId.value)
    branches.value.push(branch)
    return branch
  }

  async function renameBranch(id, name) {
    await updateBranch(id, { name })
    const index = branches.value.findIndex((b) => b.id === id)
    if (index !== -1) {
      branches.value[index] = { ...branches.value[index], name }
    }
  }

  async function removeBranch(id) {
    await deleteBranch(id)
    branches.value = branches.value.filter((b) => b.id !== id)
    if (activeBranchId.value === id) {
      const main = branches.value.find((b) => b.name === 'main')
      activeBranchId.value = main ? main.id : branches.value[0]?.id || null
    }
  }

  return {
    branches,
    activeBranchId,
    activeBranch,
    isMainBranch,
    isLoading,
    loadBranches,
    initForProject,
    setActiveBranch,
    forkBranch,
    renameBranch,
    removeBranch
  }
})
