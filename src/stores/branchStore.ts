import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  ensureMainBranch,
  adoptUnbranchedRows,
  copyManuscriptToBranch
} from '../services/dbService'
import { useLoading } from '../utils/useLoading'

export interface Branch {
  id: string
  projectId: string
  name: string
  sourceBranchId?: string | null
  description?: string
  status?: string
  createdAt?: string
}

export const useBranchStore = defineStore('branch', () => {
  const activeBranchId = ref<string | null>(null)
  // The project `branches` / `activeBranchId` belong to. Without it, opening a
  // second project kept the first one's active branch, and every
  // branch-filtered read of the new project came back empty.
  const projectIdLoaded = ref<string | null>(null)
  let pending: { projectId: string; promise: Promise<string | null> } | null = null

  const {
    items: branches,
    isLoading,
    load: loadBranches
  } = useLoading<Branch, [string]>(async (projectId: string) => {
    const all: Branch[] = await getBranches(projectId)
    if (!all.some((b) => b.name === 'main')) {
      const main = await ensureMainBranch(projectId)
      return [main, ...all]
    }
    return all
  })

  const activeBranch = computed(() => {
    if (!activeBranchId.value) return null
    return branches.value.find((b) => b.id === activeBranchId.value) || null
  })

  const isMainBranch = computed(() => activeBranch.value?.name === 'main')

  const mainBranch = computed(() => branches.value.find((b) => b.name === 'main') || null)

  async function setActiveBranch(branchId: any) {
    activeBranchId.value = branchId
  }

  // `projectId` is passed through as given: project ids are numbers, and a
  // stringified id matches no row in an indexed `where`. Only the comparison
  // key is a string.
  async function doInit(projectId: string | number): Promise<string | null> {
    if (projectIdLoaded.value !== String(projectId)) activeBranchId.value = null
    await loadBranches(projectId as string)
    projectIdLoaded.value = String(projectId)
    const main = mainBranch.value
    if (!activeBranch.value) {
      activeBranchId.value = main ? main.id : branches.value[0]?.id || null
    }
    if (main) await adoptUnbranchedRows(projectId, main.id)
    return activeBranchId.value
  }

  /**
   * Load this project's branches, pick its active one, and hand orphaned rows
   * to main. Concurrent callers (the shell's project watcher and the manuscript
   * load both run on open) share one in-flight load instead of racing.
   */
  async function initForProject(projectId: string | number): Promise<string | null> {
    const pid = String(projectId)
    if (pending && pending.projectId === pid) return pending.promise
    const promise = doInit(projectId).finally(() => {
      if (pending?.promise === promise) pending = null
    })
    pending = { projectId: pid, promise }
    return promise
  }

  /** The active branch id for `projectId`, loading the project's branches if needed. */
  async function branchIdFor(projectId: string | number): Promise<string | null> {
    if (projectIdLoaded.value === String(projectId) && activeBranch.value) {
      return activeBranch.value.id
    }
    return initForProject(projectId)
  }

  /**
   * Make `branchId` the active branch and show it: refresh the branch list (a
   * fork made elsewhere is not in it yet) and reload the manuscript, which
   * otherwise kept showing the previous branch's text.
   */
  async function switchTo(projectId: string | number, branchId: string) {
    await loadBranches(projectId as string)
    projectIdLoaded.value = String(projectId)
    activeBranchId.value = branchId
    const { useManuscriptStore } = await import('./manuscriptStore')
    await useManuscriptStore().loadManuscript(projectId)
  }

  /**
   * Create a branch from `sourceBranchId` (default: the active one) holding a
   * copy of its whole manuscript. A branch used to be only a row, so switching
   * to a new one showed an empty book.
   */
  async function forkBranch(projectId: any, name: any, sourceBranchId: any = null, opts: any = {}) {
    const from = sourceBranchId || (await branchIdFor(projectId))
    const branch = await createBranch(projectId, name, from, opts)
    if (from) await copyManuscriptToBranch(projectId, from, branch.id)
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
    mainBranch,
    isMainBranch,
    isLoading,
    loadBranches,
    initForProject,
    branchIdFor,
    setActiveBranch,
    switchTo,
    forkBranch,
    renameBranch,
    removeBranch
  }
})
