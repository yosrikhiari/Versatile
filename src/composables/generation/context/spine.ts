import { aiGenerateJson, resolveFeatureConfig } from '../../useAiService'
import { FEATURES, PROVIDERS } from '../../../config/ai'
import { estimateTokens, trimToTokens } from '../../../services/ai/contextBudget'
import { parallelWithLimit } from '../utils'

function isOllamaProvider() {
  try {
    const config = resolveFeatureConfig(FEATURES.STORY_GENERATION)
    return config.provider === PROVIDERS.OLLAMA
  } catch {
    return false
  }
}

const PARALLEL_CHAPTER_LIMIT = () => (isOllamaProvider() ? 1 : 3)

function formatFullSpineEntry(s: any) {
  const facts =
    Array.isArray(s.keyFacts) && s.keyFacts.length
      ? `\n- Established facts: ${s.keyFacts.join('; ')}`
      : ''
  return `Chapter ${s.chapterNumber} (${s.chapterTitle}):\n- Emotion at end: ${s.emotionalStateAtEnd}\n- Reader knows: ${s.readerKnowledgeAtEnd}\n- Transition: ${s.transitionToNext}${facts}`
}

const SPINE_ENTRY_SCHEMA = {
  type: 'object',
  properties: {
    emotionalStateAtEnd: { type: 'string' },
    readerKnowledgeAtEnd: { type: 'string' },
    transitionToNext: { type: 'string' },
    keyFacts: { type: 'array', items: { type: 'string' } },
    wordCount: { type: 'number' }
  },
  required: ['emotionalStateAtEnd']
}

const SPINE_TRUNCATION_MARKER = '\n[spine truncated]'

function compressSpine(spine: any, tokenCap = 800) {
  if (spine.length <= 3) return spine.map(formatFullSpineEntry).join('\n')
  const full = spine.slice(-3)
  const compressed = spine
    .slice(0, -3)
    .map((s: any) => `Chapter ${s.chapterNumber} (${s.chapterTitle}): ${s.emotionalStateAtEnd}`)
  const combined = [...compressed, ...full.map(formatFullSpineEntry)]
  const text = combined.join('\n')

  if (estimateTokens(text) <= tokenCap) return text
  // The marker is part of what gets sent, so it comes out of the cap. The old
  // `tokenCap * 4` slice inlined the 4:1 guess and then appended the marker on
  // top, landing over budget by however much the guess was wrong plus the marker.
  const room = Math.max(1, tokenCap - estimateTokens(SPINE_TRUNCATION_MARKER))
  return trimToTokens(text, room) + SPINE_TRUNCATION_MARKER
}

const SPINE_TIMEOUT_MS = 120000
// Silence budget between streamed tokens of one spine entry.
const SPINE_IDLE_TIMEOUT_MS = 90000

function fallbackSpineEntry(chapter: any) {
  return {
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
    emotionalStateAtEnd: chapter.emotionalTarget || 'the chapter reaches its turning point',
    readerKnowledgeAtEnd: chapter.goal || `the events of "${chapter.title}"`,
    transitionToNext: chapter.hookEnding || 'the story carries forward into the next chapter',
    keyFacts: [],
    wordCount: chapter.estimatedWords || 100
  }
}

// `signal` is the `spine` stage's abort signal. One call per chapter means a
// cancelled stage that cannot forward it does not stop — it keeps working
// through the remaining chapters on the provider slot the next stage is queued
// for, which is what makes an abandoned stage expensive rather than merely wrong.
async function generateSpine(chapters: any, storyArc: any, onEntryDone: any, signal?: AbortSignal) {
  const spine = new Array(chapters.length)
  let completed = 0

  const tasks = chapters.map((chapter: any, i: any) => async () => {
    if (signal?.aborted) {
      spine[i] = fallbackSpineEntry(chapter)
      return
    }
    const prevChapter = i > 0 ? chapters[i - 1] : null

    let prompt = `You are designing a narrative spine for a novel.
Generate a 150-word spine entry for Chapter ${chapter.chapterNumber}: "${chapter.title}"

CHAPTER GOAL: ${chapter.goal}
EMOTIONAL TARGET: ${chapter.emotionalTarget}
HOOK ENDING: ${chapter.hookEnding}

`
    if (prevChapter) {
      prompt += `THE PREVIOUS CHAPTER (${prevChapter.chapterNumber}: "${prevChapter.title}") WAS PLANNED TO END ON:
- Emotional target: ${prevChapter.emotionalTarget || 'unspecified'}
- Hook into this chapter: ${prevChapter.hookEnding || 'unspecified'}

This chapter must pick up from that.

`
    }

    prompt += `Provide a JSON object with EXACTLY these keys:
{
  "emotionalStateAtEnd": "string (emotional state of characters at chapter END)",
  "readerKnowledgeAtEnd": "string (what the reader knows by chapter end)",
  "transitionToNext": "string (what changes between this chapter and the next)",
  "keyFacts": ["durable fact established this chapter (who is alive/injured/where, who knows what, what has changed) — 2-5 short facts"],
  "wordCount": number
}`

    const parsed = await aiGenerateJson(
      prompt,
      `You are a structural story architect. Genre: ${storyArc?.genre || 'fiction'}. Tone: ${storyArc?.tone || 'standard'}. Return ONLY valid JSON.`,
      {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.7,
        // Match spine stage's 7-min idle timeout (STAGE_IDLE_TIMEOUT_MS.spine = 420_000).
        // Provider's first-token timeout must exceed stage timeout to avoid premature kill.
        firstTokenTimeout: 480_000,
        idleTimeout: 420_000,
        schema: SPINE_ENTRY_SCHEMA,
        schemaName: 'spine_entry',
        role: 'utility',
        signal,
        // Heartbeat on every token chunk so the stage watchdog knows streaming is alive
        onToken: (_chunk, _full) => {
          try {
            if (onEntryDone) onEntryDone(completed + 1, chapters.length)
          } catch {
            // Best-effort heartbeat; a throwing consumer must not break streaming.
          }
        }
      }
    ).catch(() => null)

    spine[i] =
      parsed && parsed.emotionalStateAtEnd
        ? {
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.title,
            emotionalStateAtEnd: parsed.emotionalStateAtEnd,
            readerKnowledgeAtEnd: parsed.readerKnowledgeAtEnd,
            transitionToNext: parsed.transitionToNext,
            keyFacts: Array.isArray(parsed.keyFacts) ? parsed.keyFacts : [],
            wordCount: parsed.wordCount || 100
          }
        : fallbackSpineEntry(chapter)

    completed++
    try {
      onEntryDone?.(completed, chapters.length)
    } catch {}
  })

  await parallelWithLimit(tasks, PARALLEL_CHAPTER_LIMIT())
  return spine
}

export {
  isOllamaProvider,
  PARALLEL_CHAPTER_LIMIT,
  formatFullSpineEntry,
  SPINE_ENTRY_SCHEMA,
  compressSpine,
  SPINE_TIMEOUT_MS,
  fallbackSpineEntry,
  generateSpine
}
