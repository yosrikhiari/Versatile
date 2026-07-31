import { ref } from 'vue'
import { aiGenerate } from './useAiService'
import { FEATURES } from '../config/ai'
import { estimateTokens } from '../services/ai/contextBudget'
import { isExact, preloadTokenizer } from '../services/ai/tokenizer'
import { getContextWindow } from '../services/ai/modelBudget'

const MIN_TURNS_TO_COMPACT = 6
const KEEP_LAST_N = 3

/** Token pressure can trigger compaction from this many turns, before the turn threshold. */
const TOKEN_TRIGGER_MIN_TURNS = 4

/** Compact once the conversation reaches this share of the model's context window. */
const DEFAULT_BUDGET_RATIO = 0.75

/** After compacting, still above this share of budget means summarization did not compress enough. */
const ESCALATION_RATIO = 0.9

/** Used when no model is set or the model has no known window. */
const FALLBACK_CONTEXT_WINDOW = 8192

const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Given a sequence of exchanges between a writer and an AI writing assistant, produce a concise single-paragraph summary that captures:
- What the writer asked for
- What the AI suggested or generated
- Any decisions the writer made (accept/reject/modify)
- Key story details mentioned

Keep it factual and specific. Do not editorialize. Do not add information not present in the exchanges.`

export function useContextCompactor(
  options: { model?: string; budgetRatio?: number } = {}
) {
  const conversations = ref<Record<string, any>>({})
  const isCompacting = ref(false)
  const activeModel = ref<string | null>(options.model ?? null)

  const budgetRatio =
    typeof options.budgetRatio === 'number' && options.budgetRatio > 0
      ? options.budgetRatio
      : DEFAULT_BUDGET_RATIO

  function getConversationKey(callId: any) {
    return `${callId}`
  }

  /**
   * Point token counting at a specific model.
   *
   * The compactor had no model awareness, so `estimateTokens` could only ever
   * use the heuristic. Setting the model both selects the right context window
   * and kicks off the exact-tokenizer load for that encoding family.
   */
  function setModel(model: string | null, { preload = true }: { preload?: boolean } = {}) {
    activeModel.value = model
    if (model && preload) {
      // Fire and forget: counting stays on the heuristic until this resolves,
      // and `shouldSuggestCompact` accounts for that.
      preloadTokenizer(model).catch(() => {})
    }
    return activeModel.value
  }

  /** Token ceiling before compaction is advised. */
  function getTokenBudget() {
    const window = activeModel.value ? getContextWindow(activeModel.value) : null
    return Math.floor((window ?? FALLBACK_CONTEXT_WINDOW) * budgetRatio)
  }

  function renderTurns(turns: any[]) {
    return turns.map((t: any) => `[${t.role.toUpperCase()}]: ${t.content}`).join('\n\n')
  }

  function estimateConversationTokens(callId: any) {
    return estimateTokens(renderTurns(getTurns(callId)), 'prose')
  }

  function startConversation(callId: any) {
    const key = getConversationKey(callId)
    if (!conversations.value[key]) {
      conversations.value[key] = []
    }
  }

  function addTurn(callId: any, role: any, content: any) {
    const key = getConversationKey(callId)
    if (!conversations.value[key]) {
      conversations.value[key] = []
    }
    conversations.value[key].push({ role, content, timestamp: Date.now() })
    return conversations.value[key].length
  }

  function getTurns(callId: any) {
    const key = getConversationKey(callId)
    return conversations.value[key] || []
  }

  function clearConversation(callId: any) {
    const key = getConversationKey(callId)
    delete conversations.value[key]
  }

  async function compactConversation(callId: any) {
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

      const middleText = renderTurns(middleTurns)

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

      // Post-compaction re-check. Summarizing the middle is not guaranteed to
      // get under budget — one very long recent turn can still blow it, and
      // silently returning an over-budget conversation just moves the failure
      // to the next provider call.
      const budget = getTokenBudget()
      const escalationLimit = Math.floor(budget * ESCALATION_RATIO)
      let tokensAfter = estimateTokens(renderTurns(compressed), 'prose')
      let droppedTurns = 0

      // Escalate by dropping the oldest kept turns. Index 0 is the summary and
      // the final entry is the most recent exchange; neither is ever dropped.
      while (tokensAfter > escalationLimit && compressed.length > 2) {
        compressed.splice(1, 1)
        droppedTurns++
        tokensAfter = estimateTokens(renderTurns(compressed), 'prose')
      }

      const key = getConversationKey(callId)
      conversations.value[key] = compressed

      const stillOverBudget = tokensAfter > escalationLimit

      return {
        compacted: true,
        originalTurns: turns.length,
        compactedTurns: compressed.length,
        summarizedCount: middleTurns.length,
        summary: summary.trim(),
        turns: compressed,
        tokensAfter,
        tokenBudget: budget,
        droppedTurns,
        stillOverBudget,
        warning: stillOverBudget
          ? `Conversation is still ~${tokensAfter} tokens after compaction (budget ${budget}). Consider starting a new conversation.`
          : null
      }
    } catch (error: any) {
      return { compacted: false, reason: error.message, turns }
    } finally {
      isCompacting.value = false
    }
  }

  /**
   * Why compaction is (or isn't) advised. Exposed so the UI can show pressure
   * before the suggestion fires, and so the trigger is testable.
   */
  function getCompactionPressure(callId: any) {
    const turns = getTurns(callId)
    const budget = getTokenBudget()
    const exact = isExact(activeModel.value ?? undefined)
    const tokens = estimateConversationTokens(callId)

    return {
      turns: turns.length,
      tokens,
      budget,
      ratio: budget > 0 ? tokens / budget : 0,
      exactTokenizer: exact,
      model: activeModel.value
    }
  }

  /**
   * Compaction advice.
   *
   * Turn count remains the primary trigger. The token trigger is additive and
   * only fires once the exact tokenizer has loaded — the character-ratio
   * heuristic is unreliable for conversational text (short turns, speaker
   * labels, heavy punctuation), so triggering on it would compact conversations
   * that do not need it and waste a summarization call.
   */
  function shouldSuggestCompact(callId: any) {
    const turns = getTurns(callId)
    const turnTrigger = turns.length >= MIN_TURNS_TO_COMPACT + 2
    if (turnTrigger) return true

    if (turns.length < TOKEN_TRIGGER_MIN_TURNS) return false
    if (!isExact(activeModel.value ?? undefined)) return false

    return estimateConversationTokens(callId) >= getTokenBudget()
  }

  return {
    conversations,
    isCompacting,
    activeModel,
    setModel,
    getTokenBudget,
    getCompactionPressure,
    estimateConversationTokens,
    startConversation,
    addTurn,
    getTurns,
    clearConversation,
    compactConversation,
    shouldSuggestCompact
  }
}
