import { useManuscriptStore } from '../stores/manuscriptStore'
import { ollamaEmbeddings, getEmbedding, getEmbeddingCache, setEmbeddingCache, cosineSimilarity } from '../services/ollamaService'
import { getScenes } from '../services/dbService'

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

  function buildContextText(sections, maxChars) {
    const parts = []
    let totalChars = 0
    let truncated = false
    
    for (const section of sections) {
      const sectionContent = getSubsectionContentForSection(section.id)
      const sectionText = sectionContent.trim()
      
      if (!sectionText) continue
      
      const sectionHeader = `[Section ${(section.order || 0) + 1}: ${section.title || 'Untitled'}]\n`
      const sectionChars = sectionHeader.length + sectionText.length + 2
      
      if (totalChars + sectionChars > maxChars && totalChars > 0) {
        truncated = true
        const remainingChars = maxChars - totalChars
        if (remainingChars > 50) {
          parts.push(sectionHeader)
          parts.push(sectionText.slice(0, remainingChars - sectionHeader.length))
        }
        totalChars += sectionChars
        break
      }
      
      parts.push(sectionHeader)
      parts.push(sectionText)
      parts.push('')
      totalChars += sectionChars
    }
    
    return {
      contextText: parts.join('\n'),
      totalChars,
      truncated
    }
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
      if (!queryEmbedding) {
        return null
      }

      const subsectionEmbeddings = getAllSubsectionEmbeddings()
      if (subsectionEmbeddings.length === 0) {
        return null
      }

      const scoredSubsections = subsectionEmbeddings.map(subsection => {
        const subsectionData = getSubsectionById(subsection.subsectionId)
        if (!subsectionData || !subsectionData.content) {
          return null
        }
        const similarity = cosineSimilarity(queryEmbedding, subsection.embedding)
        const sectionOrder = getSectionOrder(subsectionData.sectionId)
        const recencyMultiplier = 1 + (sectionOrder / maxSectionOrder) * 0.5
        const finalScore = similarity * recencyMultiplier
        return {
          subsectionId: subsection.subsectionId,
          sectionId: subsectionData.sectionId,
          content: subsectionData.content,
          score: finalScore,
          sectionOrder
        }
      }).filter(Boolean)

      scoredSubsections.sort((a, b) => b.score - a.score)

      const chunks = []
      let totalChars = 0
      for (const subsection of scoredSubsections) {
        const subsectionText = subsection.content.trim()
        if (!subsectionText) continue

        const section = manuscriptStore.sortedSections.find(s => s.id === subsection.sectionId)
        const header = `[Section ${(section?.order || 0) + 1}: ${section?.title || 'Untitled'}]\n`
        const subsectionHeader = `[Subsection ${subsection.subsectionId}]\n`
        const chunkChars = header.length + subsectionHeader.length + subsectionText.length + 2

        if (totalChars + chunkChars > maxChars && totalChars > 0) {
          break
        }

        chunks.push({ subsection, header, subsectionHeader, text: subsectionText, chars: chunkChars })
        totalChars += chunkChars
      }

      if (chunks.length === 0) {
        return null
      }

      const contextText = chunks.map(c => 
        c.header + c.subsectionHeader + c.text
      ).join('\n\n')

      const sectionTitles = [...new Set(chunks.map(c => {
        const section = manuscriptStore.sortedSections.find(s => s.id === c.subsection.sectionId)
        return section?.title || `Section ${(section?.order || 0) + 1}`
      }))]

      return {
        contextText,
        sectionTitles,
        totalChars,
        truncated: false
      }
    } catch (error) {
      console.warn('[useManuscriptContext] Embedding retrieval failed, falling back to truncation:', error.message)
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
    
    const { contextText, totalChars, truncated } = buildContextText(selectedSections, MAX_CONTEXT_CHARS)
    
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
