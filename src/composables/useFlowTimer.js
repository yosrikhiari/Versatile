import { ref, onUnmounted } from 'vue'

export function useFlowTimer(projectStore) {
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
  let nudgeAudio = null

  function initAudio() {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      fetch('/assets/sounds/nudge.mp3')
        .then(response => response.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .then(audioBuffer => {
          nudgeAudio = audioBuffer
        })
        .catch(() => {
          console.log('Sound file not found, continuing silently')
        })
    } catch {
      console.log('Audio not supported')
    }
  }

  function playNudgeSound() {
    if (!nudgeAudio || !audioContext) return
    try {
      const source = audioContext.createBufferSource()
      const gainNode = audioContext.createGain()
      gainNode.gain.value = 0.3
      source.buffer = nudgeAudio
      source.connect(gainNode)
      gainNode.connect(audioContext.destination)
      source.start(0)
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
      if (remaining.value > 0) {
        remaining.value--
      } else {
        endSession()
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

  onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval)
    if (idleInterval) clearInterval(idleInterval)
    if (backspaceToastTimeout) clearTimeout(backspaceToastTimeout)
  })

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
    dismissBackspaceToast
  }
}
