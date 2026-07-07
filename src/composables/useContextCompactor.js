import { ref } from 'vue'
import { aiGenerate } from './useAiService'
import { FEATURES } from '../config/ai'

const MIN_TURNS_TO_COMPACT = 6
const KEEP_LAST_N = 3

const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Given a sequence of exchanges between a writer and an AI writing assistant, produce a concise single-paragraph summary that captures:
- What the writer asked for
- What the AI suggested or generated
- Any decisions the writer made (accept/reject/modify)
- Key story details mentioned

Keep it factual and specific. Do not editorialize. Do not add information not present in the exchanges.`

export function useContextCompactor() {
  const conversations = ref({})
  const isCompacting = ref(false)

  function getConversationKey(callId) {
    return `${callId}`
  }

  function startConversation(callId) {
    const key = getConversationKey(callId)
    if (!conversations.value[key]) {
      conversations.value[key] = []
    }
  }

  function addTurn(callId, role, content) {
    const key = getConversationKey(callId)
    if (!conversations.value[key]) {
      conversations.value[key] = []
    }
    conversations.value[key].push({ role, content, timestamp: Date.now() })
    return conversations.value[key].length
  }

  function getTurns(callId) {
    const key = getConversationKey(callId)
    return conversations.value[key] || []
  }

  function clearConversation(callId) {
    const key = getConversationKey(callId)
    delete conversations.value[key]
  }

  async function compactConversation(callId) {
    const turns = getTurns(callId)
    if (turns.length <= MIN_TURNS_TO_COMPACT) {
      return {
        compacted: false,
        reason: `Only ${turns.length} turns, minimum is ${MIN_TURNS_TO_COMPACT}`,
        turns
      }
    }

    isCompacting.value = true
    try {
      const keepTurns = turns.slice(-KEEP_LAST_N)
      const middleTurns = turns.slice(0, -KEEP_LAST_N)

      const middleText = middleTurns
        .map((t) => `[${t.role.toUpperCase()}]: ${t.content}`)
        .join('\n\n')

      const summary = await aiGenerate(
        `Summarize these exchanges between a writer and an AI assistant:\n\n${middleText}`,
        COMPACT_SYSTEM_PROMPT,
        { feature: FEATURES.COMPACTION }
      )

      const compressed = [
        {
          role: 'system',
          content: `[Compacted summary of previous ${middleTurns.length} exchanges]: ${summary.trim()}`,
          timestamp: Date.now()
        },
        ...keepTurns
      ]

      conversations.value[callId] = compressed

      return {
        compacted: true,
        originalTurns: turns.length,
        compactedTurns: compressed.length,
        summarizedCount: middleTurns.length,
        summary: summary.trim(),
        turns: compressed
      }
    } catch (error) {
      return { compacted: false, reason: error.message, turns }
    } finally {
      isCompacting.value = false
    }
  }

  function shouldSuggestCompact(callId) {
    const turns = getTurns(callId)
    return turns.length >= MIN_TURNS_TO_COMPACT + 2
  }

  return {
    conversations,
    isCompacting,
    startConversation,
    addTurn,
    getTurns,
    clearConversation,
    compactConversation,
    shouldSuggestCompact
  }
}
