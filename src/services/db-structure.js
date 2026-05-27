import { db } from './db-core'
import { countWords } from '../utils/textUtils'
import { getEmbedding } from './ollamaService'

// ========== CHAPTERS (OLD - kept for backward compatibility) ==========

export async function getChapters(projectId) {
  return db.chapters.where('projectId').equals(projectId).toArray()
}

export async function addChapter(projectId, data) {
  return db.chapters.add({ projectId, ...data })
}

export async function updateChapter(id, data) {
  return db.chapters.update(id, data)
}

export async function deleteChapter(id) {
  return db.chapters.delete(id)
}

// ========== SECTIONS (NEW - replaces Chapters) ==========

export async function getSections(projectId) {
  return db.sections.where('projectId').equals(projectId).toArray()
}

export async function addSection(projectId, data) {
  return db.sections.add({ projectId, ...data })
}

export async function updateSection(id, data) {
  return db.sections.update(id, data)
}

export async function deleteSection(id) {
  return db.sections.delete(id)
}

export async function reorderSections(sectionIds) {
  await db.transaction('rw', db.sections, async () => {
    for (let i = 0; i < sectionIds.length; i++) {
      await db.sections.update(sectionIds[i], { order: i })
    }
  })
}

// ========== SCENES (OLD - kept for backward compatibility) ==========

export async function getScenes(projectId, chapterId = null) {
  if (chapterId) {
    return db.scenes.where({ projectId, chapterId }).sortBy('order')
  }
  return db.scenes.where('projectId').equals(projectId).toArray()
}

export async function addScene(projectId, data) {
  const result = await db.scenes.add({ projectId, ...data })
  if (data.content) {
    getEmbedding('scene', result, data.content).catch((err) => {
      console.error('Failed to generate embedding for new scene:', result, err)
    })
  }
  return result
}

export async function updateScene(id, data) {
  await db.scenes.update(id, data)
  if (data.content) {
    getEmbedding('scene', id, data.content).catch((err) => {
      console.error('Failed to generate embedding for scene update:', id, err)
    })
  }
}

export async function deleteScene(id) {
  return db.scenes.delete(id)
}

export async function reorderScenes(sceneIds) {
  await db.transaction('rw', db.scenes, async () => {
    for (let i = 0; i < sceneIds.length; i++) {
      await db.scenes.update(sceneIds[i], { order: i })
    }
  })
}

export async function getChapterWordCounts(projectId) {
  const chapters = await getChapters(projectId)
  const scenes = await getScenes(projectId)
  
  const chapterCounts = {}
  let totalWords = 0
    
  for (const chapter of chapters) {
    const chapterScenes = scenes.filter(s => s.chapterId === chapter.id)
    let wordCount = 0
      
    for (const scene of chapterScenes) {
      if (scene.content) {
        wordCount += countWords(scene.content)
      }
    }
      
    chapterCounts[chapter.id] = {
      chapterId: chapter.id,
      title: chapter.title,
      status: chapter.status,
      summary: chapter.summary,
      wordCount
    }
    totalWords += wordCount
  }
    
  return { chapterCounts, totalWords }
}

// ========== SUBSECTIONS (NEW - replaces Scenes) ==========

export async function getSubsections(projectId, sectionId = null) {
  if (sectionId) {
    return db.subsections.where({ projectId, sectionId }).sortBy('order')
  }
  return db.subsections.where('projectId').equals(projectId).toArray()
}

export async function addSubsection(projectId, data) {
  const result = await db.subsections.add({ projectId, ...data })
  if (data.content) {
    getEmbedding('subsection', result, data.content).catch((err) => {
      console.error('Failed to generate embedding for new subsection:', result, err)
    })
  }
  return result
}

export async function updateSubsection(id, data) {
  await db.subsections.update(id, data)
  if (data.content) {
    getEmbedding('subsection', id, data.content).catch((err) => {
      console.error('Failed to generate embedding for subsection update:', id, err)
    })
  }
}

export async function deleteSubsection(id) {
  return db.subsections.delete(id)
}

export async function reorderSubsections(subsectionIds) {
  await db.transaction('rw', db.subsections, async () => {
    for (let i = 0; i < subsectionIds.length; i++) {
      await db.subsections.update(subsectionIds[i], { order: i })
    }
  })
}

export async function getSectionWordCounts(projectId) {
  const sections = await getSections(projectId)
  const subsections = await getSubsections(projectId)
  
  const sectionCounts = {}
  let totalWords = 0
    
  for (const section of sections) {
    const sectionSubsections = subsections.filter(s => s.sectionId === section.id)
    let wordCount = 0
      
    for (const subsection of sectionSubsections) {
      if (subsection.content) {
        wordCount += countWords(subsection.content)
      }
    }
      
    sectionCounts[section.id] = {
      sectionId: section.id,
      title: section.title,
      status: section.status,
      summary: section.summary,
      wordCount
    }
    totalWords += wordCount
  }
    
  return { sectionCounts, totalWords }
}

// ========== VOLUMES ==========

export async function getVolumes(projectId) {
  return db.volumes.where('projectId').equals(projectId).toArray()
}

export async function addVolume(projectId, data) {
  return db.volumes.add({ 
    projectId, 
    title: data.title || 'Untitled Volume',
    description: data.description || '',
    color: data.color || '#6366f1',
    chapterIds: [],
    ...data 
  })
}

export async function updateVolume(id, data) {
  return db.volumes.update(id, data)
}

export async function deleteVolume(id) {
  return db.volumes.delete(id)
}

export async function assignChapterToVolume(chapterId, volumeId) {
  const chapters = await db.chapters.where('id').equals(chapterId).toArray()
  if (chapters.length === 0) return
  await db.chapters.update(chapterId, { volumeId })
}

export async function removeChapterFromVolume(chapterId) {
  const chapters = await db.chapters.where('id').equals(chapterId).toArray()
  if (chapters.length === 0) return
  await db.chapters.update(chapterId, { volumeId: null })
}
