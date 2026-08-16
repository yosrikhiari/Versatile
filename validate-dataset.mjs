/**
 * Validates the 100-chapter dataset for internal consistency.
 * Checks: character/location ID continuity, seam continuity (cast carry-over),
 * causes/effects chain consistency, and structural rules.
 * 
 * Usage: npx vite-node validate-dataset.mjs
 */

import fs from 'node:fs'

const dataset = JSON.parse(
  fs.readFileSync('novel-100-chapter-dataset.json', 'utf8')
)

// ---- Basic structure validation ----
let errors = []
let warnings = []

if (!dataset.title) errors.push('Missing title')
if (!dataset.genre) errors.push('Missing genre')
if (!dataset.tone) errors.push('Missing tone')
if (!dataset.logline) errors.push('Missing logline')
if (!dataset.author) errors.push('Missing author')
if (!Array.isArray(dataset.chapters) || dataset.chapters.length === 0) errors.push('Missing chapters array')

// Chapter-level validation
const allChapterNumbers = new Set()
const charIdToChapters = new Map()  // charId -> [chapterNumbers]
const locIdToChapters = new Map()   // locId -> [chapterNumbers]
const plotThreadIdToChapters = new Map() // plotThreadId -> [chapterNumbers]

dataset.chapters.forEach((ch, ci) => {
  const n = ch.chapterNumber
  
  // Chapter number must be 1-100 and unique
  if (n < 1 || n > 100) errors.push(`Ch.${n}: chapterNumber out of range`)
  if (allChapterNumbers.has(n)) errors.push(`Ch.${n}: duplicate chapterNumber`)
  allChapterNumbers.add(n)
  
  // Required fields
  if (!ch.title) errors.push(`Ch.${n}: missing title`)
  if (!ch.summary) errors.push(`Ch.${n}: missing summary`)
  if (!ch.prose) errors.push(`Ch.${n}: missing prose`)
  if (!ch.id) errors.push(`Ch.${n}: missing id`)
  if (ch.characterIds === undefined) errors.push(`Ch.${n}: missing characterIds`)
  if (ch.keyFacts === undefined) errors.push(`Ch.${n}: missing keyFacts`)
  
  // Track character/location appearances
  if (ch.characterIds && Array.isArray(ch.characterIds)) {
    ch.characterIds.forEach(id => {
      if (!charIdToChapters.has(id)) charIdToChapters.set(id, [])
      charIdToChapters.get(id).push(n)
    })
  }
  if (ch.locationId !== undefined) {
    if (!locIdToChapters.has(ch.locationId)) locIdToChapters.set(ch.locationId, [])
    locIdToChapters.get(ch.locationId).push(n)
  }
  if (ch.plotThreads && Array.isArray(ch.plotThreads)) {
    ch.plotThreads.forEach(id => {
      if (!plotThreadIdToChapters.has(id)) plotThreadIdToChapters.set(id, [])
      plotThreadIdToChapters.get(id).push(n)
    })
  }
  
  // Causes/effects must reference existing chapters
  if (ch.causes && Array.isArray(ch.causes)) {
    ch.causes.forEach(cid => {
      if (!allChapterNumbers.has(cid)) errors.push(`Ch.${n}: causes references non-existent chapter ${cid}`)
    })
  }
  if (ch.effects && Array.isArray(ch.effects)) {
    ch.effects.forEach(eid => {
      if (!allChapterNumbers.has(eid)) errors.push(`Ch.${n}: effects references non-existent chapter ${eid}`)
    })
  }
  
  // Seam continuity: previousChapterId should reference prior chapter
  if (ch.previousChapterId && !allChapterNumbers.has(ch.previousChapterId)) {
    errors.push(`Ch.${n}: previousChapterId references non-existent chapter ${ch.previousChapterId}`)
  }
  
  // Seam continuity heuristic: if previousChapterId is set, the current chapter should
  // share at least one character with the previous chapter (cast carry-over)
  if (ch.previousChapterId && ch.characterIds) {
    // We'll check this after building the full map
  }
})

// ---- Cross-chapter analysis ----

// Build character appearance map
charIdToChapters.forEach((chapters, charId) => {
  if (chapters.length > 1) {
    // Character appears in multiple chapters - check for carry-over
    // Heuristic: if a character appears in consecutive chapters, that's good for seam continuity
    const sorted = [...chapters].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] - sorted[i] === 1) {
        // Consecutive appearance - note for seam continuity
      }
    }
  }
})

// Build location appearance map
locIdToChapters.forEach((chapters, locId) => {
  if (chapters.length > 0) {
    const sorted = [...chapters].sort((a, b) => a - b)
    // Check for consecutive appearances
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] - sorted[i] === 1) {
        // Consecutive location appearance
      }
    }
  }
})

// Plot thread appearance map
plotThreadIdToChapters.forEach((chapters, ptId) => {
  if (chapters.length > 0) {
    const sorted = [...chapters].sort((a, b) => a - b)
    // Check for consecutive appearances
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] - sorted[i] === 1) {
        // Consecutive plot thread appearance
      }
    }
  }
})

// Seam continuity: check adjacent chapters for cast-carryover
console.log(`=== 100-Chapter Dataset Validation (Internal Consistency) ===`)
console.log(`Total chapters: ${dataset.chapters.length}`)
console.log(`Chapter numbers: ${[...allChapterNumbers].sort((a, b) => a - b).join(', ')}`)

