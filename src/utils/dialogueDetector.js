const DIALOGUE_TAG_PATTERN =
  /\b(said|asked|replied|whispered|shouted|yelled|cried|called|murmured|muttered|grumbled|snapped|growled|hissed|breathed|sighed|laughed|chuckled|giggled|groaned|moaned|sobbed|wept|screamed|roared|bellowed|thundered|hollered|screeched|shrieked|hissed|spat|snorted|scoffed|retorted|answered|responded|offered|suggested|agreed|conceded|admitted|confessed|lied|joked|teased|began|continued|added|interrupted|cut in|broke in|piped up|chimed in|corrected|warned|threatened|promised|vowed|pleaded|begged|prayed|insisted|declared|announced|proclaimed|stated|observed|noted|remarked|commented|mused|pondered|reflected|wondered|thought|reasoned|calculated|concluded|decided|determined|resolved|commanded|ordered|demanded|instructed|directed|requested|proposed|offered|volunteered|relented|capitulated|surrendered|yielded|acquiesced|assented|nodded|smiled|frowned|grimaced|shrugged|gestured|waved)(\s+(he|she|they|I|we|you|the\s+\w+|\w+))?/i

const QUOTE_PAIRS = [
  { open: '"', close: '"', name: 'double' },
  { open: '\u201c', close: '\u201d', name: 'left-double' },
  { open: '\u201e', close: '\u201d', name: 'low-double' },
  { open: '\u00ab', close: '\u00bb', name: 'angle' },
  { open: '\u2018', close: '\u2019', name: 'single-curly' },
  { open: "'", close: "'", name: 'single-straight' },
  { open: '\u2039', close: '\u203a', name: 'single-angle' }
]

const TAG_BEFORE = new RegExp(
  '^(' + DIALOGUE_TAG_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '') + ')\\s+',
  'i'
)

function findMatchingQuote(text, startIndex, openChar, closeChar) {
  let i = startIndex
  while (i < text.length) {
    if (text[i] === closeChar) return i
    if (text[i] === openChar) {
      const innerEnd = findMatchingQuote(text, i + 1, openChar, closeChar)
      if (innerEnd === -1) return -1
      i = innerEnd
    }
    i++
  }
  return -1
}

function findDialogueTag(text, quoteStart, quoteEnd) {
  const before = text.substring(0, quoteStart).trim()
  const after = text.substring(quoteEnd + 1).trim()

  const beforeMatch = before.match(TAG_BEFORE)
  if (beforeMatch) {
    return {
      tag: beforeMatch[1].trim(),
      position: 'before'
    }
  }

  const tagInAfter = after.match(
    new RegExp(
      '^[,;:\\s]*(' + DIALOGUE_TAG_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '') + ')',
      'i'
    )
  )
  if (tagInAfter) {
    return {
      tag: tagInAfter[1].trim(),
      position: 'after'
    }
  }

  return null
}

function extractQuotedDialogue(text) {
  const results = []

  for (const pair of QUOTE_PAIRS) {
    let pos = 0
    while (pos < text.length) {
      const openIdx = text.indexOf(pair.open, pos)
      if (openIdx === -1) break

      const closeIdx = findMatchingQuote(text, openIdx + 1, pair.open, pair.close)
      if (closeIdx === -1) {
        pos = openIdx + 1
        continue
      }

      const dialogueText = text.substring(openIdx + 1, closeIdx).trim()
      if (!dialogueText) {
        pos = closeIdx + 1
        continue
      }

      const tagInfo = findDialogueTag(text, openIdx, closeIdx)

      let speakerCandidate = null
      if (tagInfo) {
        const tagMatch = tagInfo.tag.match(
          /\b(said|asked|replied|whispered|shouted|yelled|cried|called|murmured|muttered|grumbled|snapped|growled|hissed|breathed|sighed|laughed|chuckled|giggled|groaned|moaned|sobbed|wept|screamed|roared|bellowed|thundered|hollered|screeched|shrieked|hissed|spat|snorted|scoffed|retorted|answered|responded|offered|suggested|agreed|conceded|admitted|confessed|lied|joked|teased|began|continued|added|interrupted|cut in|broke in|piped up|chimed in|corrected|warned|threatened|promised|vowed|pleaded|begged|prayed|insisted|declared|announced|proclaimed|stated|observed|noted|remarked|commented|mused|pondered|reflected|wondered|thought|reasoned|calculated|concluded|decided|determined|resolved|commanded|ordered|demanded|instructed|directed|requested|proposed|offered|volunteered|relented|capitulated|surrendered|yielded|acquiesced|assented|nodded|smiled|frowned|grimaced|shrugged|gestured|waved)\s+(\w[\w\s]*)/
        )
        if (tagMatch) {
          speakerCandidate = tagMatch[2]?.trim() || null
        }
      }

      results.push({
        dialogueText,
        fullText: text.substring(openIdx, closeIdx + 1),
        quoteChar: pair.open,
        quoteName: pair.name,
        tag: tagInfo?.tag || null,
        tagPosition: tagInfo?.position || null,
        speakerCandidate
      })

      pos = closeIdx + 1
    }
  }

  return results
}

function extractEmDashDialogue(text) {
  const results = []
  const lines = text.split(/\n+/)

  for (const line of lines) {
    const trimmed = line.trim()
    const emDashMatch = trimmed.match(/^[\u2014\u2013\u2e3a\u2e3b]{1,2}\s*(.+)/)
    if (emDashMatch) {
      const dialogueText = emDashMatch[1].trim()

      const tagInfo = findDialogueTagFallback(dialogueText)

      results.push({
        dialogueText,
        fullText: trimmed,
        quoteChar: '\u2014',
        quoteName: 'em-dash',
        tag: tagInfo?.tag || null,
        tagPosition: tagInfo?.position || null,
        speakerCandidate: null
      })
    }
  }

  return results
}

function findDialogueTagFallback(text) {
  const match = text.match(
    new RegExp(
      '[,;\\s]+(' + DIALOGUE_TAG_PATTERN.source.replace(/^\^/, '').replace(/\$$/, '') + ')$',
      'i'
    )
  )
  if (match) {
    return { tag: match[1].trim(), position: 'after' }
  }
  return null
}

export function detectDialogue(text, paragraphIndex) {
  if (!text || typeof text !== 'string') return []

  const quotedResults = extractQuotedDialogue(text)
  const emDashResults = extractEmDashDialogue(text)

  const dialogueLines = [...quotedResults, ...emDashResults].map((d) => ({
    paragraphIndex,
    dialogueText: d.dialogueText,
    fullParagraphText: text,
    speakerCandidate: d.speakerCandidate,
    tag: d.tag,
    quoteChar: d.quoteChar,
    quoteName: d.quoteName
  }))

  return dialogueLines
}

export function detectDialogueBatch(paragraphs) {
  if (!Array.isArray(paragraphs)) return []

  const allDialogue = []
  for (const para of paragraphs) {
    const detected = detectDialogue(para.textContent, para.paragraphIndex)
    allDialogue.push(...detected)
  }
  return allDialogue
}

export function hasDialogue(text) {
  if (!text) return false
  return detectDialogue(text, 0).length > 0
}
