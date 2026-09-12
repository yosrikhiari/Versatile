/**
 * What a committed scene hands the digest layer.
 *
 * Pure mapping: writer metadata preferred, plan fields as fallback, never
 * undefined. Centralized because every commit site must hand over the same
 * shape — an unnamed field here repeats the pov/threadIds transit-drop
 * class, and a missing digest here is what starved the earlier-chapters
 * context on every run that never triggered backfill.
 */

export interface SceneAnalysisInput {
  projectId: any
  subsectionId: any
  prose: string
  structured: any
  scene: {
    sceneNumber: number | null
    chapterNumber: number | null
    title: string
    charactersPresent?: string[]
    location?: string
  }
}

export function buildSceneAnalysisInput({
  projectId,
  subsectionId,
  chapterNumber,
  prose,
  structured,
  scene
}: {
  projectId: any
  subsectionId: any
  chapterNumber?: number | null
  prose?: string
  structured?: any
  scene?: any
}): SceneAnalysisInput {
  const s = scene || {}
  return {
    projectId,
    subsectionId,
    prose: String(prose ?? ''),
    structured: structured || {},
    scene: {
      sceneNumber: typeof s.sceneNumber === 'number' ? s.sceneNumber : null,
      chapterNumber: typeof chapterNumber === 'number' ? chapterNumber : null,
      title: String(s.title || ''),
      charactersPresent: Array.isArray(s.charactersPresent)
        ? s.charactersPresent
        : Array.isArray(s.characters)
          ? s.characters
          : [],
      location: String(s.location || '')
    }
  }
}
