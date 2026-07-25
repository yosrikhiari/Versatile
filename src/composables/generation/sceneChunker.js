const CHUNK_THRESHOLD = 2000
const SECTION_TARGET = 1200
const MAX_CHUNKS = 4

const SECTION_ROLES = [
  'Opening: establish setting, mood, and the initial dramatic question',
  'Rising action: develop conflict, deepen complications, raise stakes',
  'Peak: confront the central obstacle — tension peaks, a choice or revelation lands',
  'Fallout: show consequences, transition toward the next scene'
]

export function shouldChunkScene(sceneBrief) {
  const wordTarget = sceneBrief.estimatedWords || 800
  return wordTarget > CHUNK_THRESHOLD
}

export function splitSceneIntoChunks(sceneBrief) {
  const wordTarget = sceneBrief.estimatedWords || 800
  const numChunks = Math.min(MAX_CHUNKS, Math.max(2, Math.ceil(wordTarget / SECTION_TARGET)))

  return Array.from({ length: numChunks }, (_, i) => {
    const isLast = i === numChunks - 1
    const wordsForThis = isLast ? wordTarget - SECTION_TARGET * (numChunks - 1) : SECTION_TARGET

    return {
      ...sceneBrief,
      estimatedWords: Math.max(200, wordsForThis),
      sectionIndex: i + 1,
      totalSections: numChunks,
      sectionRole: SECTION_ROLES[i] || `Continue the scene — section ${i + 1} of ${numChunks}`,
      _originalEstimatedWords: wordTarget
    }
  })
}

export function mergeChunkProse(proseArray) {
  return proseArray
    .filter(Boolean)
    .map((prose) => prose.trim())
    .join('\n\n')
}
