import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  ensureMainBranch
} from '../services/dbService'
import { useLoading } from '../utils/useLoading'

export interface Branch {
  id: string
  projectId: string
  name: string
  sourceBranchId?: string | null
  createdAt?: string
}

export const useBranchStore = defineStore('branch', () => {
  const activeBranchId = ref<string | null>(null)

  const {
    items: branches,
    isLoading,
    load: loadBranches
  } = useLoading<Branch, [string]>(async (projectId: string) => {
    const all: Branch[] = await getBranches(projectId)
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

  async function setActiveBranch(branchId: any) {
    activeBranchId.value = branchId
  }

  async function initForProject(projectId: any) {
    await loadBranches(projectId)
    if (branches.value.length > 0 && !activeBranchId.value) {
      const main = branches.value.find((b) => b.name === 'main')
      activeBranchId.value = main ? main.id : branches.value[0].id
    }
  }

  async function forkBranch(projectId: any, name: any, sourceBranchId: any = null, opts: any = {}) {
    if (branches.value.length === 0) {
      await loadBranches(projectId)
    }
    const branch = await createBranch(projectId, name, sourceBranchId || activeBranchId.value, opts)
    branches.value.push(branch)
    return branch
  }

  async function renameBranch(id: any, name: any) {
    await updateBranch(id, { name })
    const index = branches.value.findIndex((b) => b.id === id)
    if (index !== -1) {
      branches.value[index] = { ...branches.value[index], name }
    }
  }

  async function removeBranch(id: any) {
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
