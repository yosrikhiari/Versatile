import { useCharacterChatStore } from '../stores/characterChatStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { aiStream } from './useAiService'
import { FEATURES } from '../config/ai'
import { profilesForChat, type ChatEnergy } from './useGroupChatDirector'
import { buildEarlierChaptersBlock } from '../services/generation/digestContext'
import { SessionBudget, SessionBudgetExceededError } from '../services/aiProviderBudget'

const MAX_TURNS = 30

function buildCharacterProfile(character: any) {
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

function getCharacterById(id: any) {
  const bible = useStoryBibleStore()
  return bible.characters.find((c) => c.id === id) || null
}

// Strip the noise weaker models emit: bracketed stage directions, echoed
// "[Name]:" / "Character:" labels, and hallucinated extra dialogue turns.
// Used on both stored history (so few-shot examples stay clean) and fresh
// output (so what we display and persist is clean going forward).
function cleanReply(text: any, name: any) {
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
  t = t.replace(/^\s*(?:[^\n:]{1,40}::?\s*)+/, (m: any) => {
    const head = m.split(':')[0]
    return /[.?!]/.test(head) ? m : ''
  })

  return t
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((l: any) => l.trim())
    .filter((l: any) => l.length)
    .join('\n')
    .trim()
}

export function useCharacterChat() {
  const store = useCharacterChatStore()
  let abortController: AbortController | null = null

  // Clean transcript lines: label each turn with a real speaker name and
  // sanitize stored content so poisoned history doesn't teach the model bad
  // formatting. Shared by the solo prompt and the group director.
  function buildTranscriptLines() {
    return store.activeMessages
      .slice(-MAX_TURNS)
      .map((m: { characterId?: string; content?: string }) => {
        const speaker = m.characterId
          ? getCharacterById(m.characterId)?.name || 'Character'
          : 'User'
        const content = m.characterId ? cleanReply(m.content, speaker) : m.content
        return `${speaker}: ${content}`
      })
      .filter((line) => line.split(': ').slice(1).join(': ').trim())
  }

  function lastSpeakerId() {
    const messages = store.activeMessages
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].characterId) return messages[i].characterId as string | number
    }
    return null
  }

  // Voice one speaker: the solo path, extracted unchanged. Group turns call
  // it once per picked speaker. Resolves to the reply message id (null when
  // the stream was aborted before anything was stored).
  async function respondAsCharacter(
    speakerId: string | number,
    text: string,
    sessionBudget: SessionBudget | null
  ): Promise<string | null> {
    if (!store.activeSession) return null
    const characterIds = store.activeSession.characterIds
    const characterProfiles = characterIds.map((id: string) => getCharacterById(id)).filter(Boolean)

    const speakerName = getCharacterById(speakerId)?.name || 'Character'

    // Story-so-far for replies past the transcript window: the chapter digest
    // rollup the commit path already maintains. Best-effort — projects without
    // digests get an empty string and behave exactly as before.
    let earlierBlock = ''
    try {
      earlierBlock = await buildEarlierChaptersBlock({
        projectId: store.activeSession.projectId,
        budgetTokens: 150
      })
    } catch {
      earlierBlock = ''
    }

    const systemPrompt = `You are roleplaying as the following character(s) from a story. Respond naturally in-character, staying true to their voice, personality, and background. Never break character or refer to yourself as an AI.
${earlierBlock ? `\n${earlierBlock}\n` : ''}

Strict output rules:
- Write ONLY ${speakerName}'s single spoken reply, as plain text.
- Do NOT prefix your reply with your name or any label.
- Do NOT use square brackets, parentheses, or asterisks for actions, tone, or sound effects — dialogue only.
- Do NOT write the other person's lines or continue the conversation. Produce exactly one reply and stop.
- Keep it concise and conversational unless asked for more.

${characterProfiles.map((c: { name?: string }) => buildCharacterProfile(c)).join('\n')}`

    const transcript = buildTranscriptLines().join('\n')

    const prompt = `${transcript}${transcript ? '\n' : ''}User: ${text}\n${speakerName}:`

    // Stop before the model hallucinates further turns of the dialogue.
    const stop = ['\nUser:', '\nCharacter:', `\n${speakerName}:`]

    store.addMessage('assistant', '', speakerId)

    try {
      await aiStream(
        prompt,
        systemPrompt,
        (chunk) => {
          store.appendToLastMessage(chunk)
        },
        {
          feature: FEATURES.CHARACTER_CHAT,
          signal: abortController?.signal,
          stop,
          sessionBudget
        }
      )
      // Sanitize the finished reply so display + persisted history stay clean
      const last = store.activeMessages[store.activeMessages.length - 1]
      if (last && last.content) {
        const cleaned = cleanReply(last.content, speakerName)
        if (cleaned && cleaned !== last.content) {
          store.setLastMessageContent(cleaned)
        }
      }
      return last?.id || null
    } catch (err: any) {
      if (err.name === 'AbortError') return null
      // A spent budget is not a reply error: it propagates so the turn stops
      // cleanly with the replies already streamed kept (no [Error:] appended).
      if (err instanceof SessionBudgetExceededError) throw err
      store.setStreamError(err.message || 'Generation failed')
      store.appendToLastMessage(`\n\n[Error: ${err.message}]`)
      const last = store.activeMessages[store.activeMessages.length - 1]
      return last?.id || null
    }
  }

  // Group turn: the director picks speakers, each is voiced in order through
  // the same responder above. A surprise labels the first reply so it reads
  // as theatre, not a glitch. Earlier replies survive a later speaker failing.
  async function sendGroupMessage(text: any) {
    if (!store.activeSession) return
    const characterIds = store.activeSession.characterIds
    const energy = (store.activeSession.energy || 'lively') as ChatEnergy
    const profiles = profilesForChat(characterIds)
    const lines = buildTranscriptLines()
    const directorTranscript = lines.slice(-10).join('\n')

    // Lazy: the LangGraph chunk stays out of the solo path entirely (F5).
    const { runGroupTurn } = await import('./generation/chat/groupChatGraph')

    // One budget for the whole turn: director + every speaker draw from it,
    // and a spent budget stops the turn with streamed replies kept.
    const sessionBudget = new SessionBudget()

    let firstReplyId: string | null = null
    const respond = async (speakerId: string | number): Promise<string | null> => {
      const id = await respondAsCharacter(speakerId, text, sessionBudget)
      if (!firstReplyId) firstReplyId = id
      return id
    }

    let speakers: Array<string | number> = []
    let surprise = false
    try {
      const result = await runGroupTurn({
        profiles,
        transcript: directorTranscript,
        energy,
        lastSpeakerId: lastSpeakerId(),
        sessionBudget,
        respond
      })
      speakers = result.speakers
      surprise = result.surprise
    } catch (err) {
      // Whatever stopped the turn, the replies already streamed are kept and
      // the stall is named instead of silent (finally below drops streaming).
      store.setStreamError(err instanceof Error ? err.message : 'Group turn failed')
      return
    }

    if (surprise && speakers.length && firstReplyId && store.activeSession) {
      const firstName = getCharacterById(speakers[0])?.name || 'Someone'
      const first = store.activeSession.messages.find((m: any) => m.id === firstReplyId)
      if (first) first.directorNote = `${firstName} interrupts`
    }
  }

  async function sendMessage(text: any, _options: any = {}) {
    if (!store.activeSession) return
    abortController = new AbortController()

    const characterIds = store.activeSession.characterIds

    store.addMessage('user', text)

    store.setStreaming(true)
    store.setStreamError(null)

    try {
      if (characterIds.length > 1) {
        await sendGroupMessage(text)
      } else {
        await respondAsCharacter(characterIds[0], text, null)
      }
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
