import { useManuscriptStore } from '../stores/manuscriptStore'
import { ollamaEmbeddings, getEmbeddingCache, setEmbeddingCache, cosineSimilarity } from '../services/ollamaService'
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
        const { getEmbedding } = await import('../services/ollamaService')
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

  function resolveChapterIds(parsed, sortedChapters) {
    const chapters = [...sortedChapters].sort((a, b) => (a.order || 0) - (b.order || 0))
    
    switch (parsed.type) {
      case 'current': {
        const activeId = manuscriptStore.activeChapterId
        if (activeId) {
          const chapter = chapters.find(c => c.id === activeId)
          return chapter ? [chapter] : []
        }
        return chapters.length > 0 ? [chapters[chapters.length - 1]] : []
      }
      
      case 'all':
        return chapters
      
      case 'last':
        return chapters.slice(-parsed.count)
      
      case 'first':
        return chapters.slice(0, parsed.count)
      
      case 'chapter': {
        const chapter = chapters.find(c => c.order === parsed.chapterNum - 1 || c.id === parsed.chapterNum)
        return chapter ? [chapter] : []
      }
      
      case 'chapters':
        return chapters.filter(c => 
          parsed.chapterNums.includes(c.order + 1) || parsed.chapterNums.includes(c.id)
        )
      
      default:
        return []
    }
  }

  function getSceneContentForChapter(chapterId) {
    const scenes = manuscriptStore.scenes
      .filter(s => s.chapterId === chapterId)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
    
    return scenes.map(s => s.content || '').join('\n\n')
  }

  function buildContextText(chapters, maxChars) {
    const parts = []
    let totalChars = 0
    let truncated = false
    
    for (const chapter of chapters) {
      const chapterContent = getSceneContentForChapter(chapter.id)
      const chapterText = chapterContent.trim()
      
      if (!chapterText) continue
      
      const chapterHeader = `[Chapter ${(chapter.order || 0) + 1}: ${chapter.title || 'Untitled'}]\n`
      const chapterChars = chapterHeader.length + chapterText.length + 2
      
      if (totalChars + chapterChars > maxChars && totalChars > 0) {
        truncated = true
        const remainingChars = maxChars - totalChars
        if (remainingChars > 50) {
          parts.push(chapterHeader)
          parts.push(chapterText.slice(0, remainingChars - chapterHeader.length))
        }
        totalChars += chapterChars
        break
      }
      
      parts.push(chapterHeader)
      parts.push(chapterText)
      parts.push('')
      totalChars += chapterChars
    }
    
    return {
      contextText: parts.join('\n'),
      totalChars,
      truncated
    }
  }

  function getAllSceneEmbeddings() {
    const cache = getEmbeddingCache()
    const sceneEmbeddings = []
    for (const [key, value] of Object.entries(cache)) {
      if (key.startsWith('scene_') && value.embedding && value.text) {
        const sceneId = parseInt(key.replace('scene_', ''), 10)
        sceneEmbeddings.push({
          sceneId,
          embedding: value.embedding,
          text: value.text
        })
      }
    }
    return sceneEmbeddings
  }

  function getSceneById(sceneId) {
    return manuscriptStore.scenes.find(s => s.id === sceneId)
  }

  function getChapterOrder(chapterId) {
    const chapter = manuscriptStore.sortedChapters.find(c => c.id === chapterId)
    return chapter?.order ?? 0
  }

  async function retrieveRelevantChunks(generatorType, maxChars) {
    try {
      const queryText = GENERATOR_TYPE_QUERIES[generatorType] || GENERATOR_TYPE_QUERIES.spark
      const queryEmbedding = await ollamaEmbeddings(queryText)
      if (!queryEmbedding) {
        return null
      }

      const sceneEmbeddings = getAllSceneEmbeddings()
      if (sceneEmbeddings.length === 0) {
        return null
      }

      const sortedChapters = [...manuscriptStore.sortedChapters].sort((a, b) => (a.order || 0) - (b.order || 0))
      const maxChapterOrder = sortedChapters.length > 0 ? Math.max(...sortedChapters.map(c => c.order || 0)) : 1

      const scoredScenes = sceneEmbeddings.map(scene => {
        const sceneData = getSceneById(scene.sceneId)
        if (!sceneData || !sceneData.content) {
          return null
        }
        const similarity = cosineSimilarity(queryEmbedding, scene.embedding)
        const chapterOrder = getChapterOrder(sceneData.chapterId)
        const recencyMultiplier = 1 + (chapterOrder / maxChapterOrder) * 0.5
        const finalScore = similarity * recencyMultiplier
        return {
          sceneId: scene.sceneId,
          chapterId: sceneData.chapterId,
          content: sceneData.content,
          score: finalScore,
          chapterOrder
        }
      }).filter(Boolean)

      scoredScenes.sort((a, b) => b.score - a.score)

      const chunks = []
      let totalChars = 0
      for (const scene of scoredScenes) {
        const sceneText = scene.content.trim()
        if (!sceneText) continue

        const chapter = manuscriptStore.sortedChapters.find(c => c.id === scene.chapterId)
        const header = `[Chapter ${(chapter?.order || 0) + 1}: ${chapter?.title || 'Untitled'}]\n`
        const sceneHeader = `[Scene ${scene.sceneId}]\n`
        const chunkChars = header.length + sceneHeader.length + sceneText.length + 2

        if (totalChars + chunkChars > maxChars && totalChars > 0) {
          break
        }

        chunks.push({ scene, header, sceneHeader, text: sceneText, chars: chunkChars })
        totalChars += chunkChars
      }

      if (chunks.length === 0) {
        return null
      }

      const contextText = chunks.map(c => 
        c.header + c.sceneHeader + c.text
      ).join('\n\n')

      const chapterTitles = [...new Set(chunks.map(c => {
        const chapter = manuscriptStore.sortedChapters.find(ch => ch.id === c.scene.chapterId)
        return chapter?.title || `Chapter ${(chapter?.order || 0) + 1}`
      }))]

      return {
        contextText,
        chapterTitles,
        totalChars,
        truncated: false
      }
    } catch (error) {
      console.warn('[useManuscriptContext] Embedding retrieval failed, falling back to truncation:', error.message)
      return null
    }
  }

  async function getChapterContext(selector = 'current', generatorType = 'spark') {
    const sortedChapters = manuscriptStore.sortedChapters
    
    if (sortedChapters.length === 0) {
      return {
        contextText: '',
        chapterTitles: [],
        truncated: false,
        totalChars: 0
      }
    }
    
    const parsed = parseSelector(selector)
    
    if (!parsed) {
      return {
        contextText: '',
        chapterTitles: [],
        truncated: false,
        totalChars: 0
      }
    }
    
    const selectedChapters = resolveChapterIds(parsed, sortedChapters)
    
    if (selectedChapters.length === 0) {
      return {
        contextText: '',
        chapterTitles: [],
        truncated: false,
        totalChars: 0
      }
    }
    
    const chapterTitles = selectedChapters.map(c => c.title || `Chapter ${(c.order || 0) + 1}`)
    
    const embeddingResult = await retrieveRelevantChunks(generatorType, MAX_CONTEXT_CHARS)
    
    if (embeddingResult) {
      return {
        contextText: embeddingResult.contextText,
        chapterTitles: embeddingResult.chapterTitles,
        truncated: embeddingResult.truncated,
        totalChars: embeddingResult.totalChars
      }
    }

    const { contextText, totalChars, truncated } = buildContextText(selectedChapters, MAX_CONTEXT_CHARS)
    
    return {
      contextText,
      chapterTitles,
      truncated,
      totalChars
    }
  }

  function getChapterCount() {
    return manuscriptStore.sortedChapters.length
  }

  function getChapterList() {
    return manuscriptStore.sortedChapters.map((c, i) => ({
      id: c.id,
      order: i + 1,
      title: c.title || `Chapter ${i + 1}`
    }))
  }

  return {
    getChapterContext,
    getChapterCount,
    getChapterList,
    MAX_CONTEXT_CHARS
  }
}
