import { ref } from 'vue'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useProjectStore } from '../stores/projectStore'
import { getEmbedding, cosineSimilarity, clearEmbeddingCache } from '../services/ollamaService'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { useGraphContext } from './useGraphContext'

function buildEntityText(entity, type) {
  switch (type) {
    case 'character':
      const charParts = [
        entity.name,
        entity.role && `Role: ${entity.role}`,
        entity.goal && `Goal: ${entity.goal}`,
        entity.backstory && `Background: ${entity.backstory}`,
        entity.description && `Description: ${entity.description}`
      ].filter(Boolean)
      return charParts.join('. ')
      
    case 'location':
      const locParts = [
        entity.name,
        entity.description && `Description: ${entity.description}`,
        entity.atmosphere && `Atmosphere: ${entity.atmosphere}`,
        entity.history && `History: ${entity.history}`
      ].filter(Boolean)
      return locParts.join('. ')
      
    case 'plotThread':
      const threadParts = [
        entity.title,
        entity.description && `Description: ${entity.description}`,
        entity.status && `Status: ${entity.status}`,
        entity.arc && `Story Arc: ${entity.arc}`
      ].filter(Boolean)
      return threadParts.join('. ')
      
    default:
      return JSON.stringify(entity)
  }
}

function generateEmbeddingRationale(source, target, sourceType, targetType, relationshipType, similarity) {
  const sourceName = source.name || source.title || 'Entity'
  const targetName = target.name || target.title || 'Entity'
  
  const relationshipDesc = {
    'involves': 'involved in',
    'appears_in': 'appears at',
    'located_at': 'located at',
    'connects_to': 'connected to',
    'intersects_with': 'intersects with',
    'features': 'features',
    'ally': 'allied with',
    'enemy': 'opposed to',
    'family': 'family of',
    'romantic': 'romantically connected to',
    'mentor': 'mentors',
    'rival': 'rivals with',
    'neutral': 'neutral toward'
  }
  
  const connectionType = relationshipDesc[relationshipType] || 'connected to'
  
  let rationale = ''
  if (similarity >= 0.7) {
    rationale = `${sourceName} and ${targetName} share strong thematic similarity (${Math.round(similarity * 100)}% match). ${sourceName} is ${connectionType} ${targetName}.`
  } else if (similarity >= 0.5) {
    rationale = `${sourceName} relates to ${targetName} (${Math.round(similarity * 100)}% match).`
  } else if (similarity >= 0.3) {
    rationale = `${sourceName} may be ${connectionType} ${targetName}.`
  } else {
    rationale = `${sourceName} is ${connectionType} ${targetName}.`
  }
  
  return rationale
}

function calculateEmbeddingConfidence(sourceType, targetType, source, target, similarity) {
  let confidence = similarity
  
  if (sourceType === 'character' && targetType === 'character') {
    const role1 = ((source.role || '') + ' ' + (source.goal || '')).toLowerCase()
    const role2 = ((target.role || '') + ' ' + (target.goal || '')).toLowerCase()
    
    const opposingPairs = [
      ['hero', 'villain'], ['protagonist', 'antagonist'], ['leader', 'follower'],
      ['mentor', 'student'], ['guardian', 'threat'], ['ruler', 'rebel'],
      ['hunter', 'prey'], ['detective', 'criminal'], ['protector', 'destroyer']
    ]
    
    for (const [a, b] of opposingPairs) {
      if ((role1.includes(a) && role2.includes(b)) || (role1.includes(b) && role2.includes(a))) {
        confidence += 0.15
        break
      }
    }
    
    const complementaryRoles = [
      ['protagonist', 'protagonist'], ['ally', 'ally'],
      ['guard', 'protect'], ['guide', 'guide']
    ]
    
    for (const [a, b] of complementaryRoles) {
      if (role1.includes(a) && role2.includes(b)) {
        confidence += 0.1
        break
      }
    }
  }
  
  return Math.min(confidence, 0.95)
}

function getEntityLabel(entity, type) {
  if (type === 'plotThread') return entity.title
  return entity.name
}

