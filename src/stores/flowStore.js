import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useProjectStore } from './projectStore'
import { useArchiveStore } from './archiveStore'
import { useAuthorModel } from '../composables/useAuthorModel'
import { useStateSummarizer } from '../composables/useStateSummarizer'

export const useFlowStore = defineStore('flow', () => {
  const projectStore = useProjectStore()
  
  const duration = ref(1200)
  const remaining = ref(1200)
  const isRunning = ref(false)
  const isPaused = ref(false)
  const lastKeystrokeAt = ref(Date.now())
  const idleSeconds = ref(0)
  const isNudging = ref(false)
  const isDesaturated = ref(false)
  const showBackspaceToast = ref(false)
  const showSessionEndModal = ref(false)
  const sessionWordCountEnd = ref(0)

  let timerInterval = null
  let idleInterval = null
  let backspaceStartTime = null
  let backspaceToastTimeout = null
  let audioContext = null

  function initAudio() {
    try {
      if (audioContext?.state !== 'closed') return
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
    } catch (e) {
      console.error('[flowStore] Audio not supported:', e)
    }
  }

  function playNudgeSound() {
    if (!audioContext) return
    try {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.frequency.value = 660
      osc.type = 'sine'
      gain.gain.value = 0.15
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2)
      osc.connect(gain)
      gain.connect(audioContext.destination)
      osc.start()
      osc.stop(audioContext.currentTime + 0.2)
    } catch {
      console.log('Failed to play nudge sound')
    }
  }

  function startSession(minutes = 20) {
    duration.value = minutes * 60
    remaining.value = duration.value
    isRunning.value = true
    isPaused.value = false
    idleSeconds.value = 0
    isDesaturated.value = false
    isNudging.value = false
    projectStore.resetSessionCount()
    initAudio()

    timerInterval = setInterval(() => {
      if (isRunning.value && !isPaused.value) {
        if (remaining.value > 0) {
          remaining.value--
        } else {
          endSession()
        }
      }
    }, 1000)

    idleInterval = setInterval(() => {
      if (isRunning.value && !isPaused.value) {
        idleSeconds.value++
        if (idleSeconds.value >= 12) {
          isDesaturated.value = true
          if (idleSeconds.value === 12) {
            playNudgeSound()
          }
        }
        if (idleSeconds.value >= 20) {
          isNudging.value = true
        }
      }
    }, 1000)
  }

  function pauseSession() {
    isPaused.value = true
  }

  function resumeSession() {
    isPaused.value = false
  }

  function endSession() {
    sessionWordCountEnd.value = projectStore.sessionWordCount
    showSessionEndModal.value = true
    isRunning.value = false
    isPaused.value = false

    if (timerInterval) {
      clearInterval(timerInterval)
      timerInterval = null
    }
    if (idleInterval) {
      clearInterval(idleInterval)
      idleInterval = null
    }

    const projectId = projectStore.currentProjectId
    if (projectId) {
      const archiveStore = useArchiveStore()
      const { summarize, snapshotToRecap } = useStateSummarizer()
      const { buildProfileFromSession } = useAuthorModel()

      const state = summarize()
      if (state) {
        archiveStore.saveEndOfSessionState(projectId, Date.now().toString(), state).then(() => {
          projectStore.lastSessionRecap = snapshotToRecap(state)
        })
      }

      const sessionData = {
        wordCountDelta: projectStore.sessionWordCount,
        genre: projectStore.currentCategory
      }
      const updatedProfile = buildProfileFromSession(sessionData)
      projectStore.updateAuthorVoiceProfile({ data: updatedProfile })
    }
  }

  function dismissModal() {
    showSessionEndModal.value = false
  }

  function startNewSession(minutes) {
    dismissModal()
    startSession(minutes)
  }

  function handleKeystroke() {
    lastKeystrokeAt.value = Date.now()
    idleSeconds.value = 0
    isDesaturated.value = false
    isNudging.value = false
  }

  function dismissNudge() {
    isNudging.value = false
  }

  function dismissBackspaceToast() {
    showBackspaceToast.value = false
    if (backspaceToastTimeout) {
      clearTimeout(backspaceToastTimeout)
      backspaceToastTimeout = null
    }
  }

  function showBackspaceNudge() {
    if (showBackspaceToast.value) return
    
    showBackspaceToast.value = true
    if (backspaceToastTimeout) {
      clearTimeout(backspaceToastTimeout)
    }
    backspaceToastTimeout = setTimeout(() => {
      showBackspaceToast.value = false
      backspaceToastTimeout = null
    }, 1500)
  }

  function handleBackspace(event) {
    if (!isRunning.value) return
    
    if (event.key === 'Backspace') {
      if (!backspaceStartTime) {
        backspaceStartTime = Date.now()
      } else if (Date.now() - backspaceStartTime > 800) {
        showBackspaceNudge()
      }
    } else {
      backspaceStartTime = null
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  function destroy() {
    if (timerInterval) clearInterval(timerInterval)
    if (idleInterval) clearInterval(idleInterval)
    if (backspaceToastTimeout) clearTimeout(backspaceToastTimeout)
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close()
    }
  }

  return {
    duration,
    remaining,
    isRunning,
    isPaused,
    idleSeconds,
    isNudging,
    isDesaturated,
    showBackspaceToast,
    showSessionEndModal,
    sessionWordCountEnd,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    dismissModal,
    startNewSession,
    handleKeystroke,
    handleBackspace,
    formatTime,
    dismissNudge,
    dismissBackspaceToast,
    destroy
  }
})
