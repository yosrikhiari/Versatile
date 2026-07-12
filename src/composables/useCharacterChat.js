import { useCharacterChatStore } from '../stores/characterChatStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { aiStream } from './useAiService'
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
  return bible.characters.find((c) => c.id === id) || null
}

// Strip the noise weaker models emit: bracketed stage directions, echoed
// "[Name]:" / "Character:" labels, and hallucinated extra dialogue turns.
// Used on both stored history (so few-shot examples stay clean) and fresh
// output (so what we display and persist is clean going forward).
function cleanReply(text, name) {
  if (!text) return ''
  let t = text.replace(/\r/g, '')

  // Cut off hallucinated continuations of the script (extra turns)
  const markers = ['\nUser:', '\nUser :', '\nCharacter:', '\nAssistant:']
  if (name) {
    markers.push('\n' + name + ':', '\n[' + name + ']', '\n[' + name + ' ')
  }
  let cutAt = t.length
  for (const mk of markers) {
    const i = t.indexOf(mk)
    if (i !== -1 && i < cutAt) cutAt = i
  }
  t = t.slice(0, cutAt)

  // Remove bracketed stage directions: [He makes a deep noise ...]
  t = t.replace(/\[[^\]\n]*\]/g, ' ')

  // Strip a leading speaker label like "The Hatless Wanderer:" / "Character::"
  // but keep real sentences that merely contain a colon.
  t = t.replace(/^\s*(?:[^\n:]{1,40}::?\s*)+/, (m) => {
    const head = m.split(':')[0]
    return /[.?!]/.test(head) ? m : ''
  })

  return t
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length)
    .join('\n')
    .trim()
}

export function useCharacterChat() {
  const store = useCharacterChatStore()
  let abortController = null

  async function sendMessage(text, _options = {}) {
    if (!store.activeSession) return
    abortController = new AbortController()

    const characterIds = store.activeSession.characterIds
    const characterProfiles = characterIds.map((id) => getCharacterById(id)).filter(Boolean)

    const primaryName = characterProfiles[0]?.name || 'Character'

    const systemPrompt = `You are roleplaying as the following character(s) from a story. Respond naturally in-character, staying true to their voice, personality, and background. Never break character or refer to yourself as an AI.

Strict output rules:
- Write ONLY ${primaryName}'s single spoken reply, as plain text.
- Do NOT prefix your reply with your name or any label.
- Do NOT use square brackets, parentheses, or asterisks for actions, tone, or sound effects — dialogue only.
- Do NOT write the other person's lines or continue the conversation. Produce exactly one reply and stop.
- Keep it concise and conversational unless asked for more.

${characterProfiles.map((c) => buildCharacterProfile(c)).join('\n')}`

    // Clean transcript: label each turn with a real speaker name and sanitize
    // stored content so poisoned history doesn't teach the model bad formatting.
    const transcript = store.activeMessages
      .slice(-MAX_TURNS)
      .map((m) => {
        const speaker = m.characterId
          ? getCharacterById(m.characterId)?.name || 'Character'
          : 'User'
        const content = m.characterId ? cleanReply(m.content, speaker) : m.content
        return `${speaker}: ${content}`
      })
      .filter((line) => line.split(': ').slice(1).join(': ').trim())
      .join('\n')

    const prompt = `${transcript}${transcript ? '\n' : ''}User: ${text}\n${primaryName}:`

    // Stop before the model hallucinates further turns of the dialogue.
    const stop = ['\nUser:', '\nCharacter:', `\n${primaryName}:`]

    store.addMessage('user', text)

    store.addMessage('assistant', '', characterIds[0])
    store.setStreaming(true)
    store.setStreamError(null)

    try {
      await aiStream(
        prompt,
        systemPrompt,
        (chunk) => {
          store.appendToLastMessage(chunk)
        },
        {
          feature: FEATURES.CHARACTER_CHAT,
          signal: abortController.signal,
          stop
        }
      )
      // Sanitize the finished reply so display + persisted history stay clean
      const last = store.activeMessages[store.activeMessages.length - 1]
      if (last && last.content) {
        const cleaned = cleanReply(last.content, primaryName)
        if (cleaned && cleaned !== last.content) {
          store.setLastMessageContent(cleaned)
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      store.setStreamError(err.message || 'Generation failed')
      store.appendToLastMessage(`\n\n[Error: ${err.message}]`)
    } finally {
      store.setStreaming(false)
    }
  }

  function cancelStream() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    store.setStreaming(false)
  }

  return { sendMessage, cancelStream }
}
