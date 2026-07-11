import { ref, computed } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'

let uid = 0
function uidNext() {
  return `cc-${++uid}`
}

const COMMON_CAPITALIZED = new Set([
  'The',
  'This',
  'That',
  'These',
  'Those',
  'It',
  'Its',
  'He',
  'She',
  'They',
  'We',
  'You',
  'I',
  'My',
  'His',
  'Her',
  'Our',
  'Your',
  'Their',
  'Me',
  'Him',
  'Us',
  'Them',
  'Then',
  'Than',
  'When',
  'What',
  'Where',
  'Who',
  'Whom',
  'Which',
  'How',
  'Why',
  'But',
  'And',
  'Or',
  'Nor',
  'For',
  'Not',
  'Yet',
  'So',
  'If',
  'As',
  'At',
  'By',
  'In',
  'On',
  'To',
  'Up',
  'Of',
  'With',
  'All',
  'Each',
  'Every',
  'Both',
  'Few',
  'Many',
  'Much',
  'Some',
  'Any',
  'No',
  'Only',
  'Just',
  'Very',
  'Too',
  'Also',
  'Even',
  'Still',
  'Well',
  'Here',
  'There',
  'Now',
  'Again',
  'A',
  'An',
  'One',
  'Two',
  'Three'
])

export function useConsistencyChecker() {
  const results = ref([])
  const isScanning = ref(false)
  const lastScan = ref(null)

  const counts = computed(() => {
    const r = results.value
    return {
      errors: r.filter((i) => i.severity === 'error').length,
      warnings: r.filter((i) => i.severity === 'warning').length,
      info: r.filter((i) => i.severity === 'info').length
    }
  })

  const resultsBySeverity = computed(() => ({
    errors: results.value.filter((i) => i.severity === 'error'),
    warnings: results.value.filter((i) => i.severity === 'warning'),
    info: results.value.filter((i) => i.severity === 'info')
  }))

  function clearResults() {
    results.value = []
    lastScan.value = null
    uid = 0
  }

  async function scan() {
    isScanning.value = true
    results.value = []

    const bible = useStoryBibleStore()
    const manuscript = useManuscriptStore()
    const graph = useStoryGraphStore()

    const charMap = new Map(bible.characters.map((c) => [c.id, c]))
    const locMap = new Map(bible.locations.map((l) => [l.id, l]))

    const charNameLower = new Map()
    for (const c of bible.characters) {
      if (c.name) charNameLower.set(c.name.toLowerCase(), c.id)
    }

    const locNameLower = new Map()
    for (const l of bible.locations) {
      if (l.name) locNameLower.set(l.name.toLowerCase(), l.id)
    }

    const allBibleNamesLower = new Set([...charNameLower.keys(), ...locNameLower.keys()])

    const findings = []

    function buildGraphEntityIds() {
      const charIds = new Set()
      const locIds = new Set()
      for (const edge of graph.edges) {
        if (edge.sourceType === 'character') charIds.add(String(edge.sourceId))
        if (edge.targetType === 'character') charIds.add(String(edge.targetId))
        if (edge.sourceType === 'location') locIds.add(String(edge.sourceId))
        if (edge.targetType === 'location') locIds.add(String(edge.targetId))
      }
      for (const key of Object.keys(graph.nodeInstances || {})) {
        if (key.startsWith('char-')) charIds.add(key.slice(5))
        if (key.startsWith('loc-')) locIds.add(key.slice(4))
      }
      return { charIds, locIds }
    }

    // --- 1. Orphaned Characters (error) ---
    {
      const mentionedNames = new Set()
      const contentPieces = [
        ...manuscript.subsections.map((s) => s.content || ''),
        ...manuscript.storyElements.map((e) => e.title || '')
      ]
      for (const text of contentPieces) {
        const lower = text.toLowerCase()
        for (const name of charNameLower.keys()) {
          if (name && lower.includes(name)) mentionedNames.add(name)
        }
      }

      const { charIds: graphCharIds } = buildGraphEntityIds()

      for (const char of bible.characters) {
        if (char.role === 'background') continue
        const nameLow = char.name?.toLowerCase()
        const inManuscript = nameLow && mentionedNames.has(nameLow)
        const inGraph = graphCharIds.has(String(char.id))
        if (!inManuscript && !inGraph) {
          findings.push({
            id: uidNext(),
            severity: 'error',
            category: 'orphaned_character',
            title: `Orphaned character: ${char.name}`,
            description: `${char.name} has no manuscript mentions and no graph connections.`,
            action: { label: 'Open Bible', type: 'open-bible', payload: String(char.id) }
          })
        }
      }
    }

    // --- 2. Orphaned Locations (warning) ---
    {
      const mentionedNames = new Set()
      for (const sub of manuscript.subsections) {
        const lower = (sub.content || '').toLowerCase()
        for (const name of locNameLower.keys()) {
          if (name && lower.includes(name)) mentionedNames.add(name)
        }
      }

      const { locIds: graphLocIds } = buildGraphEntityIds()

      for (const loc of bible.locations) {
        const nameLow = loc.name?.toLowerCase()
        const inManuscript = nameLow && mentionedNames.has(nameLow)
        const inGraph = graphLocIds.has(String(loc.id))
        if (!inManuscript && !inGraph) {
          findings.push({
            id: uidNext(),
            severity: 'warning',
            category: 'orphaned_location',
            title: `Orphaned location: ${loc.name}`,
            description: `${loc.name} has no manuscript mentions and no graph connections.`,
            action: { label: 'Open Bible', type: 'open-bible', payload: String(loc.id) }
          })
        }
      }
    }

    // --- 3. Undefined Mentions (error) ---
    {
      for (const sub of manuscript.subsections) {
        const candidates = extractUndefinedNames(sub.content || '', allBibleNamesLower)
        for (const name of candidates) {
          findings.push({
            id: uidNext(),
            severity: 'error',
            category: 'undefined_mention',
            title: `Undefined mention: "${name}"`,
            description: `"${name}" in "${sub.title || 'Untitled'}" isn't in the story bible.`,
            action: { label: 'Open Section', type: 'open-section', payload: sub.sectionId }
          })
        }
      }
      for (const se of manuscript.storyElements) {
        const candidates = extractUndefinedNames(se.title || '', allBibleNamesLower)
        for (const name of candidates) {
          findings.push({
            id: uidNext(),
            severity: 'error',
            category: 'undefined_mention',
            title: `Undefined mention: "${name}"`,
            description: `"${name}" in story element "${se.title}" isn't in the story bible.`,
            action: { label: 'Open Section', type: 'open-section', payload: se.id }
          })
        }
      }
    }

    // --- 4. Graph–Bible Mismatches (error + info) ---
    {
      const charIds = new Set(bible.characters.map((c) => c.id))
      const locIdsSet = new Set(bible.locations.map((l) => l.id))

      for (const edge of graph.edges) {
        if (edge.isLegacy) continue
        for (const side of ['source', 'target']) {
          const type = edge[`${side}Type`]
          const id = edge[`${side}Id`]
          if (type === 'character' && !charIds.has(id)) {
            findings.push({
              id: uidNext(),
              severity: 'error',
              category: 'graph_mismatch',
              title: 'Graph references missing character',
              description: `Edge references character #${id} that no longer exists.`,
              action: { label: 'Open Graph', type: 'open-graph', payload: edge.id }
            })
          } else if (type === 'location' && !locIdsSet.has(id)) {
            findings.push({
              id: uidNext(),
              severity: 'error',
              category: 'graph_mismatch',
              title: 'Graph references missing location',
              description: `Edge references location #${id} that no longer exists.`,
              action: { label: 'Open Graph', type: 'open-graph', payload: edge.id }
            })
          }
        }
      }

      const { charIds: graphCharIds, locIds: graphLocIds } = buildGraphEntityIds()
      for (const char of bible.characters) {
        if (!graphCharIds.has(String(char.id))) {
          findings.push({
            id: uidNext(),
            severity: 'info',
            category: 'graph_mismatch',
            title: `No graph entry: ${char.name}`,
            description: `${char.name} has no story graph representation.`,
            action: { label: 'Open Graph', type: 'open-graph', payload: String(char.id) }
          })
        }
      }
      for (const loc of bible.locations) {
        if (!graphLocIds.has(String(loc.id))) {
          findings.push({
            id: uidNext(),
            severity: 'info',
            category: 'graph_mismatch',
            title: `No graph entry: ${loc.name}`,
            description: `${loc.name} has no story graph representation.`,
            action: { label: 'Open Graph', type: 'open-graph', payload: String(loc.id) }
          })
        }
      }
    }

    // --- 5. Plot Thread Gaps (warning) ---
    {
      for (const thread of bible.plotThreads) {
        const threadId = String(thread.id)
        const nameLow = thread.name?.toLowerCase()

        const hasGraphConnection = graph.edges.some(
          (e) => String(e.sourceId) === threadId || String(e.targetId) === threadId
        )

        const hasManuscriptRef =
          nameLow &&
          manuscript.subsections.some(
            (sub) => nameLow && (sub.content || '').toLowerCase().includes(nameLow)
          )

        if (!hasGraphConnection && !hasManuscriptRef) {
          findings.push({
            id: uidNext(),
            severity: 'warning',
            category: 'plot_thread_gap',
            title: `Plot thread not woven: ${thread.name}`,
            description: `${thread.name} has no character connections and no manuscript references.`,
            action: { label: 'Open Bible', type: 'open-bible', payload: threadId }
          })
        }
      }
    }

    // --- 6. Relationship Orphans (warning) ---
    {
      for (const rel of manuscript.relationships) {
        const missing = []
        if (!charMap.has(rel.fromCharacterId)) missing.push(`#${rel.fromCharacterId}`)
        if (!charMap.has(rel.toCharacterId)) missing.push(`#${rel.toCharacterId}`)
        if (missing.length > 0) {
          findings.push({
            id: uidNext(),
            severity: 'warning',
            category: 'relationship_orphan',
            title: 'Orphaned relationship',
            description: `A relationship references missing character(s): ${missing.join(', ')}.`
          })
        }
      }
    }

    results.value = findings
    lastScan.value = new Date()
    isScanning.value = false
  }

  return {
    results,
    isScanning,
    lastScan,
    counts,
    resultsBySeverity,
    scan,
    clearResults
  }
}

function extractUndefinedNames(text, knownNames) {
  if (!text) return []
  const found = new Set()
  const words = text.match(/\b[A-Z][a-z]+\b/g) || []
  for (const word of words) {
    if (COMMON_CAPITALIZED.has(word)) continue
    const lower = word.toLowerCase()
    const isKnown = [...knownNames].some((name) => name && name.includes(lower))
    if (!isKnown) found.add(word)
  }
  return [...found]
}
