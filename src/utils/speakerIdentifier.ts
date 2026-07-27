interface DialogueLine {
  speakerCandidate?: string
  speakerId?: string | number | null
  speakerName?: string | null
  needsReview?: boolean
  fullParagraphText?: string
  [key: string]: unknown
}

interface Character {
  id: string | number
  name?: string
  aliases?: string[]
}

interface CharacterInfo {
  id: string | number
  name: string | null
}

interface EnrichedDialogueLine extends DialogueLine {
  speakerId: string | number | null
  speakerName: string | null
  confidence: number
  needsReview: boolean
}

interface SpeakerIndexEntry {
  speakerId: string | number
  speakerName: string | null
  lines: DialogueLine[]
  totalLines: number
}

interface SpeakerIndex {
  [speakerId: string]: SpeakerIndexEntry
}

export function identifySpeakers(dialogueLines: DialogueLine[], characters: Character[]): EnrichedDialogueLine[] {
  if (!Array.isArray(dialogueLines) || !Array.isArray(characters)) return []

  const charMap = buildCharacterMap(characters)
  const enriched: EnrichedDialogueLine[] = []

  for (let i = 0; i < dialogueLines.length; i++) {
    const line = dialogueLines[i]
    let speakerId: string | number | null = null
    let speakerName: string | null = null
    let confidence = 0
    let needsReview = false

    const tagMatch = identifyFromTag(line, charMap)
    if (tagMatch) {
      speakerId = tagMatch.id
      speakerName = tagMatch.name
      confidence = 0.9
    } else {
      const contextMatch = identifyFromContext(dialogueLines, i, charMap)
      if (contextMatch) {
        speakerId = contextMatch.id
        speakerName = contextMatch.name
        confidence = 0.6
        needsReview = true
      } else {
        needsReview = true
      }
    }

    enriched.push({
      ...line,
      speakerId,
      speakerName,
      confidence,
      needsReview
    })
  }

  return enriched
}

function buildCharacterMap(characters: Character[]): Map<string, CharacterInfo> {
  const map = new Map<string, CharacterInfo>()

  for (const char of characters) {
    const name = char.name?.trim()
    if (!name) continue

    const normalized = name.toLowerCase()
    map.set(normalized, { id: char.id, name: char.name || null })

    const parts = normalized.split(/\s+/)
    if (parts.length > 1) {
      for (const part of parts) {
        if (part.length >= 2 && !map.has(part)) {
          map.set(part, { id: char.id, name: char.name || null })
        }
      }
    }

    if (char.aliases && Array.isArray(char.aliases)) {
      for (const alias of char.aliases) {
        const aliasNorm = alias.toLowerCase().trim()
        if (!map.has(aliasNorm)) {
          map.set(aliasNorm, { id: char.id, name: char.name || null })
        }
      }
    }
  }

  return map
}

function identifyFromTag(line: DialogueLine, charMap: Map<string, CharacterInfo>): CharacterInfo | null {
  if (!line.speakerCandidate) return null

  const candidate = line.speakerCandidate.toLowerCase().trim()

  if (charMap.has(candidate)) {
    return charMap.get(candidate)!
  }

  const candidateParts = candidate.split(/\s+/)
  for (const part of candidateParts) {
    if (part.length >= 2 && charMap.has(part)) {
      const match = charMap.get(part)!

      if (candidateParts.length === 1 || candidate.toLowerCase().includes(part)) {
        return match
      }
    }
  }

  return null
}

function identifyFromContext(dialogueLines: DialogueLine[], currentIndex: number, charMap: Map<string, CharacterInfo>): CharacterInfo | null {
  const windowStart = Math.max(0, currentIndex - 10)

  for (let i = currentIndex - 1; i >= windowStart; i--) {
    const prev = dialogueLines[i]
    if (prev.speakerId && !prev.needsReview) {
      return { id: prev.speakerId, name: prev.speakerName || null }
    }
  }

  const currentLine = dialogueLines[currentIndex]
  if (!currentLine) return null

  const fullText = currentLine.fullParagraphText?.toLowerCase() || ''
  for (const [nameKey, charInfo] of charMap) {
    const nameWords = nameKey.split(/\s+/)
    for (const word of nameWords) {
      if (word.length < 2) continue
      const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      if (regex.test(fullText)) {
        return charInfo
      }
    }
  }

  return null
}

export function buildSpeakerIndex(dialogueLines: DialogueLine[]): SpeakerIndex {
  if (!Array.isArray(dialogueLines)) return {}

  const index: SpeakerIndex = {}
  for (const line of dialogueLines) {
    if (!line.speakerId) continue
    if (!index[line.speakerId]) {
      index[line.speakerId] = {
        speakerId: line.speakerId,
        speakerName: line.speakerName || null,
        lines: [],
        totalLines: 0
      }
    }
    index[line.speakerId].lines.push(line)
    index[line.speakerId].totalLines++
  }
  return index
}

export function getUnidentifiedLines(dialogueLines: DialogueLine[]): DialogueLine[] {
  if (!Array.isArray(dialogueLines)) return []
  return dialogueLines.filter((l) => !l.speakerId || l.needsReview)
}
