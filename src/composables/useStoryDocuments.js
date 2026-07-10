import { useProjectStore } from '../stores/projectStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { countWords } from '../utils/textUtils'
import {
  DOC_TYPES,
  getAllStoryDocuments,
  upsertStoryDocument,
  appendRejectedPattern
} from '../services/db-story-documents'

const MAX_DOC_TOKENS = 600
const STORY_DOC_BUDGET_TOKENS = 2000
// The canonical Story Context doc is the primary grounding, so it gets a larger
// slice than the legacy per-doc assembly.
const STORY_CONTEXT_BUDGET_TOKENS = 3500

// Splits the editable Story Context doc into a user-owned zone (kept forever) and
// an auto-generated zone (replaced on "Rebuild from story").
const CONTEXT_SENTINEL =
  '<!-- ⚙ AUTO-GENERATED BELOW — "Rebuild from story" replaces everything under this line. Your notes above are always kept. -->'

const AUTHOR_ZONE_TEMPLATE = `# Story Context

> This document is treated as established canon. The AI reads it before writing every scene and must not contradict it. Edit anything here freely.

## Author Canon & Notes

_Add anything the writer must honor: hard world rules, key character facts, tone, or what must NOT happen. This section is never overwritten by Rebuild._`

function tokenCount(str) {
  return Math.ceil((str || '').length / 4)
}

function truncateToBudget(content, maxTokens) {
  if (!content || tokenCount(content) <= maxTokens) return content

  const separator = '\n---\n'
  const parts = content.split(separator)
  if (parts.length <= 1) return content

  const header = parts[0]
  const entries = parts.slice(1)

  const kept = [header]
  for (const entry of entries) {
    const candidate = kept.join(separator)
    const withEntry = candidate + separator + entry
    if (tokenCount(withEntry) <= maxTokens) {
      kept.push(entry)
    } else {
      break
    }
  }

  return kept.join(separator)
}

const relationshipLabels = {
  ally: 'allied with',
  enemy: 'opposed to',
  family: 'family of',
  romantic: 'romantically connected to',
  mentor: 'mentors',
  rival: 'rivals with',
  neutral: 'neutral toward',
  appears_in: 'appears in',
  involved_in: 'involved in',
  located_at: 'located at',
  connects_to: 'connected to',
  intersects_with: 'intersects with',
  features: 'features'
}

function getLookupMaps() {
  const store = useStoryBibleStore()
  return {
    characters: new Map(store.characters.map((c) => [c.id, c])),
    locations: new Map(store.locations.map((l) => [l.id, l])),
    plotThreads: new Map(store.plotThreads.map((t) => [t.id, t]))
  }
}

// Directional relationships read differently from each side. When a character is
// the TARGET (not the source) of one of these, we flip the label — otherwise a
// single "A mentors B" edge renders as both "A mentors B" AND "B mentors A",
// which looks like a contradiction (everyone mentoring everyone). Types not listed
// here are treated as symmetric and keep the same label on both sides.
const inverseRelationshipLabels = {
  mentor: 'mentored by',
  located_at: 'location of',
  appears_in: 'features',
  involved_in: 'involves',
  connects_to: 'connected to'
}

function getRelationshipLabel(type) {
  return relationshipLabels[type] || type
}

function getRelationshipLabelDirected(type, fromTarget) {
  if (fromTarget && inverseRelationshipLabels[type]) return inverseRelationshipLabels[type]
  return getRelationshipLabel(type)
}

// Ids on graph edges may be stored as strings while store maps are keyed by the
// entity's native id — look up tolerantly across both forms.
function lookupById(map, id) {
  if (map.has(id)) return map.get(id)
  const asNum = Number(id)
  if (!Number.isNaN(asNum) && map.has(asNum)) return map.get(asNum)
  const asStr = String(id)
  if (map.has(asStr)) return map.get(asStr)
  return undefined
}