function canonicalKey(type1, id1, type2, id2) {
  const a = `${type1}-${id1}`
  const b = `${type2}-${id2}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

function limitConnectionsPerEntity(suggestions, maxPerEntity = 3, maxTotal = Infinity) {
  const entityConnectionCount = {}
  const result = []
  const crossTypeLimit = Math.ceil(maxTotal * 0.7)

  for (const suggestion of suggestions) {
    if (suggestion.sourceType === suggestion.targetType) continue
    if (result.length >= crossTypeLimit) break
    
    const sourceKey = `${suggestion.sourceType}-${suggestion.sourceId}`
    const targetKey = `${suggestion.targetType}-${suggestion.targetId}`
    const sourceCount = entityConnectionCount[sourceKey] || 0
    const targetCount = entityConnectionCount[targetKey] || 0

    if (sourceCount < maxPerEntity && targetCount < maxPerEntity) {
      result.push(suggestion)
      entityConnectionCount[sourceKey] = sourceCount + 1
      entityConnectionCount[targetKey] = targetCount + 1
    }
  }

  const remainingSlots = maxTotal - result.length
  const sameTypePerTypeCap = Math.ceil(remainingSlots / 3)
  const sameTypeCounts = { character: 0, location: 0, plotThread: 0 }

  for (const suggestion of suggestions) {
    if (result.length >= maxTotal) break
    if (suggestion.sourceType !== suggestion.targetType) continue
    
    if (sameTypeCounts[suggestion.sourceType] >= sameTypePerTypeCap) continue
    if (sameTypeCounts[suggestion.targetType] >= sameTypePerTypeCap) continue
    
    const sourceKey = `${suggestion.sourceType}-${suggestion.sourceId}`
    const targetKey = `${suggestion.targetType}-${suggestion.targetId}`
    const sourceCount = entityConnectionCount[sourceKey] || 0
    const targetCount = entityConnectionCount[targetKey] || 0

    if (sourceCount < maxPerEntity && targetCount < maxPerEntity) {
      result.push(suggestion)
      entityConnectionCount[sourceKey] = sourceCount + 1
      entityConnectionCount[targetKey] = targetCount + 1
      sameTypeCounts[suggestion.sourceType]++
      sameTypeCounts[suggestion.targetType]++
    }
  }

  return result
}

const groupColors = [
  '#f48fb1', '#ef5350', '#ce93d8', '#f06292', '#ba68c8',
  '#ff7043', '#90a4ae', '#4fc3f7', '#80cbc4', '#aed581'
]

function generateGroupName(cluster, type) {
  const names = cluster.members.map(m => {
    const entity = m.char || m.loc
    return entity?.name || entity?.title || 'Unknown'
  })

  if (names.length === 2) {
    return `${names[0]} & ${names[1]}`
  }

  const commonPrefix = findCommonPrefix(names)
  if (commonPrefix.length > 3) {
    return `${commonPrefix} Group`
  }

  return `Group of ${names.length} ${type}`
}

function findCommonPrefix(strings) {
  if (strings.length === 0) return ''
  if (strings.length === 1) return strings[0]

  let prefix = strings[0]
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
      if (prefix.length === 0) return ''
    }
  }
  return prefix
}

function getEntityTypePrefix(type) {
  switch (type) {
    case 'character': return 'char'
    case 'location': return 'loc'
    case 'plotThread': return 'thread'
    default: return 'unknown'
  }
}

/**
 * Generate basic connections from entity metadata alone (no embeddings required).
 * Used as a last-resort fallback when AI and embeddings are unavailable.
 */
function generateMetadataConnections(characters, locations, plotThreads, existingKeys) {
  const results = []
  const connected = new Set()

  function add(sourceType, sourceId, sourceLabel, targetType, targetId, targetLabel, relationshipType, rationale, confidence) {
    const key = canonicalKey(sourceType, String(sourceId), targetType, String(targetId))
    if (connected.has(key) || existingKeys.has(key)) return
    connected.add(key)
    results.push({ sourceType, sourceId, sourceLabel, targetType, targetId, targetLabel, relationshipType, rationale, confidence, similarity: 0 })
  }

  // Character ↔ plotThread: each character involved in every plot thread
  for (const char of characters) {
    for (const thread of plotThreads) {
      add('character', char.id, char.name, 'plotThread', thread.id, thread.title,
        'involved_in',
        `${char.name} is involved in "${thread.title}".`,
        0.45)
    }
  }

  // Character ↔ location: connect character to first few locations
  for (const char of characters) {
    for (let i = 0; i < Math.min(locations.length, 2); i++) {
      const loc = locations[i]
      add('character', char.id, char.name, 'location', loc.id, loc.name,
        'appears_in',
        `${char.name} appears at ${loc.name}.`,
        0.4)
    }
  }

  // Location ↔ plotThread
  for (const loc of locations) {
    for (const thread of plotThreads) {
      add('location', loc.id, loc.name, 'plotThread', thread.id, thread.title,
        'features',
        `${loc.name} features in "${thread.title}".`,
        0.4)
    }
  }

  // Character ↔ character: role-based connections
  const opposingPairs = [
    [['hero', 'protagonist', 'guardian', 'detective', 'protector'], ['villain', 'antagonist', 'threat', 'criminal', 'destroyer'], 'enemy'],
    [['mentor', 'guide', 'teacher'], ['student', 'apprentice', 'follower'], 'mentor'],
    [['leader', 'ruler', 'commander'], ['follower', 'ally', 'guard'], 'ally'],
  ]

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i], b = characters[j]
      const roleA = ((a.role || '') + ' ' + (a.goal || '')).toLowerCase()
      const roleB = ((b.role || '') + ' ' + (b.goal || '')).toLowerCase()

      for (const [patternA, patternB, relType] of opposingPairs) {
        const matchA = patternA.some(p => roleA.includes(p))
        const matchB = patternB.some(p => roleB.includes(p))
        const matchReverse = patternA.some(p => roleB.includes(p)) && patternB.some(p => roleA.includes(p))
        if ((matchA && matchB) || matchReverse) {
          add('character', a.id, a.name, 'character', b.id, b.name,
            relType,
            `${a.name} (${a.role || 'character'}) — ${b.name} (${b.role || 'character'})`,
            0.55)
          break
        }
      }
    }
  }

  // If we still have very few, connect each character to at least one thread
  if (results.length < 3 && plotThreads.length > 0 && characters.length > 0) {
    for (const char of characters.slice(0, 3)) {
      for (const thread of plotThreads.slice(0, 1)) {
        const key = canonicalKey('character', String(char.id), 'plotThread', String(thread.id))
        if (!connected.has(key)) {
          add('character', char.id, char.name, 'plotThread', thread.id, thread.title,
            'involved_in',
            `${char.name} is part of "${thread.title}".`,
            0.35)
        }
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

export function useNetworkSuggestions() {
  const storyBibleStore = useStoryBibleStore()
  const storyGraphStore = useStoryGraphStore()
  const projectStore = useProjectStore()
  const { getRelationshipContext } = useGraphContext()
  
  const isAnalyzing = ref(false)
  const suggestions = ref([])
  const analysisError = ref('')
  const embeddingsLoaded = ref(false)
  const embeddingError = ref('')
  
  const entityEmbeddings = ref({})

  function getEntityById(type, id) {
    switch (type) {
      case 'character': return storyBibleStore.characters.find(c => c.id === id)
      case 'location': return storyBibleStore.locations.find(l => l.id === id)
      case 'plotThread': return storyBibleStore.plotThreads.find(t => t.id === id)
      default: return null
    }
  }

  function isConnected(entity1Type, entity1Id, entity2Type, entity2Id) {
    const node1Id = `${getEntityTypePrefix(entity1Type)}-${entity1Id}`
    const node2Id = `${getEntityTypePrefix(entity2Type)}-${entity2Id}`
    
    return storyGraphStore.edges.some(edge => {
      const sourceId = `${getEntityTypePrefix(edge.sourceType)}-${edge.sourceId}`
      const targetId = `${getEntityTypePrefix(edge.targetType)}-${edge.targetId}`
      return (sourceId === node1Id && targetId === node2Id) ||
             (sourceId === node2Id && targetId === node1Id)
    })
  }

  async function loadEmbeddings(forceRefresh = false) {
    if (!forceRefresh && embeddingsLoaded.value) {
      return true
    }

    if (forceRefresh) {
      clearEmbeddingCache()
      embeddingsLoaded.value = false
    }

    embeddingError.value = ''
    
    const allEntities = []
    
    for (const char of storyBibleStore.characters) {
      allEntities.push({
        type: 'character',
        id: char.id,
        name: char.name,
        text: buildEntityText(char, 'character')
      })
    }
    
    for (const loc of storyBibleStore.locations) {
      allEntities.push({
        type: 'location',
        id: loc.id,
        name: loc.name,
        text: buildEntityText(loc, 'location')
      })
    }
    
    for (const thread of storyBibleStore.plotThreads) {
      allEntities.push({
        type: 'plotThread',
        id: thread.id,
        name: thread.title,
        text: buildEntityText(thread, 'plotThread')
      })
    }
    
    let successCount = 0
    let failCount = 0
    
    for (const entity of allEntities) {
      const key = `${entity.type}_${entity.id}`
      try {
        const embedding = await getEmbedding(entity.type, entity.id, entity.text)
        if (embedding) {
          entityEmbeddings.value[key] = embedding
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }
    
    if (failCount > 0 && successCount === 0) {
      embeddingError.value = 'Failed to generate embeddings. Is Ollama running with nomic-embed-text?'
    }
    
    embeddingsLoaded.value = true
    return successCount > 0
  }

  function getEntityEmbedding(type, id) {
    const key = `${type}_${id}`
    return entityEmbeddings.value[key] || null
  }

  function calculateEmbeddingSimilarity(type1, id1, type2, id2) {
    const emb1 = getEntityEmbedding(type1, id1)
    const emb2 = getEntityEmbedding(type2, id2)
    
    if (!emb1 || !emb2) {
      return 0
    }
    
    return cosineSimilarity(emb1, emb2)
  }

  function getEntitiesByType(type) {
    switch (type) {
      case 'character': return storyBibleStore.characters
      case 'location': return storyBibleStore.locations
      case 'plotThread': return storyBibleStore.plotThreads
      default: return []
    }
  }

  /**
   * Generic suggestion generator that replaces 7 near-identical functions.
   *
   * @param {string} typeA - Source entity type ('character'|'location'|'plotThread')
   * @param {string} typeB - Target entity type
   * @param {string} relType - Relationship type label
   * @param {object} [opts]
   * @param {number} [opts.similarityThreshold] - Min similarity to include (for same-type pairs)
   * @returns {Array} Suggestion objects with the standard shape
   */
  function getSuggestionsForPair(typeA, typeB, relType, opts = {}) {
    const listA = getEntitiesByType(typeA)
    const listB = getEntitiesByType(typeB)
    const { similarityThreshold = 0 } = opts
    const sameType = typeA === typeB
    const results = []

    for (let i = 0; i < listA.length; i++) {
      const startJ = sameType ? i + 1 : 0
      for (let j = startJ; j < listB.length; j++) {
        const a = listA[i]
        const b = listB[j]

        if (isConnected(typeA, a.id, typeB, b.id)) continue

        const similarity = calculateEmbeddingSimilarity(typeA, a.id, typeB, b.id)
        if (similarity < similarityThreshold) continue

        const confidence = calculateEmbeddingConfidence(typeA, typeB, a, b, similarity)
        const rationale = generateEmbeddingRationale(a, b, typeA, typeB, relType, similarity)

        results.push({
          sourceType: typeA,
          sourceId: a.id,
          sourceLabel: getEntityLabel(a, typeA),
          targetType: typeB,
          targetId: b.id,
          targetLabel: getEntityLabel(b, typeB),
          relationshipType: relType,
          rationale,
          confidence,
          similarity
        })
      }
    }

    return results
  }

  function getAllSuggestions() {
    const seen = new Set()
    const raw = [
      ...getSuggestionsForPair('character', 'character', 'connects_to', { similarityThreshold: 0.7 }),
      ...getSuggestionsForPair('character', 'plotThread', 'involved_in'),
      ...getSuggestionsForPair('location', 'location', 'connects_to', { similarityThreshold: 0.7 }),
      ...getSuggestionsForPair('character', 'location', 'appears_in'),
      ...getSuggestionsForPair('plotThread', 'plotThread', 'intersects_with', { similarityThreshold: 0.7 }),
      ...getSuggestionsForPair('location', 'plotThread', 'located_at'),
      ...getSuggestionsForPair('plotThread', 'character', 'features')
    ]
    return raw.filter(s => {
      const key = canonicalKey(s.sourceType, s.sourceId, s.targetType, s.targetId)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).sort((a, b) => b.confidence - a.confidence)
  }

  async function generateNetworkWithAI() {
    isAnalyzing.value = true
    analysisError.value = ''
    
    try {
      if (storyBibleStore.characters.length === 0 && storyBibleStore.locations.length === 0 && storyBibleStore.plotThreads.length === 0) {
        throw new Error('No story elements available. Please add characters, locations, or plot threads first.')
      }

      await loadEmbeddings()

      const characters = storyBibleStore.characters.map(c => ({
        id: c.id,
        name: c.name,
        role: c.role || 'unspecified',
        goal: c.goal || 'unspecified',
        backstory: c.backstory || ''
      }))
      
      const locations = storyBibleStore.locations.map(l => ({
        id: l.id,
        name: l.name,
        description: l.description || 'unspecified'
      }))
      
      const plotThreads = storyBibleStore.plotThreads.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        status: t.status
      }))

      const existingConnections = storyGraphStore.edges.map(e => ({
        from: e.sourceType,
        to: e.targetType,
        type: e.relationshipType
      }))

      const entityIds = [
        ...storyBibleStore.characters.map(c => ({ type: 'character', id: c.id })),
        ...storyBibleStore.locations.map(l => ({ type: 'location', id: l.id })),
        ...storyBibleStore.plotThreads.map(t => ({ type: 'plotThread', id: t.id }))
      ]
      const relationshipContext = await getRelationshipContext(entityIds, 2)
      const relationshipContextSection = relationshipContext
        ? `\nExisting relationship paths (for context):\n${relationshipContext}\n`
        : ''

      const systemPrompt = `You are a story analyst helping to build a relationship network between story elements. You have access to semantic embeddings that understand meaning, not just keywords. Use your understanding of story structure to suggest meaningful connections.`

      const prompt = `Available characters:\n${JSON.stringify(characters, null, 2)}\n\nAvailable locations:\n${JSON.stringify(locations, null, 2)}\n\nAvailable plot threads:\n${JSON.stringify(plotThreads, null, 2)}\n\nExisting connections (avoid suggesting these):\n${JSON.stringify(existingConnections, null, 2)}${relationshipContextSection}

Analyze these elements using semantic understanding and suggest meaningful new connections. Consider:\n1. Character-character: Protagonist/antagonist relationships, mentor/student, allies, rivals, family bonds\n2. Character-location: Where characters spend time, where key scenes happen, emotional connections\n3. Character-plotThread: Which characters are involved in which plot threads, motivations\n4. Location-plotThread: Where plot threads unfold, atmosphere fit\n5. Location-location: Connected through character travel or story events\n6. PlotThread-plotThread: Subplots that intersect or influence each other, thematic parallels\n\nFor each connection, consider semantic similarity in goals, themes, atmospheres, and story arcs - not just word matching.\n\nRespond with a JSON array of suggested connections, each with:\n- sourceType: "character" or "location" or "plotThread"\n- sourceId: the numeric id of the source element from the input\n- targetType: "character" or "location" or "plotThread"\n- targetId: the numeric id of the target element\n- relationshipType: "appears_in" | "involved_in" | "located_at" | "connects_to" | "intersects_with" | "features" | "ally" | "enemy" | "family" | "romantic" | "mentor" | "rival"\n- rationale: brief explanation of why this connection makes semantic sense\n- confidence: a number from 0.0 to 1.0 indicating how confident you are\n\nOnly suggest connections between elements that exist. Respond with valid JSON array only, no markdown.`

      const response = await aiGenerate(prompt, systemPrompt, { feature: FEATURES.NETWORK })
      
      let parsedSuggestions = []
      try {
        const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const rawSuggestions = JSON.parse(cleanedResponse)
        
        parsedSuggestions = rawSuggestions.map(s => {
          const sourceEntity = getEntityById(s.sourceType, s.sourceId)
          const targetEntity = getEntityById(s.targetType, s.targetId)
          
          if (sourceEntity && targetEntity) {
            const similarity = calculateEmbeddingSimilarity(s.sourceType, s.sourceId, s.targetType, s.targetId)
            const confidence = Math.max(s.confidence || 0.5, similarity || 0)
            
            return {
              sourceType: s.sourceType,
              sourceId: sourceEntity.id,
              sourceLabel: sourceEntity.name || sourceEntity.title,
              targetType: s.targetType,
              targetId: targetEntity.id,
              targetLabel: targetEntity.name || targetEntity.title,
              relationshipType: s.relationshipType,
              rationale: s.rationale || '',
              confidence,
              similarity
            }
          }
          return null
        }).filter(s => s !== null)
        
      } catch (parseError) {
        console.warn('AI parse error, falling back to embedding-based suggestions:', parseError)
        analysisError.value = 'Could not parse AI suggestions. Using embedding-based suggestions instead.'
        parsedSuggestions = getAllSuggestions().slice(0, 10)
      }
      
      return parsedSuggestions.slice(0, 15)

    } catch (error) {
      analysisError.value = 'Failed to generate suggestions: ' + error.message
      return getAllSuggestions().slice(0, 5)
    } finally {
      isAnalyzing.value = false
    }
  }

  async function applySuggestion(suggestion) {
    if (!projectStore.currentProjectId) {
      return { success: false, reason: 'no_project', message: 'No project selected' }
    }
    
    if (suggestion.sourceType === suggestion.targetType && suggestion.sourceId === suggestion.targetId) {
      return { success: false, reason: 'self_reference', message: 'Cannot connect entity to itself' }
    }
    
    if (isConnected(suggestion.sourceType, suggestion.sourceId, suggestion.targetType, suggestion.targetId)) {
      return { success: false, reason: 'already_connected', message: 'Connection already exists' }
    }
    
    const sourceEntity = getEntityById(suggestion.sourceType, suggestion.sourceId)
    const targetEntity = getEntityById(suggestion.targetType, suggestion.targetId)
    
    if (!sourceEntity) {
      return { 
        success: false, 
        reason: 'source_not_found', 
        message: `Source ${suggestion.sourceType} not found` 
      }
    }
    
    if (!targetEntity) {
      return { 
        success: false, 
        reason: 'target_not_found', 
        message: `Target ${suggestion.targetType} not found` 
      }
    }
    
    const existingNodeId = `${getEntityTypePrefix(suggestion.sourceType)}-${suggestion.sourceId}`
    const targetNodeId = `${getEntityTypePrefix(suggestion.targetType)}-${suggestion.targetId}`
    
    if (!storyGraphStore.nodePositions[existingNodeId]) {
      storyGraphStore.saveNodePosition(projectStore.currentProjectId, existingNodeId, { x: 100, y: 100 })
    }
    if (!storyGraphStore.nodePositions[targetNodeId]) {
      storyGraphStore.saveNodePosition(projectStore.currentProjectId, targetNodeId, { x: 300, y: 100 })
    }
    
    if (!storyGraphStore.nodeInstances[existingNodeId]) {
      storyGraphStore.nodeInstances[existingNodeId] = []
    }
    if (!storyGraphStore.nodeInstances[existingNodeId].includes(existingNodeId)) {
      storyGraphStore.nodeInstances[existingNodeId].push(existingNodeId)
    }
    if (!storyGraphStore.nodeInstances[targetNodeId]) {
      storyGraphStore.nodeInstances[targetNodeId] = []
    }
    if (!storyGraphStore.nodeInstances[targetNodeId].includes(targetNodeId)) {
      storyGraphStore.nodeInstances[targetNodeId].push(targetNodeId)
    }
    await storyGraphStore.saveNodeInstances(projectStore.currentProjectId)
    
    const edgeData = {
      sourceId: suggestion.sourceId,
      sourceType: suggestion.sourceType,
      targetId: suggestion.targetId,
      targetType: suggestion.targetType,
      relationshipType: suggestion.relationshipType,
      description: suggestion.rationale || ''
    }
    
    try {
      await storyGraphStore.addEdgeData(projectStore.currentProjectId, edgeData)
      await storyGraphStore.loadEdges(projectStore.currentProjectId)
      
      console.log('[applySuggestion] edge added for:', suggestion.sourceType, suggestion.sourceId, '→', suggestion.targetType, suggestion.targetId)
      
      return { success: true, reason: null, message: null }
    } catch (error) {
      return { success: false, reason: 'error', message: error.message || 'Failed to add connection' }
    }
  }

  async function autoGenerateWithAI(options = {}) {
    const {
      confidenceThreshold = 0.65,
      maxConnections = 10,
      maxPerEntity = 3,
      prompt = '',
      existingEntities = null
    } = options

    const characters = existingEntities 
      ? storyBibleStore.characters.filter(c => existingEntities.includes(`char-${c.id}`))
      : storyBibleStore.characters
    const locations = existingEntities
      ? storyBibleStore.locations.filter(l => existingEntities.includes(`loc-${l.id}`))
      : storyBibleStore.locations
    const plotThreads = existingEntities
      ? storyBibleStore.plotThreads.filter(t => existingEntities.includes(`thread-${t.id}`))
      : storyBibleStore.plotThreads

    isAnalyzing.value = true
    analysisError.value = ''

    try {
      await loadEmbeddings(!!existingEntities)

      const charactersForAI = characters.map(c => ({
        id: c.id, name: c.name,
        role: c.role || '', goal: c.goal || '',
        backstory: (c.backstory || '').slice(0, 300),
        voice: (c.voice || '').slice(0, 100),
        notes: (c.notes || '').slice(0, 100)
      }))
      const locationsForAI = locations.map(l => ({
        id: l.id, name: l.name,
        description: (l.description || '').slice(0, 120)
      }))
      const plotThreadsForAI = plotThreads.map(t => ({
        id: t.id, title: t.title,
        description: (t.description || '').slice(0, 120),
        status: t.status
      }))

      const existingKeys = new Set(
        storyGraphStore.edges.map(e => canonicalKey(e.sourceType, String(e.sourceId), e.targetType, String(e.targetId)))
      )

      const synopsisContext = projectStore.currentDescription?.trim()
        ? `Description:\n${projectStore.currentDescription.trim()}\n\n`
        : ''
      
      const genreContext = projectStore.currentCategory?.trim()
        ? `Category: ${projectStore.currentCategory.trim()}\n\n`
        : ''
      
      const contextLine = prompt?.trim()
        ? `Writer's focus: "${prompt.trim()}". Prioritise connections relevant to this theme.`
        : ''

      const entityIds = [
        ...storyBibleStore.characters.map(c => ({ type: 'character', id: c.id })),
        ...storyBibleStore.locations.map(l => ({ type: 'location', id: l.id })),
        ...storyBibleStore.plotThreads.map(t => ({ type: 'plotThread', id: t.id }))
      ]
      const relationshipContext = await getRelationshipContext(entityIds, 2)
      const relationshipContextSection = relationshipContext
        ? `\n\nRelationship context:\n${relationshipContext}\n`
        : ''

      console.log('[AutoGenerate] Focus prompt:', prompt)

      const systemPrompt = `You are a story structure analyst. Given story entities and context, suggest meaningful narrative connections. Return ONLY a valid JSON array. No markdown, no explanation.`

      const userPrompt = `${synopsisContext}${genreContext}${contextLine}${relationshipContextSection}

Characters: ${JSON.stringify(charactersForAI)}
Locations: ${JSON.stringify(locationsForAI)}
Plot threads: ${JSON.stringify(plotThreadsForAI)}

Suggest up to 20 connections as a JSON array. Each item:
{
  "sourceType": "character"|"location"|"plotThread",
  "sourceId": <number>,
  "targetType": "character"|"location"|"plotThread",
  "targetId": <number>,
  "relationshipType": "appears_in"|"involved_in"|"located_at"|"connects_to"|"intersects_with"|"features"|"ally"|"enemy"|"family"|"romantic"|"mentor"|"rival"|"neutral",
  "rationale": "<one sentence>",
  "confidence": <0.0–1.0>
}

Rules:
- Only use IDs that exist in the provided data
- Do not suggest connections where sourceId === targetId
- Prefer specific relationship types over generic "connects_to"
- ${contextLine ? 'Honour the writer\'s focus above' : 'Vary relationship types across the result set'}
- You MUST include cross-type connections: character→location (appears_in), character→plotThread (involved_in), location→plotThread (features). At least 50% of suggestions must be cross-type.`

      let rawSuggestions = []

      try {
        console.log('[AutoGenerate] Attempting AI generation...')
        const response = await aiGenerate(userPrompt, systemPrompt, { feature: FEATURES.NETWORK })
        const cleaned = response.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
        const match = cleaned.match(/\[[\s\S]*\]/)
        if (match) {
          rawSuggestions = JSON.parse(match[0])
          console.log('[AutoGenerate] AI returned suggestions:', rawSuggestions.length)
        }
      } catch (aiError) {
        console.warn('[AutoGenerate] AI generation failed, falling back to embeddings:', aiError)
        analysisError.value = 'Ollama unavailable — using embedding similarity instead.'
      }

      let enriched = rawSuggestions.length > 0
        ? rawSuggestions
            .map(s => {
              const sourceEntity = getEntityById(s.sourceType, s.sourceId)
              const targetEntity = getEntityById(s.targetType, s.targetId)
              if (!sourceEntity || !targetEntity) return null
              if (s.sourceType === s.targetType && s.sourceId === s.targetId) return null

              const similarity = calculateEmbeddingSimilarity(s.sourceType, s.sourceId, s.targetType, s.targetId)
              const blendedConfidence = Math.min(
                (s.confidence || 0.5) * 0.7 + (similarity || 0) * 0.3,
                0.95
              )

              return {
                sourceType: s.sourceType,
                sourceId: sourceEntity.id,
                sourceLabel: sourceEntity.name || sourceEntity.title,
                targetType: s.targetType,
                targetId: targetEntity.id,
                targetLabel: targetEntity.name || targetEntity.title,
                relationshipType: s.relationshipType || 'connects_to',
                rationale: s.rationale || '',
                confidence: blendedConfidence,
                similarity
              }
            })
            .filter(Boolean)
        : []

      // DEBUG: log fallback case
      if (enriched.length === 0) {
        console.log('[AutoGenerate] Falling back to getAllSuggestions() - AI returned nothing or failed')
        
        let allSuggestions = getAllSuggestions()
        
        // Filter to only canvas entities if specified
        if (existingEntities) {
          allSuggestions = allSuggestions.filter(s => {
            const sourceKey = `${s.sourceType === 'character' ? 'char' : s.sourceType === 'location' ? 'loc' : 'thread'}-${s.sourceId}`
            const targetKey = `${s.targetType === 'character' ? 'char' : s.targetType === 'location' ? 'loc' : 'thread'}-${s.targetId}`
            return existingEntities.includes(sourceKey) && existingEntities.includes(targetKey)
          })
        }
        
        // When falling back, STILL apply prompt filtering if provided
        if (prompt?.trim()) {
          console.log('[AutoGenerate] Fallback with focus:', prompt)
          // Simple keyword-based filtering - keep suggestions where prompt keywords appear in names/roles/descriptions
          const keywords = prompt.toLowerCase().split(/\s+/).filter(k => k.length > 2)
          const filtered = allSuggestions.filter(s => {
            const text = `${s.sourceLabel} ${s.targetLabel} ${s.rationale}`.toLowerCase()
            return keywords.some(k => text.includes(k))
          })
          enriched = filtered.length > 0 ? filtered : allSuggestions.slice(0, 10)
          console.log('[AutoGenerate] Fallback filtered suggestions:', enriched.length)
        } else {
          enriched = allSuggestions
          console.log('[AutoGenerate] Fallback raw suggestions:', enriched.length)
        }
      }

      const seen = new Set()
      const deduped = enriched.filter(s => {
        const key = canonicalKey(s.sourceType, String(s.sourceId), s.targetType, String(s.targetId))
        if (seen.has(key) || existingKeys.has(key)) return false
        seen.add(key)
        return true
      })

      deduped.sort((a, b) => b.confidence - a.confidence)

      let filteredSuggestions = limitConnectionsPerEntity(
        deduped.filter(s => s.confidence >= confidenceThreshold),
        maxPerEntity,
        maxConnections
      )

      // LAST RESORT: when AI and embeddings both failed, generate basic connections from entity metadata
      if (filteredSuggestions.length === 0) {
        console.log('[AutoGenerate] Last-resort fallback: metadata-based connections')
        const fallback = generateMetadataConnections(characters, locations, plotThreads, existingKeys)
        filteredSuggestions = limitConnectionsPerEntity(fallback, maxPerEntity, maxConnections)
        if (filteredSuggestions.length > 0) {
          analysisError.value = 'Using metadata-based connections (AI and embeddings unavailable).'
        }
      }

      return filteredSuggestions

    } finally {
      isAnalyzing.value = false
    }
  }

  function generateGroupSuggestions(options = {}) {
    const { minGroupSize = 2 } = options

    const suggestions = []
    const characterClusters = findCharacterClusters(minGroupSize)
    const locationClusters = findLocationClusters(minGroupSize)

    for (const cluster of characterClusters) {
      if (cluster.members.length >= minGroupSize) {
        suggestions.push({
          type: 'character_group',
          name: generateGroupName(cluster, 'characters'),
          color: groupColors[suggestions.length % groupColors.length],
          members: cluster.members.map(m => ({ type: 'character', id: m.id })),
          confidence: cluster.confidence,
          rationale: `These ${cluster.members.length} characters frequently interact based on shared plot threads and relationships`
        })
      }
    }

    for (const cluster of locationClusters) {
      if (cluster.members.length >= minGroupSize) {
        suggestions.push({
          type: 'location_group',
          name: generateGroupName(cluster, 'locations'),
          color: groupColors[suggestions.length % groupColors.length],
          members: cluster.members.map(m => ({ type: 'location', id: m.id })),
          confidence: cluster.confidence,
          rationale: `These ${cluster.members.length} locations are thematically or narratively connected`
        })
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence)
  }

  function findCharacterClusters(minGroupSize = 2) {
    const characters = storyBibleStore.characters
    const plotThreads = storyBibleStore.plotThreads
    const edges = storyGraphStore.edges

    const adjacency = {}
    for (const char of characters) {
      adjacency[char.id] = new Set()
    }

    for (const edge of edges) {
      if (edge.sourceType === 'character' && edge.targetType === 'character') {
        adjacency[edge.sourceId]?.add(edge.targetId)
        adjacency[edge.targetId]?.add(edge.sourceId)
      }
    }

    for (const char of characters) {
      for (const thread of plotThreads) {
        if (isConnected('character', char.id, 'plotThread', thread.id)) {
          for (const char2 of characters) {
            if (char2.id !== char.id && isConnected('character', char2.id, 'plotThread', thread.id)) {
              adjacency[char.id].add(char2.id)
              adjacency[char2.id].add(char.id)
            }
          }
        }
      }
    }

    const visited = new Set()
    const clusters = []

    for (const char of characters) {
      if (visited.has(char.id)) continue

      const cluster = []
      const queue = [char.id]
      let totalWeight = 0

      while (queue.length > 0) {
        const currentId = queue.shift()
        if (visited.has(currentId)) continue

        visited.add(currentId)
        const currentChar = characters.find(c => c.id === currentId)
        if (currentChar) {
          cluster.push({ id: currentId, char: currentChar })
        }

        for (const neighborId of adjacency[currentId] || []) {
          if (!visited.has(neighborId)) {
            totalWeight++
            queue.push(neighborId)
          }
        }
      }

      if (cluster.length >= minGroupSize) {
        clusters.push({
          members: cluster,
          confidence: Math.min(0.5 + (totalWeight / (cluster.length * cluster.length)) * 0.5, 0.95)
        })
      }
    }

    return clusters
  }

  function findLocationClusters(_minGroupSize = 2) {
    const locations = storyBibleStore.locations
    const plotThreads = storyBibleStore.plotThreads || []
    const edges = storyGraphStore.edges

    const adjacency = {}
    for (const loc of locations) {
      adjacency[loc.id] = new Set()
    }

    for (const edge of edges) {
      if (edge.sourceType === 'location' && edge.targetType === 'location') {
        adjacency[edge.sourceId]?.add(edge.targetId)
        adjacency[edge.targetId]?.add(edge.sourceId)
      }
    }

    const characters = storyBibleStore.characters
    for (const char of characters) {
      for (const thread of plotThreads) {
        if (isConnected('character', char.id, 'plotThread', thread.id)) {
          for (const loc of locations) {
            if (isConnected('character', char.id, 'location', loc.id) &&
                isConnected('character', char.id, 'plotThread', thread.id)) {
              for (const loc2 of locations) {
                if (loc2.id !== loc.id && isConnected('character', char.id, 'location', loc2.id)) {
                  adjacency[loc.id].add(loc2.id)
                  adjacency[loc2.id].add(loc.id)
                }
              }
            }
          }
        }
      }
    }

    const visited = new Set()
    const clusters = []

    for (const loc of locations) {
      if (visited.has(loc.id)) continue

      const cluster = []
      const queue = [loc.id]

      while (queue.length > 0) {
        const currentId = queue.shift()
        if (visited.has(currentId)) continue

        visited.add(currentId)
        const currentLoc = locations.find(l => l.id === currentId)
        if (currentLoc) {
          cluster.push({ id: currentId, loc: currentLoc })
        }

        for (const neighborId of adjacency[currentId] || []) {
          if (!visited.has(neighborId)) {
            queue.push(neighborId)
          }
        }
      }

      if (cluster.length >= 2) {
        clusters.push({
          members: cluster,
          confidence: 0.6
        })
      }
    }

    return clusters
  }

  async function autoGenerateNetworkWithGroups(options = {}) {
    const {
      confidenceThreshold = 0.65,
      groupConfidenceThreshold = 0.5,
      maxConnections = 10,
      maxPerEntity = 3,
      prompt = '',
      existingEntities = null
    } = options

    const characters = existingEntities 
      ? storyBibleStore.characters.filter(c => existingEntities.includes(`char-${c.id}`))
      : storyBibleStore.characters
    const locations = existingEntities
      ? storyBibleStore.locations.filter(l => existingEntities.includes(`loc-${l.id}`))
      : storyBibleStore.locations
    const plotThreads = existingEntities
      ? storyBibleStore.plotThreads.filter(t => existingEntities.includes(`thread-${t.id}`))
      : storyBibleStore.plotThreads

    isAnalyzing.value = true
    analysisError.value = ''

    console.log('[AutoGenerateNetworkWithGroups] Focus prompt:', prompt ? prompt.slice(0, 50) + '...' : '(none)')

    try {
      await loadEmbeddings(!!existingEntities)

      let finalSuggestions = []
      
      // FIRST: Always try AI generation
      try {
        console.log('[AutoGenerateNetworkWithGroups] Attempting AI generation...')
        const charactersForPrompt = characters.map(c => ({
          id: c.id, name: c.name,
          role: c.role || '', goal: c.goal || '',
          backstory: (c.backstory || '').slice(0, 300),
          voice: (c.voice || '').slice(0, 100),
          notes: (c.notes || '').slice(0, 100)
        }))
        const locationsForPrompt = locations.map(l => ({
          id: l.id, name: l.name,
          description: (l.description || '').slice(0, 120)
        }))
        const plotThreadsForPrompt = plotThreads.map(t => ({
          id: t.id, title: t.title,
          description: (t.description || '').slice(0, 120),
          status: t.status
        }))

        const focusLine = prompt?.trim() ? `Focus: "${prompt}"\n\n` : ''
        const entityIds = [
          ...storyBibleStore.characters.map(c => ({ type: 'character', id: c.id })),
          ...storyBibleStore.locations.map(l => ({ type: 'location', id: l.id })),
          ...storyBibleStore.plotThreads.map(t => ({ type: 'plotThread', id: t.id }))
        ]
        const relationshipContext = await getRelationshipContext(entityIds, 2)
        const relationshipContextSection = relationshipContext
          ? `\nRelationship context:\n${relationshipContext}\n`
          : ''

        const systemPrompt = `You are a story structure analyst. Given story entities and context, suggest meaningful narrative connections. Return ONLY a valid JSON array. No markdown, no explanation.`
        const userPrompt = `${relationshipContextSection}
Characters: ${JSON.stringify(charactersForPrompt)}
Locations: ${JSON.stringify(locationsForPrompt)}
Plot threads: ${JSON.stringify(plotThreadsForPrompt)}

${focusLine}IMPORTANT: At least 2-3 connections must bridge between different entity types. Ensure variety across characters, locations, and plot threads. Never generate all connections between entities of the same type.

You MUST include cross-type connections: character→location (appears_in), character→plotThread (involved_in), location→plotThread (features). At least 50% of suggestions must be cross-type.

Suggest max 10 connections. Each:
{"sourceType": "character"|"location"|"plotThread", "sourceId": <id>, "targetType": "...", "targetId": <id>, "relationshipType": "ally"|"enemy"|"family"|"romantic"|"mentor"|"rival"|"involved_in"|"located_at"|"connects_to", "rationale": "<one sentence>", "confidence": <0.6-1.0>}`

        const response = await aiGenerate(userPrompt, systemPrompt, { feature: FEATURES.NETWORK })
        const cleaned = response.replace(/```json\s*/gi, '').replace(/```/g, '').trim()
        const match = cleaned.match(/\[[\s\S]*\]/)
        if (match) {
          const aiSuggestions = JSON.parse(match[0])
          console.log('[AutoGenerateNetworkWithGroups] AI returned:', aiSuggestions.length, 'suggestions')
          
          finalSuggestions = aiSuggestions.map(s => {
            const sourceEntity = getEntityById(s.sourceType, s.sourceId)
            const targetEntity = getEntityById(s.targetType, s.targetId)
            if (!sourceEntity || !targetEntity) return null
            
            return {
              sourceType: s.sourceType,
              sourceId: sourceEntity.id,
              sourceLabel: sourceEntity.name || sourceEntity.title,
              targetType: s.targetType,
              targetId: targetEntity.id,
              targetLabel: targetEntity.name || targetEntity.title,
              relationshipType: s.relationshipType || 'connects_to',
              rationale: s.rationale || '',
              confidence: s.confidence || 0.7
            }
          }).filter(Boolean)
        } else {
          console.log('[AutoGenerateNetworkWithGroups] AI returned no parseable suggestions')
        }
      } catch (aiError) {
        console.warn('[AutoGenerateNetworkWithGroups] AI failed:', aiError.message)
      }

      // SECOND: Fallback to embeddings if no AI results
      if (finalSuggestions.length === 0) {
        console.log('[AutoGenerateNetworkWithGroups] Falling back to embeddings')
        let allSuggestions = getAllSuggestions()

        // Filter to only canvas entities if specified
        if (existingEntities) {
          allSuggestions = allSuggestions.filter(s => {
            const sourceKey = `${s.sourceType === 'character' ? 'char' : s.sourceType === 'location' ? 'loc' : 'thread'}-${s.sourceId}`
            const targetKey = `${s.targetType === 'character' ? 'char' : s.targetType === 'location' ? 'loc' : 'thread'}-${s.targetId}`
            return existingEntities.includes(sourceKey) && existingEntities.includes(targetKey)
          })
        }
        
        // Lower threshold for group mode since AI couldn't guide
        const adjustedThreshold = Math.min(confidenceThreshold, 0.6)
        const filteredSuggestions = allSuggestions.filter(s => s.confidence >= adjustedThreshold)
        finalSuggestions = limitConnectionsPerEntity(filteredSuggestions, maxPerEntity, maxConnections)
        
        console.log('[AutoGenerateNetworkWithGroups] Embedding fallback suggestions:', finalSuggestions.length)
      }

      let limitedSuggestions = limitConnectionsPerEntity(finalSuggestions, maxPerEntity, maxConnections)
      console.log('[AutoGenerateNetworkWithGroups] Final connections:', limitedSuggestions.length)

      // LAST RESORT: metadata-based connections when AI and embeddings both failed
      if (limitedSuggestions.length === 0) {
        console.log('[AutoGenerateNetworkWithGroups] Last-resort fallback: metadata connections')
        const existingKeys = new Set(
          storyGraphStore.edges.map(e => canonicalKey(e.sourceType, String(e.sourceId), e.targetType, String(e.targetId)))
        )
        const fallback = generateMetadataConnections(characters, locations, plotThreads, existingKeys)
        limitedSuggestions = limitConnectionsPerEntity(fallback, maxPerEntity, maxConnections)
      }

      // Generate groups from connections
      const groupSuggestionList = generateGroupSuggestions({ confidenceThreshold: groupConfidenceThreshold })
      console.log('[AutoGenerateNetworkWithGroups] Generated groups:', groupSuggestionList.length)

      return {
        connections: limitedSuggestions,
        groups: groupSuggestionList
      }

    } catch (error) {
      console.error('Auto-generate with groups failed:', error)
      analysisError.value = 'Failed to generate connections. Please try again.'
      return { connections: [], groups: [] }
    } finally {
isAnalyzing.value = false
    }
  }

return {
    isAnalyzing,
    suggestions,
    analysisError,
    embeddingError,
    embeddingsLoaded,
    entityEmbeddings,
    loadEmbeddings,
    buildEntityText,
    getEntityEmbedding,
    calculateEmbeddingSimilarity,
    getAllSuggestions,

    generateNetworkWithAI,
    applySuggestion,
    autoGenerateWithAI,
    generateGroupSuggestions,
    autoGenerateNetworkWithGroups
  }
}
