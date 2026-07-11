import { aiGenerateJson, resolveFeatureConfig } from '../../useAiService'
import { FEATURES, PROVIDERS } from '../../../config/ai'
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

function formatFullSpineEntry(s) {
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

function compressSpine(spine, tokenCap = 800) {
  if (spine.length <= 3) return spine.map(formatFullSpineEntry).join('\n')
  const full = spine.slice(-3)
  const compressed = spine
    .slice(0, -3)
    .map((s) => `Chapter ${s.chapterNumber} (${s.chapterTitle}): ${s.emotionalStateAtEnd}`)
  const combined = [...compressed, ...full.map(formatFullSpineEntry)]
  const text = combined.join('\n')
  return text.length > tokenCap * 4 ? text.slice(0, tokenCap * 4) + '\n[spine truncated]' : text
}

const SPINE_TIMEOUT_MS = 120000

function fallbackSpineEntry(chapter) {
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

async function generateSpine(chapters, storyArc, onEntryDone) {
  const spine = new Array(chapters.length)
  let completed = 0

  const tasks = chapters.map((chapter, i) => async () => {
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
        timeout: SPINE_TIMEOUT_MS,
        schema: SPINE_ENTRY_SCHEMA,
        schemaName: 'spine_entry'
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