// Resolve an entity's display name, or null if it no longer exists. Returning null
// (instead of a "Character 42" placeholder) lets callers drop orphaned edges that
// point at deleted or foreign entities so they never reach the writer.
function resolveEntityName(type, id, maps) {
  switch (type) {
    case 'character':
      return lookupById(maps.characters, id)?.name || null
    case 'location':
      return lookupById(maps.locations, id)?.name || null
    case 'plotThread':
      return lookupById(maps.plotThreads, id)?.title || null
    default:
      return null
  }
}

function generateSynopsisDoc() {
  const projectStore = useProjectStore()
  const terms = projectStore.terminology
  const lines = [`# ${terms.synopsisLabel || 'Synopsis'}`]
  if (projectStore.currentCategory) {
    lines.push(`**Category:** ${projectStore.currentCategory}`)
  }
  if (projectStore.currentDescription) {
    lines.push(`**Description:** ${projectStore.currentDescription}`)
  }
  return lines.join('\n')
}

async function generateCharactersDoc(projectId) {
  const storyBibleStore = useStoryBibleStore()
  const storyGraphStore = useStoryGraphStore()
  const projectStore = useProjectStore()
  const terms = projectStore.terminology

  if (projectId) {
    await storyGraphStore.loadEdges(projectId)
  }

  const sorted = [...storyBibleStore.characters].sort(
    (a, b) => (b.lastEditedAt || 0) - (a.lastEditedAt || 0)
  )

  if (sorted.length === 0) return ''

  const parts = [`# ${terms.characters || 'Characters'}`]
  const maps = getLookupMaps()

  for (const c of sorted) {
    const entry = [`## ${c.name}`]
    if (c.role) entry.push(`**${terms.characterRole || 'Role'}:** ${c.role}`)
    if (c.goal) entry.push(`**Goal / Objective:** ${c.goal}`)
    if (c.voice) entry.push(`**Voice:** ${c.voice}`)
    if (c.notes) entry.push(`**Notes:** ${c.notes}`)
    if (c.traits?.length) entry.push(`**Traits:** ${c.traits.join(', ')}`)

    const relationships = storyGraphStore.edges.filter(
      (e) =>
        (e.sourceId === c.id && e.sourceType === 'character') ||
        (e.targetId === c.id && e.targetType === 'character')
    )
    const relLines = []
    const seenRel = new Set()
    for (const r of relationships) {
      const isSource = r.sourceId === c.id && r.sourceType === 'character'
      // Skip self-loops — a character related to itself is never meaningful.
      if (r.sourceId === r.targetId && r.sourceType === r.targetType) continue
      const otherName = isSource
        ? resolveEntityName(r.targetType, r.targetId, maps)
        : resolveEntityName(r.sourceType, r.sourceId, maps)
      // Drop orphaned edges pointing at deleted/foreign entities (the "Character 42"
      // placeholders) instead of leaking them into the writer's context.
      if (!otherName) continue
      // Flip the label when this character is on the receiving end of a directional
      // relationship, so "A mentors B" doesn't also read as "B mentors A".
      const label = getRelationshipLabelDirected(r.relationshipType, !isSource)
      // Collapse reciprocal duplicates (an A↔B pair stored as two edges).
      const dedupeKey = `${label}|${otherName}`
      if (seenRel.has(dedupeKey)) continue
      seenRel.add(dedupeKey)
      const desc = r.description ? `: ${r.description}` : ''
      relLines.push(`- ${label} ${otherName}${desc}`)
    }
    if (relLines.length > 0) {
      entry.push('')
      entry.push('### Relationships')
      entry.push(...relLines)
    }

    parts.push(entry.join('\n'))
  }

  return parts.join('\n---\n')
}

