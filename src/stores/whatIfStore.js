import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getWhatIfBranches, deleteWhatIfBranch, acceptDivergence, updateBranch } from '../services/dbService'
import { useBranchStore } from './branchStore'
import { createAbortScope } from '../composables/generation/lifecycle/abort'

export const useWhatIfStore = defineStore('whatIf', () => {
  const abortScope = createAbortScope()

  const branches = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const activeJob = ref({
    status: 'idle',
    branchId: null,
    progress: { current: 0, total: 0, phase: '' },
    sceneResults: [],
    skippedSections: [],
    retryContext: null
  })

  const activeWhatIfBranch = computed(() => {
    const branchStore = useBranchStore()
    return branches.value.find((b) => b.id === branchStore.activeBranchId) || null
  })

  const isJobRunning = computed(() =>
    ['forking', 'cloning', 'planning', 'writing'].includes(activeJob.value.status)
  )

  const failedScenes = computed(() =>
    activeJob.value.sceneResults.filter((r) => r.status === 'failed')
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

  function setJobPhase(phase, extra = {}) {
    activeJob.value = { ...activeJob.value, status: phase, ...extra }
  }

  function updateJobProgress(current, total, phase) {
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

  function addSceneResult(result) {
    activeJob.value = {
      ...activeJob.value,
      sceneResults: [...activeJob.value.sceneResults, result]
    }
  }

  function addSkippedSection(sectionIndex) {
    activeJob.value = {
      ...activeJob.value,
      skippedSections: [...activeJob.value.skippedSections, sectionIndex]
    }
  }

  function setRetryContext(ctx) {
    activeJob.value = { ...activeJob.value, retryContext: ctx }
  }

  async function loadBranches(projectId) {
    isLoading.value = true
    error.value = null
    try {
      branches.value = await getWhatIfBranches(projectId)
    } catch (e) {
      error.value = e.message
    } finally {
      isLoading.value = false
    }
  }

  async function removeBranch(branchId) {
    await deleteWhatIfBranch(branchId)
    branches.value = branches.value.filter((b) => b.id !== branchId)
  }

  async function accept(branchId) {
    await acceptDivergence(branchId)
    await removeBranch(branchId)
  }

  async function cleanupStaleJobs(projectId) {
    const all = await getWhatIfBranches(projectId)
    const stale = all.filter((b) => b.status === 'generating')
    for (const branch of stale) {
      await updateBranch(branch.id, { status: 'failed' })
    }
    branches.value = all.map((b) =>
      b.status === 'generating' ? { ...b, status: 'failed' } : b
    )
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
