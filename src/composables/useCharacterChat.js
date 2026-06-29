import { useCharacterChatStore } from '../stores/characterChatStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { aiStream } from '../services/aiService'
import { FEATURES } from '../config/ai'

const MAX_TURNS = 30

function buildCharacterProfile(character) {
  let profile = `## ${character.name}`
  if (character.role) profile += ` (${character.role})`
  profile += '\n'
  if (character.goal) profile += `- Goal: ${character.goal}\n`
  if (character.voice) profile += `- Voice: ${character.voice}\n`
  if (character.notes) profile += `- Notes: ${character.notes}\n`
  if (character.sampleDialogue) profile += `- Sample Dialogue: "${character.sampleDialogue}"\n`
  if (character.traits?.length) profile += `- Traits: ${character.traits.join(', ')}\n`
  return profile
}

function getCharacterById(id) {
  const bible = useStoryBibleStore()
  return bible.characters.find(c => c.id === id) || null
}

export function useCharacterChat() {
  const store = useCharacterChatStore()

  async function sendMessage(text, options = {}) {
    const { signal } = options
    if (!store.activeSession) return

    const projectId = store.activeSession.projectId
    const characterIds = store.activeSession.characterIds
    const characterProfiles = characterIds.map(id => getCharacterById(id)).filter(Boolean)

    const systemPrompt = `You are roleplaying as the following character(s) from a story. Respond naturally in-character, staying true to their voice, personality, and background. Never break character or refer to yourself as an AI.\n\n${characterProfiles.map(c => buildCharacterProfile(c)).join('\n')}`

    const messageHistory = store.activeMessages.slice(-MAX_TURNS).map(m => {
      const role = m.characterId ? 'assistant' : m.role
      const prefix = m.characterId
        ? `[${getCharacterById(m.characterId)?.name || 'Character'}]: `
        : ''
      return { role, content: `${prefix}${m.content}` }
    })

    const prompt = messageHistory.map(m => `${m.role === 'user' ? 'User' : 'Character'}: ${m.content}`).join('\n') + `\nUser: ${text}\nCharacter:`

    store.addMessage('user', text)

    store.addMessage('assistant', '', characterIds[0])
    store.setStreaming(true)
    store.setStreamError(null)

    try {
      await aiStream(prompt, systemPrompt, (chunk) => {
        store.appendToLastMessage(chunk)
      }, {
        feature: FEATURES.CHARACTER_CHAT,
        signal
      })
    } catch (err) {
      if (err.name === 'AbortError') return
      store.setStreamError(err.message || 'Generation failed')
      store.appendToLastMessage(`\n\n[Error: ${err.message}]`)
    } finally {
      store.setStreaming(false)
    }
  }

  function cancelStream() {
    store.setStreaming(false)
  }

  return { sendMessage, cancelStream }
}