function generateWorldDoc() {
  const storyBibleStore = useStoryBibleStore()
  const projectStore = useProjectStore()
  const terms = projectStore.terminology
  const locations = storyBibleStore.locations

  if (locations.length === 0) return ''

  const parts = [`# ${terms.locations || 'World'}`]

  for (const l of locations) {
    const entry = [`## ${l.name}`]
    if (l.description) entry.push(`**Description:** ${l.description}`)
    if (l.notes) entry.push(`**Notes:** ${l.notes}`)
    if (l.traits?.length) entry.push(`**Traits:** ${l.traits.join(', ')}`)
    parts.push(entry.join('\n'))
  }

  return parts.join('\n---\n')
}

function generateTimelineDoc() {
  const storyBibleStore = useStoryBibleStore()
  const projectStore = useProjectStore()
  const terms = projectStore.terminology
  const threads = storyBibleStore.plotThreads

  if (threads.length === 0) return ''

  const sorted = [...threads].sort((a, b) => {
    return (a.timelineOrder ?? 999) - (b.timelineOrder ?? 999)
  })

  const parts = [`# ${terms.plotThreads || 'Timeline'}`]

  for (const t of sorted) {
    const statusLabel = t.status ? t.status.replace('_', ' ') : 'unknown'
    const entry = [`## ${t.title} (${statusLabel})`]
    if (t.notes) entry.push(t.notes)
    if (t.traits?.length) entry.push(`Traits: ${t.traits.join(', ')}`)
    parts.push(entry.join('\n'))
  }

  return parts.join('\n---\n')
}

function generateRelationshipsDoc() {
  const storyGraphStore = useStoryGraphStore()
  const edges = storyGraphStore.edges

  if (edges.length === 0) return ''

  const relevantEdges = edges.filter(
    (e) =>
      (e.sourceType === 'character' && e.targetType === 'character') ||
      (e.sourceType === 'character' && e.targetType === 'location') ||
      (e.sourceType === 'character' && e.targetType === 'plotThread') ||
      (e.sourceType === 'location' && e.targetType === 'character') ||
      (e.sourceType === 'plotThread' && e.targetType === 'character')
  )

  if (relevantEdges.length === 0) return ''

  const byCharacter = {}
  const maps = getLookupMaps()

  for (const e of relevantEdges) {
    if (e.sourceId === e.targetId && e.sourceType === e.targetType) continue
    const isCharSource = e.sourceType === 'character'
    const charName = isCharSource
      ? resolveEntityName(e.sourceType, e.sourceId, maps)
      : resolveEntityName(e.targetType, e.targetId, maps)
    const otherName = isCharSource
      ? resolveEntityName(e.targetType, e.targetId, maps)
      : resolveEntityName(e.sourceType, e.sourceId, maps)
    // Drop the edge entirely if either end no longer resolves to a real entity.
    if (!charName || !otherName) continue
    // The grouped character is the source unless the edge points at it, in which
    // case flip the label so direction reads correctly.
    const label = getRelationshipLabelDirected(e.relationshipType, !isCharSource)

    if (!byCharacter[charName]) byCharacter[charName] = []
    const relDesc = e.description ? `: ${e.description}` : ''
    const line = `- **${label}** ${otherName}${relDesc}`
    if (!byCharacter[charName].includes(line)) byCharacter[charName].push(line)
  }

  // Every edge may have been dropped as orphaned — don't emit a bare header.
  if (Object.keys(byCharacter).length === 0) return ''

  const parts = ['# Relationships']
  for (const [name, rels] of Object.entries(byCharacter)) {
    parts.push(`## ${name}\n${rels.join('\n')}`)
  }

  return parts.join('\n---\n')
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'it',
  'its',
  'that',
  'this',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'they',
  'we',
  'not',
  'no',
  'nor',
  'so',
  'if',
  'then',
  'than',
  'too',
  'very',
  'just',
  'about',
  'also',
  'up',
  'out',
  'down',
  'off',
  'over',
  'under',
  'again',
  'further',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'own',
  'same',
  'what',
  'which',
  'who',
  'whom',
  'my',
  'your',
  'his',
  'her',
  'our',
  'their',
  'me',
  'him',
  'us',
  'them',
  'into',
  'than',
  'then',
  'now'
])

