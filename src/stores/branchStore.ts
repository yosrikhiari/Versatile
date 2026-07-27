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
import { useLoading } from '../utils/useLoading'
import { useProjectStore } from './projectStore'

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
    console.log('[DEBUG] loadBranhes called with projectId:', projectId, '| stack:', new Error().stack?.split('\n').slice(2, 6).join(' → '))
    const all: Branch[] = await getBranches(projectId)
    console.log('[DEBUG] getBranches returned:', all.map((b) => ({ id: b.id, name: b.name })))
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
    console.log('[DEBUG] initForProject called, projectId:', projectId, '| stack:', new Error().stack?.split('\n').slice(2, 5).join(' → '))
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
    console.log('[DEBUG] forkBranch start | projectId:', projectId, '| name:', name, '| activeBranchId:', activeBranchId.value, '| current branches:', branches.value.map((b: any) => b.name))
    const branch = await createBranch(projectId, name, sourceBranchId || activeBranchId.value, opts)
    console.log('[DEBUG] forkBranch created:', branch, '| about to push')
    branches.value.push(branch)
    console.log('[DEBUG] forkBranch after push | branches:', branches.value.map((b: any) => b.name))
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
