import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getChatSessions as fetchPersistedSessions,
  getChatSession as fetchPersistedSession,
  saveChatSession as persistSession,
  deleteChatSession as removePersistedSession,
  deleteChatSessionsByCharacter as removeSessionsByCharacter
} from '../services/db-chats'
import { FEATURES } from '../config/ai'

let messageIdCounter = 0
let sessionIdCounter = 0

function generateMessageId() {
  return `msg_${Date.now()}_${messageIdCounter++}`
}

export const useCharacterChatStore = defineStore('characterChat', () => {
  const sessions = ref({})
  const activeSessionId = ref(null)
  const isStreaming = ref(false)
  const streamError = ref(null)
  const isLoading = ref(false)

  const activeSession = computed(() => {
    if (!activeSessionId.value) return null
    return sessions.value[activeSessionId.value] || null
  })

  const activeMessages = computed(() => {
    return activeSession.value?.messages || []
  })

  const sessionList = computed(() => {
    return Object.values(sessions.value).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  })

  let saveTimeout = null
  function scheduleSave() {
    if (!activeSession.value) return
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(async () => {
      try {
        await persistSession(activeSession.value)
      } catch (err) {
        console.error('Auto-save chat session failed:', err)
      }
    }, 2000)
  }

  async function loadSessions(projectId) {
    isLoading.value = true
    try {
      const persisted = await fetchPersistedSessions(projectId)
      const map = {}
      for (const s of persisted) {
        map[s.id] = { ...s }
      }
      sessions.value = map
      return persisted
    } catch (error) {
      console.error('Failed to load chat sessions:', error)
      return []
    } finally {
      isLoading.value = false
    }
  }

  async function loadSession(sessionId) {
    if (sessions.value[sessionId]) return sessions.value[sessionId]
    try {
      const session = await fetchPersistedSession(sessionId)
      if (session) {
        sessions.value[sessionId] = session
      }
      return session
    } catch (error) {
      console.error('Failed to load chat session:', error)
      return null
    }
  }

  async function startSession(characterIds, projectId, title = '') {
    const id = `session_${Date.now()}_${sessionIdCounter++}`
    const displayTitle = title || characterIds.join(', ')
    const session = {
      id,
      projectId,
      characterIds: [...characterIds],
      title: displayTitle,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    sessions.value[id] = session
    activeSessionId.value = id
    try {
      await persistSession(session)
    } catch (err) {
      console.error('Failed to persist new session:', err)
    }
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
    scheduleSave()
  }

  function removeCharacterFromSession(characterId) {
    if (!activeSession.value) return
    activeSession.value.characterIds = activeSession.value.characterIds.filter(
      (id) => id !== characterId
    )
    activeSession.value.updatedAt = Date.now()
    scheduleSave()
  }

  function updateSessionTitle(title) {
    if (!activeSession.value) return
    activeSession.value.title = title
    activeSession.value.updatedAt = Date.now()
    scheduleSave()
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
    scheduleSave()
    return message.id
  }

  function appendToLastMessage(chunk) {
    if (!activeSession.value) return
    const messages = activeSession.value.messages
    if (messages.length === 0) return
    const last = messages[messages.length - 1]
    last.content += chunk
    activeSession.value.updatedAt = Date.now()
    // Persist streamed content too — the debounce coalesces the chunks and
    // fires ~2s after the stream settles, so the full reply reaches the DB.
    scheduleSave()
  }

  function setLastMessageContent(content) {
    if (!activeSession.value) return
    const messages = activeSession.value.messages
    if (messages.length === 0) return
    messages[messages.length - 1].content = content
    activeSession.value.updatedAt = Date.now()
    scheduleSave()
  }

  function markSavedToNotes(messageId) {
    if (!activeSession.value) return
    const msg = activeSession.value.messages.find((m) => m.id === messageId)
    if (msg) msg.savedToNotes = true
  }

  function markSavedToManuscript(messageId) {
    if (!activeSession.value) return
    const msg = activeSession.value.messages.find((m) => m.id === messageId)
    if (msg) msg.savedToManuscript = true
  }

  async function clearSession() {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
      saveTimeout = null
    }
    if (activeSession.value) {
      try {
        await persistSession(activeSession.value)
      } catch {}
    }
    activeSessionId.value = null
    streamError.value = null
  }

  async function removeSession(sessionId) {
    const session = sessions.value[sessionId]
    if (session) {
      delete sessions.value[sessionId]
    }
    if (activeSessionId.value === sessionId) {
      activeSessionId.value = null
    }
    try {
      await removePersistedSession(sessionId)
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }

  async function removeSessionsContainingCharacter(characterId) {
    try {
      const count = await removeSessionsByCharacter(characterId)
      const keys = Object.keys(sessions.value)
      for (const key of keys) {
        const s = sessions.value[key]
        if (s.characterIds && s.characterIds.includes(characterId)) {
          delete sessions.value[key]
          if (activeSessionId.value === key) {
            activeSessionId.value = null
          }
        }
      }
      return count
    } catch (err) {
      console.error('Failed to remove sessions for character:', err)
      return 0
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
    isLoading,
    activeSession,
    activeMessages,
    sessionList,
    loadSessions,
    loadSession,
    startSession,
    setActiveSession,
    addCharacterToSession,
    removeCharacterFromSession,
    updateSessionTitle,
    addMessage,
    appendToLastMessage,
    setLastMessageContent,
    markSavedToNotes,
    markSavedToManuscript,
    clearSession,
    removeSession,
    removeSessionsContainingCharacter,
    setStreaming,
    setStreamError
  }
})