const SEMANTIC_DOMAINS = {
  body: [
    'hand',
    'eye',
    'face',
    'heart',
    'head',
    'arm',
    'hand',
    'feet',
    'mouth',
    'lip',
    'finger',
    'skin',
    'bone',
    'blood',
    'breath',
    'chest',
    'shoulder',
    'neck',
    'leg'
  ],
  nature: [
    'sun',
    'moon',
    'star',
    'sky',
    'water',
    'wind',
    'rain',
    'tree',
    'earth',
    'stone',
    'river',
    'ocean',
    'forest',
    'flower',
    'leaf',
    'snow',
    'fire',
    'air',
    'ground',
    'cloud'
  ],
  darkness_light: [
    'dark',
    'shadow',
    'light',
    'bright',
    'black',
    'white',
    'glow',
    'dim',
    'shine',
    'pale',
    'gloom',
    'fade',
    'flash',
    'spark',
    'luminous'
  ],
  enclosure: [
    'door',
    'room',
    'wall',
    'window',
    'house',
    'building',
    'cage',
    'prison',
    'box',
    'gate',
    'hall',
    'corner',
    'floor',
    'ceiling'
  ],
  movement: [
    'run',
    'walk',
    'move',
    'rush',
    'chase',
    'follow',
    'turn',
    'reach',
    'fall',
    'rise',
    'crawl',
    'slip',
    'grip',
    'pull',
    'push'
  ],
  emotion: [
    'fear',
    'love',
    'hate',
    'anger',
    'joy',
    'grief',
    'hope',
    'despair',
    'pain',
    'dread',
    'rage',
    'guilt',
    'shame',
    'wonder',
    'awe'
  ],
  sound: [
    'voice',
    'sound',
    'whisper',
    'scream',
    'shout',
    'silence',
    'noise',
    'cry',
    'murmur',
    'echo',
    'rustle',
    'footstep'
  ]
}

const DOMAIN_LABELS = {
  body: 'imagery leans toward body and physical sensation',
  nature: 'nature and environment imagery dominates',
  darkness_light: 'writing favors darkness and light contrast',
  enclosure: 'enclosed spaces and structural imagery recur',
  movement: 'movement and physical action drive the prose',
  emotion: 'emotional and affective language is prominent',
  sound: 'auditory imagery and sound play a strong role'
}

