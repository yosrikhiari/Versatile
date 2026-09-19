/**
 * useFlowSession — A singleton composable that owns all Flow-related state.
 *
 * Replaces 12+ props drilled from App.vue → AppShell → FlowEditor/FlowTimer.
 * Both FlowEditor and FlowTimer now import this directly and read/write
 * the same reactive refs.
 */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useProjectStore } from '../stores/projectStore'
import { useFlowStore } from '../stores/flowStore'

let _instance: any = null

export function useFlowSession() {
  if (_instance) return _instance

  const projectStore = useProjectStore()
  const timer = useFlowStore()
  // Setup stores unwrap refs on access, so reading `timer.isRunning`
  // snapshots a static boolean. `storeToRefs` keeps live refs instead —
  // without it every consumer saw `*.value === undefined` and the whole
  // Flow UI (timer, nudges, desaturation, end modal) never engaged.
  const timerRefs = storeToRefs(timer)

  // Expose projectStore session data alongside timer state
  const sessionWordCount = computed(() => projectStore.sessionWordCount)
  const sessionGoal = computed(() => projectStore.sessionGoal)
  const sessionProgress = computed(() => projectStore.sessionProgress)
  const dailyWordCount = computed(() => projectStore.dailyWordCount)
  const dailyGoal = computed(() => projectStore.dailyGoal)
  const dailyProgress = computed(() => projectStore.dailyProgress)

  _instance = {
    // Timer state (live refs into the store)
    isRunning: timerRefs.isRunning,
    isPaused: timerRefs.isPaused,
    remaining: timerRefs.remaining,
    duration: timerRefs.duration,
    isDesaturated: timerRefs.isDesaturated,
    isNudging: timerRefs.isNudging,
    showBackspaceToast: timerRefs.showBackspaceToast,
    showSessionEndModal: timerRefs.showSessionEndModal,
    sessionWordCountEnd: timerRefs.sessionWordCountEnd,
    idleSeconds: timerRefs.idleSeconds,

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
