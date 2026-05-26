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

function getEntityName(type, id) {
  const store = useStoryBibleStore()
  switch (type) {
    case 'character':
      return store.characters.find(c => c.id === id)?.name || `Character ${id}`
    case 'location':
      return store.locations.find(l => l.id === id)?.name || `Location ${id}`
    case 'plotThread':
      return store.plotThreads.find(t => t.id === id)?.title || `Plot ${id}`
    default:
      return `Entity ${id}`
  }
}

function getRelationshipLabel(type) {
  return relationshipLabels[type] || type
}

function generateSynopsisDoc() {
  const projectStore = useProjectStore()
  const lines = ['# Story Synopsis']
  if (projectStore.currentCategory) {
    lines.push(`**Category:** ${projectStore.currentCategory}`)
  }
  if (projectStore.currentDescription) {
    lines.push(`**Description:** ${projectStore.currentDescription}`)
  }
  return lines.join('\n')
}

function generateCharactersDoc() {
  const storyBibleStore = useStoryBibleStore()
  const storyGraphStore = useStoryGraphStore()

  const sorted = [...storyBibleStore.characters].sort(
    (a, b) => (b.lastEditedAt || 0) - (a.lastEditedAt || 0)
  )

  if (sorted.length === 0) return ''

  const parts = ['# Characters']

  for (const c of sorted) {
    const entry = [`## ${c.name}`]
    if (c.role) entry.push(`**Role:** ${c.role}`)
    if (c.goal) entry.push(`**Goal:** ${c.goal}`)
    if (c.voice) entry.push(`**Voice:** ${c.voice}`)
    if (c.notes) entry.push(`**Notes:** ${c.notes}`)

    const relationships = storyGraphStore.edges.filter(
      e => (e.sourceId === c.id && e.sourceType === 'character') ||
           (e.targetId === c.id && e.targetType === 'character')
    )
    if (relationships.length > 0) {
      entry.push('')
      entry.push('### Relationships')
      for (const r of relationships) {
        const isSource = r.sourceId === c.id && r.sourceType === 'character'
        const otherName = isSource
          ? getEntityName(r.targetType, r.targetId)
          : getEntityName(r.sourceType, r.sourceId)
        const label = getRelationshipLabel(r.relationshipType)
        entry.push(`- ${label} ${otherName}${r.description ? `: ${r.description}` : ''}`)
      }
    }

    parts.push(entry.join('\n'))
  }

  return parts.join('\n---\n')
}

function generateWorldDoc() {
  const storyBibleStore = useStoryBibleStore()
  const locations = storyBibleStore.locations

  if (locations.length === 0) return ''

  const parts = ['# World']

  for (const l of locations) {
    const entry = [`## ${l.name}`]
    if (l.description) entry.push(`**Description:** ${l.description}`)
    if (l.notes) entry.push(`**Notes:** ${l.notes}`)
    parts.push(entry.join('\n'))
  }

  return parts.join('\n---\n')
}

function generateTimelineDoc() {
  const storyBibleStore = useStoryBibleStore()
  const threads = storyBibleStore.plotThreads

  if (threads.length === 0) return ''

  const statusOrder = { in_progress: 0, open: 1, resolved: 2, closed: 3 }
  const sorted = [...threads].sort((a, b) => {
    return (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
  })

  const parts = ['# Timeline']

  for (const t of sorted) {
    const statusLabel = t.status ? t.status.replace('_', ' ') : 'unknown'
    const entry = [`## ${t.title} (${statusLabel})`]
    if (t.notes) entry.push(t.notes)
    parts.push(entry.join('\n'))
  }

  return parts.join('\n---\n')
}

function generateRelationshipsDoc() {
  const storyGraphStore = useStoryGraphStore()
  const edges = storyGraphStore.edges

  if (edges.length === 0) return ''

  const charEdges = edges.filter(
    e => e.sourceType === 'character' && e.targetType === 'character'
  )

  if (charEdges.length === 0) return ''

  const byCharacter = {}
  for (const e of charEdges) {
    const sourceName = getEntityName(e.sourceType, e.sourceId)
    const targetName = getEntityName(e.targetType, e.targetId)
    const label = getRelationshipLabel(e.relationshipType)

    if (!byCharacter[sourceName]) byCharacter[sourceName] = []
    byCharacter[sourceName].push(`- **${label}** ${targetName}${e.description ? `: ${e.description}` : ''}`)
  }

  const parts = ['# Relationships']
  for (const [name, rels] of Object.entries(byCharacter)) {
    parts.push(`## ${name}\n${rels.join('\n')}`)
  }

  return parts.join('\n---\n')
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'it', 'its', 'that',
  'this', 'these', 'those', 'i', 'you', 'he', 'she', 'they', 'we', 'not',
  'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about',
  'also', 'up', 'out', 'down', 'off', 'over', 'under', 'again', 'further',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'what', 'which', 'who', 'whom', 'my', 'your', 'his', 'her',
  'our', 'their', 'me', 'him', 'us', 'them', 'into', 'than', 'then', 'now'
])

