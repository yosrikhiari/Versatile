import { useManuscriptStore } from '../stores/manuscriptStore'
import { ollamaEmbeddings, getEmbedding, getEmbeddingCache, setEmbeddingCache, cosineSimilarity } from '../services/ollamaService'
import { getEmbedding as getEmbeddingFromConfig, getEmbeddings } from '../services/embeddingService'
import { computeSemanticChunks } from './useSemanticChunking'
import { getScenes } from '../services/dbService'
import { useSettingsStore } from '../stores/settingsStore'
import { EMBEDDING_DEFAULTS } from '../config/ai'

const MAX_CONTEXT_CHARS = 3500

export async function warmEmbeddingCache(projectId) {
  try {
    const allScenes = await getScenes(projectId)
    const cache = getEmbeddingCache()
    let warmed = 0

    for (const scene of allScenes) {
      if (!scene.content) continue
      const key = `scene_${scene.id}`
      if (!cache[key] || cache[key].text !== scene.content) {
        getEmbedding('scene', scene.id, scene.content).catch(() => {})
        warmed++
      }
    }

    if (warmed > 0) {
      console.log(`[useManuscriptContext] Warmed ${warmed} scene embeddings`)
    }
  } catch (error) {
    console.warn('[useManuscriptContext] Cache warm-up failed:', error.message)
  }
}

const GENERATOR_TYPE_QUERIES = {
  character: 'character names, dialogue, relationships',
  location: 'settings, descriptions, environment',
  plotThread: 'conflicts, tensions, goals',
  spark: 'story tensions, unresolved threads',
  blueprint: 'scene structure, beats, pacing'
}