function generateStyleGuideDoc() {
  const manuscriptStore = useManuscriptStore()
  const sortedSections = manuscriptStore.sortedSections
  const subsections = manuscriptStore.subsections

  const recentSections = sortedSections.slice(-5)
  if (recentSections.length === 0) return ''

  const contentParts = []
  for (const section of recentSections) {
    const sectionSubs = subsections
      .filter((s) => s.sectionId === section.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
    for (const sub of sectionSubs) {
      if (sub.content) contentParts.push(sub.content)
    }
  }

  const fullText = contentParts.join('\n\n')
  if (countWords(fullText) < 200) return ''

  const sentences = fullText.match(/[^.!?\n]+[.!?]/g) || []
  const words = fullText.match(/\b\w+\b/g) || []

  const avgSentenceWords = sentences.length > 0 ? Math.round(words.length / sentences.length) : 0
  const sentenceRhythm = avgSentenceWords < 12 ? 'short' : avgSentenceWords < 22 ? 'medium' : 'long'

  const firstPerson = (fullText.match(/\b(I|me|my|mine|we|us|our)\b/g) || []).length
  const thirdPerson = (fullText.match(/\b(he|she|they|him|her|them|his|their)\b/g) || []).length
  const pov = firstPerson > thirdPerson ? 'first' : 'third'

  const pastIndicators = (fullText.match(/\b(was|were)\b/g) || []).length
  const presentIndicators = (fullText.match(/\b(is|are)\b/g) || []).length
  const totalTense = pastIndicators + presentIndicators
  let tense = 'unknown'
  if (totalTense > 0) {
    const pastRatio = pastIndicators / totalTense
    if (pastRatio > 0.6) tense = 'past'
    else if (pastRatio < 0.4) tense = 'present'
  }

  const wordFreq = {}
  for (const word of words) {
    const lower = word.toLowerCase()
    if (!STOP_WORDS.has(lower) && lower.length > 2) {
      wordFreq[lower] = (wordFreq[lower] || 0) + 1
    }
  }
  const sortedWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word)

  const lines = ['## Style Guide (auto-inferred)']
  lines.push(`- POV: ${pov}`)
  lines.push(`- Tense: ${tense}`)
  lines.push(`- Sentence rhythm: ${sentenceRhythm}`)
  if (sortedWords.length > 0) {
    lines.push(`- Recurring motifs: ${sortedWords.join(', ')}`)
  }

  let domainFound = null
  for (const [domain, domainWords] of Object.entries(SEMANTIC_DOMAINS)) {
    const matchCount = sortedWords.filter((motif) => {
      const stem = motif.endsWith('s') ? motif.slice(0, -1) : motif
      return domainWords.includes(stem)
    }).length
    if (matchCount >= 2) {
      domainFound = domain
      break
    }
  }
  if (domainFound) {
    lines.push(`- Voice note: ${DOMAIN_LABELS[domainFound]}`)
  }

  return lines.join('\n')
}

async function generateRejectedPatternsDoc(projectId) {
  const doc = await getAllStoryDocuments(projectId)
  const rejectedDoc = doc.find((d) => d.docType === DOC_TYPES.REJECTED_PATTERNS)
  if (!rejectedDoc) return ''

  let patterns
  try {
    patterns = JSON.parse(rejectedDoc.content || '[]')
  } catch {
    return ''
  }

  if (!Array.isArray(patterns) || patterns.length === 0) return ''

  const parts = [
    '# Avoid These Patterns',
    'The following character concepts were rejected. Generate nothing similar to them.'
  ]

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i]
    const dateStr = p.rejectedAt ? new Date(p.rejectedAt).toLocaleString() : ''
    const fields = []
    if (p.name) fields.push(`Name: "${p.name}"`)
    if (p.role) fields.push(`Role: "${p.role}"`)
    if (p.goal) fields.push(`Goal: "${p.goal}"`)
    if (p.voice) fields.push(`Voice: "${p.voice}"`)
    if (p.notes) fields.push(`Notes: "${p.notes.slice(0, 100)}"`)
    parts.push(`${i + 1}. ${fields.join(', ')}${dateStr ? ` — rejected at ${dateStr}` : ''}`)
  }

  return parts.join('\n')
}