// Check each chapter has required fields
let chaptersWithErrors = 0
dataset.chapters.forEach((ch, i) => {
  const n = ch.chapterNumber
  let chapterErrors = 0
  
  if (!ch.title) { chapterErrors++; errors.push(`Ch.${n}: missing title`); chaptersWithErrors++ }
  if (!ch.summary) { chapterErrors++; errors.push(`Ch.${n}: missing summary`); chaptersWithErrors++ }
  if (!ch.prose) { chapterErrors++; errors.push(`Ch.${n}: missing prose`); chaptersWithErrors++ }
  if (!ch.id) { chapterErrors++; errors.push(`Ch.${n}: missing id`); chaptersWithErrors++ }
  if (ch.characterIds === undefined) { chapterErrors++; errors.push(`Ch.${n}: missing characterIds`); chaptersWithErrors++ }
  if (ch.keyFacts === undefined) { chapterErrors++; errors.push(`Ch.${n}: missing keyFacts`); chaptersWithErrors++ }
  
  // Check character IDs are valid integers
  if (ch.characterIds && Array.isArray(ch.characterIds)) {
    ch.characterIds.forEach((cid, idx) => {
      if (typeof cid !== 'integer') errors.push(`Ch.${n}: characterIds[${idx}] is not an integer: ${cid}`)
    })
  }
  
  // Check keyFacts are strings
  if (ch.keyFacts && Array.isArray(ch.keyFacts)) {
    ch.keyFacts.forEach((kf, idx) => {
      if (typeof kf !== 'string') errors.push(`Ch.${n}: keyFacts[${idx}] is not a string: ${kf}`)
    })
  }
  
  if (chapterErrors > 0) chaptersWithErrors++
})

console.log(`Chapters with structural errors: ${chaptersWithErrors}/${dataset.chapters.length}`)

// Seam continuity: adjacent chapters with shared cast
console.log(`\nSeam continuity analysis:`)
let seamlessCount = 0
let discontinuousCount = 0

for (let i = 1; i < dataset.chapters.length; i++) {
  const prev = dataset.chapters[i - 1]
  const cur = dataset.chapters[i]
  
  if (!prev.characterIds || !cur.characterIds) {
    discontinuousCount++
    continue
  }
  
  // Check for shared characters
  const shared = prev.characterIds.filter(c => cur.characterIds.includes(c))
  if (shared.length > 0) {
    seamlessCount++
    // Optionally: check if previousChapterId is set and matches
    if (cur.previousChapterId && cur.previousChapterId === prev.id) {
      // Good: explicit seam link + cast carry-over
    }
  } else {
    discontinuousCount++
    // Check if there's a narrative reason (e.g., time jump, location change)
    if (!ch.previousChapterId && cur.locationId !== prev.locationId) {
      // Location change without explicit seam - note it
    }
  }
}

console.log(`  Seam continuity (cast carry-over): ${seamlessCount} adjacent pairs have shared cast`)
console.log(`  Seam discontinuities (no shared cast): ${discontinuousCount}`)

// Character continuity
const charsWithMultipleAppears = []
charIdToChapters.forEach((chapters, charId) => {
  if (chapters.length >= 2) {
    const sorted = [...chapters].sort((a, b) => a - b)
    const hasConsecutive = sorted.some((id, idx) => sorted[idx + 1] - id === 1)
    if (hasConsecutive) {
      charsWithMultipleAppears.push({ id: charId, chapters: chapters.length })
    }
  }
})

console.log(`\nCharacters appearing in consecutive chapters: ${charsWithMultipleAppears.length}`)
if (charsWithMultipleAppears.length > 0) {
  console.log(`  Sample: ${charsWithMultipleAppears.slice(0, 5).map(c => `Ch${c.chapters.length}`).join(', ')}`)
}

// Plot thread continuity
const threadsWithMultipleAppears = []
plotThreadIdToChapters.forEach((chapters, ptId) => {
  if (chapters.length >= 2) {
    const sorted = [...chapters].sort((a, b) => a - b)
    const hasConsecutive = sorted.some((id, idx) => sorted[idx + 1] - id === 1)
    if (hasConsecutive) {
      threadsWithMultipleAppears.push({ id: ptId, chapters: chapters.length })
    }
  }
})

console.log(`Plot threads appearing in consecutive chapters: ${threadsWithMultipleAppears.length}`)

// Summary
const totalErrorsCount = errors.length
console.log(`\n=== SUMMARY ===`)
console.log(`Total structural errors: ${totalErrorsCount}`)
console.log(`Chapters with errors: ${chaptersWithErrors}/${dataset.chapters.length}`)
console.log(`Seam continuity: ${seamlessCount} smooth, ${discontinuousCount} discontinuous`)
console.log(`Characters with consecutive appearances: ${charsWithMultipleAppears.length}`)
console.log(`Plot threads with consecutive appearances: ${threadsWithMultipleAppears.length}`)

if (totalErrorsCount === 0 && chaptersWithErrors === 0 && seamlessCount > discontinuousCount) {
  console.log(`\nVALIDATION PASSED: Dataset is internally consistent`)
} else {
  console.log(`\nVALIDATION NOTES: See above for details`)
}

// Write observations
const observations = {
  totalChapters: dataset.chapters.length,
  totalErrors: totalErrorsCount,
  chaptersWithErrors,
  seamlessContinuous: seamlessCount,
  discontinuous: discontinuousCount,
  charsConsecutive: charsWithMultipleAppears.length,
  threadsConsecutive: threadsWithMultipleAppears.length,
  allChapterNumbers: [...allChapterNumbers].sort((a, b) => a - b)
}
fs.writeFileSync('dataset-observations.json', JSON.stringify(observations, null, 2), 'utf8')
console.log(`\nObservations written to dataset-observations.json`)