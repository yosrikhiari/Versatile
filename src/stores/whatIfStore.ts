import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getWhatIfBranches,
  deleteWhatIfBranch,
  acceptDivergence,
  updateBranch
} from '../services/dbService'
import { useBranchStore } from './branchStore'
import { createAbortScope } from '../utils/abortScope'

export const useWhatIfStore = defineStore('whatIf', () => {
  const abortScope = createAbortScope()

  const branches = ref<any[]>([])
  const isLoading = ref(false)
  const error = ref<any | null>(null)

  const activeJob = ref<{
    status: string
    branchId: any
    progress: { current: number; total: number; phase: string }
    sceneResults: any[]
    skippedSections: any[]
    retryContext: any
  }>({
    status: 'idle',
    branchId: null,
    progress: { current: 0, total: 0, phase: '' },
    sceneResults: [],
    skippedSections: [],
    retryContext: null
  })

  const activeWhatIfBranch = computed(() => {
    const branchStore = useBranchStore()
    return branches.value.find((b: any) => b.id === branchStore.activeBranchId) || null
  })

  const isJobRunning = computed(() =>
    ['forking', 'cloning', 'planning', 'writing'].includes(activeJob.value.status)
  )

  const failedScenes = computed(() =>
    activeJob.value.sceneResults.filter((r: any) => r.status === 'failed')
  )

  function startJob() {
    abortScope.ensure()
    activeJob.value = {
      status: 'forking',
      branchId: null,
      progress: { current: 0, total: 0, phase: 'Starting...' },
      sceneResults: [],
      skippedSections: [],
      retryContext: null
    }
  }

  function setJobPhase(phase: any, extra: any = {}) {
    activeJob.value = { ...activeJob.value, status: phase, ...extra }
  }

  function updateJobProgress(current: any, total: any, phase: any) {
    activeJob.value = { ...activeJob.value, progress: { current, total, phase } }
  }

  function cancelJob() {
    if (abortScope.cancel()) {
      activeJob.value = { ...activeJob.value, status: 'cancelled' }
    }
  }

  function resetJob() {
    abortScope.reset()
    activeJob.value = {
      status: 'idle',
      branchId: null,
      progress: { current: 0, total: 0, phase: '' },
      sceneResults: [],
      skippedSections: [],
      retryContext: null
    }
  }

  function getJobSignal() {
    return abortScope.signal()
  }

  function throwIfJobAborted() {
    abortScope.throwIfAborted()
  }

  function addSceneResult(result: any) {
    activeJob.value = {
      ...activeJob.value,
      sceneResults: [...activeJob.value.sceneResults, result]
    }
  }

  function addSkippedSection(sectionIndex: any) {
    activeJob.value = {
      ...activeJob.value,
      skippedSections: [...activeJob.value.skippedSections, sectionIndex]
    }
  }

  function setRetryContext(ctx: any) {
    activeJob.value = { ...activeJob.value, retryContext: ctx }
  }

  async function loadBranches(projectId: any) {
    isLoading.value = true
    error.value = null
    try {
      branches.value = await getWhatIfBranches(projectId)
    } catch (e: any) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function removeBranch(branchId: any) {
    await deleteWhatIfBranch(branchId)
    branches.value = branches.value.filter((b: any) => b.id !== branchId)
  }

  async function accept(branchId: any) {
    await acceptDivergence(branchId)
    await removeBranch(branchId)
  }

  async function cleanupStaleJobs(projectId: any) {
    const all = await getWhatIfBranches(projectId)
    const stale = all.filter((b: any) => b.status === 'generating')
    for (const branch of stale) {
      await updateBranch(branch.id, { status: 'failed' })
    }
    branches.value = all.map((b: any) => (b.status === 'generating' ? { ...b, status: 'failed' } : b))
    return stale.length
  }

  return {
    branches,
    isLoading,
    error,
    activeJob,
    activeWhatIfBranch,
    isJobRunning,
    failedScenes,
    startJob,
    setJobPhase,
    updateJobProgress,
    cancelJob,
    resetJob,
    getJobSignal,
    throwIfJobAborted,
    addSceneResult,
    addSkippedSection,
    setRetryContext,
    loadBranches,
    removeBranch,
    accept,
    cleanupStaleJobs
  }
})