// Strips HTML/whitespace and clips prose to a short excerpt for the "Story So Far"
// running summary. Subsection content can be plain prose (AI-written) or Tiptap HTML.
function summarizeExcerpt(content, wordLimit = 45) {
  const text = String(content || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  const words = text.split(' ')
  if (words.length <= wordLimit) return text
  return words.slice(0, wordLimit).join(' ') + '…'
}

// A running account of what has actually been written, chapter by chapter. This is
// what stops continued generation from re-inventing events that already happened.
function generateStorySoFarDoc() {
  const manuscriptStore = useManuscriptStore()
  const sections = manuscriptStore.sortedSections || []
  const subsections = manuscriptStore.subsections || []
  if (sections.length === 0) return ''

  const parts = []
  for (const section of sections) {
    const sectionSubs = subsections
      .filter((s) => s.sectionId === section.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
    const written = sectionSubs.filter((s) => s.content && s.content.trim())
    if (written.length === 0) continue

    const lines = [`## ${section.title || 'Chapter'}`]
    for (const sub of written) {
      const excerpt = summarizeExcerpt(sub.content)
      if (excerpt) lines.push(`- **${sub.title || 'Scene'}:** ${excerpt}`)
    }
    if (lines.length > 1) parts.push(lines.join('\n'))
  }

  if (parts.length === 0) return ''
  return [
    '# Story So Far',
    'What has already been written. Continue consistently with these events — do not contradict or repeat them.',
    ...parts
  ].join('\n\n')
}

// Assembles the auto-generated body of the Story Context doc from the story bible
// plus the prose written so far. Empty sections are skipped.
async function buildStoryContextAuto(projectId) {
  const blocks = []
  const push = (v) => {
    if (v && v.trim()) blocks.push(v.trim())
  }

  push(generateSynopsisDoc())
  push(await generateCharactersDoc(projectId))
  push(generateWorldDoc())
  push(generateTimelineDoc())
  push(generateRelationshipsDoc())
  push(generateStorySoFarDoc())
  push(generateStyleGuideDoc())
  push(await generateRejectedPatternsDoc(projectId))

  return blocks.join('\n\n')
}

// Splits a stored Story Context doc at the sentinel: everything above is the
// user-owned author zone, everything below is regenerable.
function splitAuthorZone(content) {
  if (!content) return { authorZone: '', autoZone: '' }
  const idx = content.indexOf(CONTEXT_SENTINEL)
  if (idx === -1) return { authorZone: content.trimEnd(), autoZone: '' }
  return {
    authorZone: content.slice(0, idx).trimEnd(),
    autoZone: content.slice(idx + CONTEXT_SENTINEL.length).trimStart()
  }
}

// Builds a complete Story Context doc, preserving the given author zone (or the
// starter template when there isn't one yet).
async function buildStoryContextDoc(projectId, existingAuthorZone) {
  const authorZone =
    existingAuthorZone && existingAuthorZone.trim()
      ? existingAuthorZone.trimEnd()
      : AUTHOR_ZONE_TEMPLATE
  const auto = await buildStoryContextAuto(projectId)
  return `${authorZone}\n\n${CONTEXT_SENTINEL}\n\n${auto}`.trim()
}

async function getStoryContextDoc(projectId) {
  if (!projectId) return null
  return getDocument(projectId, DOC_TYPES.STORY_CONTEXT)
}

async function saveStoryContextDoc(projectId, content) {
  if (!projectId) return
  await upsertStoryDocument(projectId, DOC_TYPES.STORY_CONTEXT, content || '')
}

// Regenerates the auto zone from the current story state while keeping the user's
// author zone intact. Creates the doc on first use.
async function rebuildStoryContextDoc(projectId) {
  if (!projectId) return ''
  const existing = await getDocument(projectId, DOC_TYPES.STORY_CONTEXT)
  const { authorZone } = splitAuthorZone(existing?.content || '')
  const doc = await buildStoryContextDoc(projectId, authorZone)
  await upsertStoryDocument(projectId, DOC_TYPES.STORY_CONTEXT, doc)
  return doc
}

async function loadDocuments(projectId) {
  return getAllStoryDocuments(projectId)
}

async function getDocument(projectId, docType) {
  const docs = await getAllStoryDocuments(projectId)
  return docs.find((d) => d.docType === docType) || null
}

async function regenerateDocument(projectId, docType) {
  if (!projectId) return
  let content = ''
  switch (docType) {
    case DOC_TYPES.SYNOPSIS:
      content = generateSynopsisDoc()
      break
    case DOC_TYPES.CHARACTERS:
      content = await generateCharactersDoc(projectId)
      break
    case DOC_TYPES.WORLD:
      content = generateWorldDoc()
      break
    case DOC_TYPES.TIMELINE:
      content = generateTimelineDoc()
      break
    case DOC_TYPES.RELATIONSHIPS:
      content = generateRelationshipsDoc()
      break
    case DOC_TYPES.REJECTED_PATTERNS:
      content = await generateRejectedPatternsDoc(projectId)
      break
    case DOC_TYPES.STYLE_GUIDE:
      content = generateStyleGuideDoc()
      break
  }
  await upsertStoryDocument(projectId, docType, content)
}

async function regenerateAllDocuments(projectId) {
  if (!projectId) return
  const existing = await getAllStoryDocuments(projectId)
  const existingTypes = new Set(existing.filter((d) => d.content).map((d) => d.docType))
  const allTypes = [
    DOC_TYPES.SYNOPSIS,
    DOC_TYPES.CHARACTERS,
    DOC_TYPES.WORLD,
    DOC_TYPES.TIMELINE,
    DOC_TYPES.RELATIONSHIPS,
    DOC_TYPES.REJECTED_PATTERNS,
    DOC_TYPES.STYLE_GUIDE
  ]
  await Promise.all(
    allTypes.filter((dt) => !existingTypes.has(dt)).map((dt) => regenerateDocument(projectId, dt))
  )
}

async function getStoryDocumentContext(projectId, budgetTokens = STORY_DOC_BUDGET_TOKENS) {
  if (!projectId) return ''

  const docs = await getAllStoryDocuments(projectId)
  const docMap = {}
  for (const d of docs) {
    docMap[d.docType] = d.content
  }

  // When a canonical Story Context doc exists, it IS the grounding — it already
  // aggregates synopsis, bible, and story-so-far, and the user may have edited it.
  const contextDoc = docMap[DOC_TYPES.STORY_CONTEXT]
  if (contextDoc && contextDoc.trim()) {
    const budget = Math.max(budgetTokens, STORY_CONTEXT_BUDGET_TOKENS)
    return truncateToBudget(contextDoc, budget)
  }

  const parts = []
  let remaining = budgetTokens

  const synopsis = docMap[DOC_TYPES.SYNOPSIS]
  if (synopsis) {
    parts.push(synopsis)
    remaining -= tokenCount(synopsis)
  }

  const priorityOrder = [
    DOC_TYPES.CHARACTERS,
    DOC_TYPES.WORLD,
    DOC_TYPES.TIMELINE,
    DOC_TYPES.RELATIONSHIPS,
    DOC_TYPES.REJECTED_PATTERNS,
    DOC_TYPES.STYLE_GUIDE
  ]

  for (const docType of priorityOrder) {
    if (remaining <= 0) break
    const content = docMap[docType]
    if (content) {
      const docBudget = docType === DOC_TYPES.STYLE_GUIDE ? 150 : MAX_DOC_TOKENS
      const budget = Math.min(remaining, docBudget)
      const truncated = truncateToBudget(content, budget)
      if (truncated) {
        parts.push(truncated)
        remaining -= tokenCount(truncated)
      }
    }
  }

  return parts.join('\n\n')
}

async function logRejectedPattern(projectId, pattern) {
  if (!projectId) return
  await appendRejectedPattern(projectId, pattern)
  await regenerateDocument(projectId, DOC_TYPES.REJECTED_PATTERNS)
}

export function useStoryDocuments() {
  return {
    loadDocuments,
    getDocument,
    regenerateDocument,
    regenerateAllDocuments,
    getStoryDocumentContext,
    logRejectedPattern,
    getStoryContextDoc,
    saveStoryContextDoc,
    rebuildStoryContextDoc,
    buildStoryContextDoc
  }
}

export {
  CONTEXT_SENTINEL,
  tokenCount,
  truncateToBudget,
  getRelationshipLabel,
  generateSynopsisDoc,
  generateCharactersDoc,
  generateWorldDoc,
  generateTimelineDoc,
  generateRelationshipsDoc,
  generateStyleGuideDoc,
  generateStorySoFarDoc,
  splitAuthorZone,
  buildStoryContextDoc
}
