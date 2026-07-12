/**
 * useFlowSession — A singleton composable that owns all Flow-related state.
 *
 * Replaces 12+ props drilled from App.vue → AppShell → FlowEditor/FlowTimer.
 * Both FlowEditor and FlowTimer now import this directly and read/write
 * the same reactive refs.
 */
import { computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useFlowStore } from '../stores/flowStore'

let _instance = null

export function useFlowSession() {
  if (_instance) return _instance

  const projectStore = useProjectStore()
  const timer = useFlowStore()

  // Expose projectStore session data alongside timer state
  const sessionWordCount = computed(() => projectStore.sessionWordCount)
  const sessionGoal = computed(() => projectStore.sessionGoal)
  const sessionProgress = computed(() => projectStore.sessionProgress)
  const dailyWordCount = computed(() => projectStore.dailyWordCount)
  const dailyGoal = computed(() => projectStore.dailyGoal)
  const dailyProgress = computed(() => projectStore.dailyProgress)

  _instance = {
    // Timer state (reactive refs)
    isRunning: timer.isRunning,
    isPaused: timer.isPaused,
    remaining: timer.remaining,
    duration: timer.duration,
    isDesaturated: timer.isDesaturated,
    isNudging: timer.isNudging,
    showBackspaceToast: timer.showBackspaceToast,
    showSessionEndModal: timer.showSessionEndModal,
    sessionWordCountEnd: timer.sessionWordCountEnd,
    idleSeconds: timer.idleSeconds,

    // Session/daily metrics (computed from projectStore)
    sessionWordCount,
    sessionGoal,
    sessionProgress,
    dailyWordCount,
    dailyGoal,
    dailyProgress,

    // Timer actions
    startSession: timer.startSession,
    pauseSession: timer.pauseSession,
    resumeSession: timer.resumeSession,
    endSession: timer.endSession,
    dismissModal: timer.dismissModal,
    startNewSession: timer.startNewSession,
    handleKeystroke: timer.handleKeystroke,
    handleBackspace: timer.handleBackspace,
    formatTime: timer.formatTime,
    dismissNudge: timer.dismissNudge,
    dismissBackspaceToast: timer.dismissBackspaceToast,
    destroy: timer.destroy
  }

  return _instance
}