const SEMANTIC_DOMAINS = {
  body: ['hand', 'eye', 'face', 'heart', 'head', 'arm', 'hand', 'feet', 'mouth', 'lip', 'finger', 'skin', 'bone', 'blood', 'breath', 'chest', 'shoulder', 'neck', 'leg'],
  nature: ['sun', 'moon', 'star', 'sky', 'water', 'wind', 'rain', 'tree', 'earth', 'stone', 'river', 'ocean', 'forest', 'flower', 'leaf', 'snow', 'fire', 'air', 'ground', 'cloud'],
  darkness_light: ['dark', 'shadow', 'light', 'bright', 'black', 'white', 'glow', 'dim', 'shine', 'pale', 'gloom', 'fade', 'flash', 'spark', 'luminous'],
  enclosure: ['door', 'room', 'wall', 'window', 'house', 'building', 'cage', 'prison', 'box', 'gate', 'hall', 'corner', 'floor', 'ceiling'],
  movement: ['run', 'walk', 'move', 'rush', 'chase', 'follow', 'turn', 'reach', 'fall', 'rise', 'crawl', 'slip', 'grip', 'pull', 'push'],
  emotion: ['fear', 'love', 'hate', 'anger', 'joy', 'grief', 'hope', 'despair', 'pain', 'dread', 'rage', 'guilt', 'shame', 'wonder', 'awe'],
  sound: ['voice', 'sound', 'whisper', 'scream', 'shout', 'silence', 'noise', 'cry', 'murmur', 'echo', 'rustle', 'footstep']
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
      .filter(s => s.sectionId === section.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
    for (const sub of sectionSubs) {
      if (sub.content) contentParts.push(sub.content)
    }
  }

  const fullText = contentParts.join('\n\n')
  if (countWords(fullText) < 200) return ''

  const sentences = fullText.match(/[^.!?\n]+[.!?]/g) || []
  const words = fullText.match(/\b\w+\b/g) || []

  const avgSentenceWords = sentences.length > 0
    ? Math.round(words.length / sentences.length)
    : 0
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
    const matchCount = sortedWords.filter(motif => {
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
  const rejectedDoc = doc.find(d => d.docType === DOC_TYPES.REJECTED_PATTERNS)
  if (!rejectedDoc) return ''

  let patterns
  try {
    patterns = JSON.parse(rejectedDoc.content || '[]')
  } catch {
    return ''
  }

  if (!Array.isArray(patterns) || patterns.length === 0) return ''

  const parts = ['# Avoid These Patterns', 'The following character concepts were rejected. Generate nothing similar to them.']

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

export function useStoryDocuments() {
  async function loadDocuments(projectId) {
    return getAllStoryDocuments(projectId)
  }

  async function getDocument(projectId, docType) {
    const docs = await getAllStoryDocuments(projectId)
    return docs.find(d => d.docType === docType) || null
  }

  async function regenerateDocument(projectId, docType) {
    if (!projectId) return
    let content = ''
    switch (docType) {
      case DOC_TYPES.SYNOPSIS:
        content = generateSynopsisDoc()
        break
      case DOC_TYPES.CHARACTERS:
        content = generateCharactersDoc()
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
    await Promise.all([
      regenerateDocument(projectId, DOC_TYPES.SYNOPSIS),
      regenerateDocument(projectId, DOC_TYPES.CHARACTERS),
      regenerateDocument(projectId, DOC_TYPES.WORLD),
      regenerateDocument(projectId, DOC_TYPES.TIMELINE),
      regenerateDocument(projectId, DOC_TYPES.RELATIONSHIPS),
      regenerateDocument(projectId, DOC_TYPES.REJECTED_PATTERNS),
      regenerateDocument(projectId, DOC_TYPES.STYLE_GUIDE)
    ])
  }

  async function getStoryDocumentContext(projectId, budgetTokens = STORY_DOC_BUDGET_TOKENS) {
    if (!projectId) return ''

    const docs = await getAllStoryDocuments(projectId)
    const docMap = {}
    for (const d of docs) {
      docMap[d.docType] = d.content
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

  return {
    loadDocuments,
    getDocument,
    regenerateDocument,
    regenerateAllDocuments,
    getStoryDocumentContext,
    logRejectedPattern
  }
}