export function useManuscriptContext() {
  const manuscriptStore = useManuscriptStore()
  const settingsStore = useSettingsStore()

  function parseSelector(selector) {
    if (selector === 'current') {
      return { type: 'current' }
    }
    
    if (selector === 'all') {
      return { type: 'all' }
    }
    
    if (selector.startsWith('last:')) {
      const count = parseInt(selector.split(':')[1], 10)
      return { type: 'last', count }
    }
    
    if (selector.startsWith('first:')) {
      const count = parseInt(selector.split(':')[1], 10)
      return { type: 'first', count }
    }
    
    if (selector.startsWith('chapter:')) {
      const chapterNum = parseInt(selector.split(':')[1], 10)
      return { type: 'chapter', chapterNum }
    }
    
    if (selector.startsWith('chapters:')) {
      const nums = selector.split(':')[1].split(',').map(n => parseInt(n.trim(), 10))
      return { type: 'chapters', chapterNums: nums }
    }
    
    return null
  }

  function resolveSectionIds(parsed, sortedSections) {
    const sections = [...sortedSections].sort((a, b) => (a.order || 0) - (b.order || 0))
    
    switch (parsed.type) {
      case 'current': {
        const activeId = manuscriptStore.activeSectionId
        if (activeId) {
          const section = sections.find(s => s.id === activeId)
          return section ? [section] : []
        }
        return sections.length > 0 ? [sections[sections.length - 1]] : []
      }
      
      case 'all':
        return sections
      
      case 'last':
        return sections.slice(-parsed.count)
      
      case 'first':
        return sections.slice(0, parsed.count)
      
      case 'section': {
        const section = sections.find(s => s.order === parsed.sectionNum - 1 || s.id === parsed.sectionNum)
        return section ? [section] : []
      }
      
      case 'sections':
        return sections.filter(s => 
          parsed.sectionNums.includes(s.order + 1) || parsed.sectionNums.includes(s.id)
        )
      
      default:
        return []
    }
  }

  function getSubsectionContentForSection(sectionId) {
    const subsections = manuscriptStore.subsectionsBySection
      .filter(s => s.sectionId === sectionId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
    
    return subsections.map(s => s.content || '').join('\n\n')
  }

  function getFullText(sections) {
    const parts = []
    for (const section of sections) {
      const sectionContent = getSubsectionContentForSection(section.id).trim()
      if (!sectionContent) continue
      parts.push(`[Section ${(section.order || 0) + 1}: ${section.title || 'Untitled'}]`)
      parts.push(sectionContent)
    }
    return parts.join('\n\n')
  }

  async function buildContextText(sections, maxChars) {
    const fullText = getFullText(sections)
    if (!fullText.trim()) {
      return { contextText: '', totalChars: 0, truncated: false }
    }

    const embeddingProvider = settingsStore.embeddingProvider || EMBEDDING_DEFAULTS.provider
    const embeddingModel = settingsStore.embeddingModel || EMBEDDING_DEFAULTS.model
    const threshold = settingsStore.embeddingThreshold ?? EMBEDDING_DEFAULTS.threshold

    try {
      const chunks = await computeSemanticChunks(fullText, {
        maxChunkSize: maxChars,
        embeddingProvider,
        embeddingModel,
        threshold
      })

      const parts = []
      let totalChars = 0
      let truncated = false

      for (const chunk of chunks) {
        if (!chunk.text.trim()) continue
        const chunkChars = chunk.text.length + 2
        if (totalChars + chunkChars > maxChars && totalChars > 0) {
          const remaining = maxChars - totalChars
          if (remaining > 50) {
            parts.push(chunk.text.slice(0, remaining))
            totalChars += remaining
          }
          truncated = true
          break
        }
        parts.push(chunk.text)
        parts.push('')
        totalChars += chunkChars
      }

      return {
        contextText: parts.join('\n'),
        totalChars,
        truncated
      }
    } catch (error) {
      console.warn('[useManuscriptContext] Semantic chunking failed, falling back to truncation:', error.message)
      return truncateFallback(sections, maxChars)
    }
  }

  function truncateFallback(sections, maxChars) {
    const parts = []
    let totalChars = 0
    let truncated = false

    for (const section of sections) {
      const sectionContent = getSubsectionContentForSection(section.id).trim()
      if (!sectionContent) continue
      const sectionHeader = `[Section ${(section.order || 0) + 1}: ${section.title || 'Untitled'}]\n`
      const sectionChars = sectionHeader.length + sectionContent.length + 2

      if (totalChars + sectionChars > maxChars && totalChars > 0) {
        truncated = true
        const remainingChars = maxChars - totalChars
        if (remainingChars > 50) {
          parts.push(sectionHeader)
          parts.push(sectionContent.slice(0, remainingChars - sectionHeader.length))
        }
        totalChars += sectionChars
        break
      }

      parts.push(sectionHeader)
      parts.push(sectionContent)
      parts.push('')
      totalChars += sectionChars
    }

    return { contextText: parts.join('\n'), totalChars, truncated }
  }

  function getAllSubsectionEmbeddings() {
    const cache = getEmbeddingCache()
    const subsectionEmbeddings = []
    for (const [key, value] of Object.entries(cache)) {
      if (key.startsWith('subsection_') && value.embedding && value.text) {
        const subsectionId = parseInt(key.replace('subsection_', ''), 10)
        subsectionEmbeddings.push({
          subsectionId,
          embedding: value.embedding,
          text: value.text
        })
      }
    }
    return subsectionEmbeddings
  }

  function getSubsectionById(subsectionId) {
    return manuscriptStore.subsections.find(s => s.id === subsectionId)
  }

  function getSectionOrder(sectionId) {
    const section = manuscriptStore.sortedSections.find(s => s.id === sectionId)
    return section?.order ?? 0
  }

  async function retrieveRelevantChunks(generatorType, maxChars) {
    try {
      const queryText = GENERATOR_TYPE_QUERIES[generatorType] || GENERATOR_TYPE_QUERIES.spark
      const queryEmbedding = await ollamaEmbeddings(queryText)
      if (!queryEmbedding) return null

      const embeddingProvider = settingsStore.embeddingProvider || EMBEDDING_DEFAULTS.provider
      const embeddingModel = settingsStore.embeddingModel || EMBEDDING_DEFAULTS.model
      const threshold = settingsStore.embeddingThreshold ?? EMBEDDING_DEFAULTS.threshold

      const sortedSections = manuscriptStore.sortedSections
      const fullText = getFullText(sortedSections)
      if (!fullText.trim()) return null

      const chunks = await computeSemanticChunks(fullText, {
        maxChunkSize: maxChars,
        embeddingProvider,
        embeddingModel,
        threshold
      })

      const chunkTexts = chunks.map(c => c.text).filter(Boolean)
      if (chunkTexts.length === 0) return null

      const chunkEmbeddings = await getEmbeddings(chunkTexts, {
        provider: embeddingProvider,
        model: embeddingModel
      })

      const scored = chunks.map((chunk, i) => {
        const emb = chunkEmbeddings[i]
        if (!emb || !chunk.text.trim()) return null
        const similarity = cosineSimilarity(queryEmbedding, emb)
        return {
          text: chunk.text,
          score: similarity,
          sentences: chunk.sentences
        }
      }).filter(Boolean)

      scored.sort((a, b) => b.score - a.score)

      const selected = []
      let totalChars = 0
      const sectionTitles = new Set()

      for (const item of scored) {
        const chars = item.text.length + 2
        if (totalChars + chars > maxChars && totalChars > 0) break
        selected.push(item.text)
        totalChars += chars
      }

      if (selected.length === 0) return null

      return {
        contextText: selected.join('\n\n'),
        sectionTitles: [],
        totalChars,
        truncated: false
      }
    } catch (error) {
      console.warn('[useManuscriptContext] Retrieval failed:', error.message)
      return null
    }
  }

  async function getSectionContext(selector = 'current', generatorType = 'spark') {
    const sortedSections = manuscriptStore.sortedSections
    
    if (sortedSections.length === 0) {
      return {
        contextText: '',
        sectionTitles: [],
        truncated: false,
        totalChars: 0
      }
    }
    
    const parsed = parseSelector(selector)
    
    if (!parsed) {
      return {
        contextText: '',
        sectionTitles: [],
        truncated: false,
        totalChars: 0
      }
    }
    
    const selectedSections = resolveSectionIds(parsed, sortedSections)
    
    if (selectedSections.length === 0) {
      return {
        contextText: '',
        sectionTitles: [],
        truncated: false,
        totalChars: 0
      }
    }
    
    const sectionTitles = selectedSections.map(s => s.title || `Section ${(s.order || 0) + 1}`)
    
    const embeddingResult = await retrieveRelevantChunks(generatorType, MAX_CONTEXT_CHARS)
    
    if (embeddingResult) {
      return {
        contextText: embeddingResult.contextText,
        sectionTitles: embeddingResult.sectionTitles,
        truncated: embeddingResult.truncated,
        totalChars: embeddingResult.totalChars
      }
    }
    
    const { contextText, totalChars, truncated } = await buildContextText(selectedSections, MAX_CONTEXT_CHARS)
    
    return {
      contextText,
      sectionTitles,
      truncated,
      totalChars
    }
  }

  function getSectionCount() {
    return manuscriptStore.sortedSections.length
  }

  function getSectionList() {
    return manuscriptStore.sortedSections.map((s, i) => ({
      id: s.id,
      order: i + 1,
      title: s.title || `Section ${i + 1}`
    }))
  }

  return {
    getSectionContext,
    getSectionCount,
    getSectionList,
    MAX_CONTEXT_CHARS
  }
}
