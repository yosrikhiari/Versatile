import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

let messageIdCounter = 0
let sessionIdCounter = 0

function generateMessageId() {
  return `msg_${Date.now()}_${messageIdCounter++}`
}

function generateSessionId() {
  return `session_${Date.now()}_${sessionIdCounter++}`
}

export const useCharacterChatStore = defineStore('characterChat', () => {
  const sessions = ref({})
  const activeSessionId = ref(null)
  const isStreaming = ref(false)
  const streamError = ref(null)

  const activeSession = computed(() => {
    if (!activeSessionId.value) return null
    return sessions.value[activeSessionId.value] || null
  })

  const activeMessages = computed(() => {
    return activeSession.value?.messages || []
  })

  function startSession(characterIds, projectId) {
    const id = generateSessionId()
    sessions.value[id] = {
      id,
      characterIds: [...characterIds],
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      projectId
    }
    activeSessionId.value = id
    return id
  }

  function setActiveSession(sessionId) {
    activeSessionId.value = sessionId
  }

  function addCharacterToSession(characterId) {
    if (!activeSession.value) return
    if (activeSession.value.characterIds.includes(characterId)) return
    activeSession.value.characterIds.push(characterId)
    activeSession.value.updatedAt = Date.now()
  }

  function removeCharacterFromSession(characterId) {
    if (!activeSession.value) return
    activeSession.value.characterIds = activeSession.value.characterIds.filter(id => id !== characterId)
    activeSession.value.updatedAt = Date.now()
  }

  function addMessage(role, content, characterId = null) {
    if (!activeSession.value) return null
    const message = {
      id: generateMessageId(),
      role,
      characterId,
      content,
      timestamp: Date.now(),
      savedToNotes: false,
      savedToManuscript: false
    }
    activeSession.value.messages.push(message)
    activeSession.value.updatedAt = Date.now()
    return message.id
  }

  function appendToLastMessage(chunk) {
    if (!activeSession.value) return
    const messages = activeSession.value.messages
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    last.content += chunk
    activeSession.value.updatedAt = Date.now()
  }

  function markSavedToNotes(messageId) {
    if (!activeSession.value) return
    const msg = activeSession.value.messages.find(m => m.id === messageId)
    if (msg) msg.savedToNotes = true
  }

  function markSavedToManuscript(messageId) {
    if (!activeSession.value) return
    const msg = activeSession.value.messages.find(m => m.id === messageId)
    if (msg) msg.savedToManuscript = true
  }

  function clearSession() {
    activeSessionId.value = null
    streamError.value = null
  }

  function removeSession(sessionId) {
    delete sessions.value[sessionId]
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = null
    }
  }

  function setStreaming(val) {
    isStreaming.value = val
  }

  function setStreamError(err) {
    streamError.value = err
  }

  return {
    sessions,
    activeSessionId,
    isStreaming,
    streamError,
    activeSession,
    activeMessages,
    startSession,
    setActiveSession,
    addCharacterToSession,
    removeCharacterFromSession,
    addMessage,
    appendToLastMessage,
    markSavedToNotes,
    markSavedToManuscript,
    clearSession,
    removeSession,
    setStreaming,
    setStreamError
  }
})
