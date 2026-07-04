import { useProjectStore } from '../stores/projectStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { countWords } from '../utils/textUtils'

export function useStateSummarizer() {
  const projectStore = useProjectStore()
  const manuscriptStore = useManuscriptStore()
  const storyBibleStore = useStoryBibleStore()

  function summarize() {
    const projectId = projectStore.currentProjectId
    if (!projectId) return null

    const sortedSections = manuscriptStore.sortedSections
    const activeSection = manuscriptStore.activeSection
    const activeSubsection = manuscriptStore.activeSubsection

    const allSubsections = manuscriptStore.subsections || []
    const totalWordCount = allSubsections.reduce((sum, s) => sum + countWords(s.content || ''), 0)

    const newCharacters = []
    const updatedThreads = []
    const unresolvedThreads = []

    const threads = storyBibleStore.plotThreads || []
    for (const t of threads) {
      if (t.status === 'open') {
        unresolvedThreads.push(t.title)
      } else {
        updatedThreads.push(`${t.title} → status: ${t.status}`)
      }
    }

    const snapshot = {
      timestamp: new Date().toISOString(),
      projectId,
      wordCount: totalWordCount,
      projectName: projectStore.currentProjectName,
      activeSection: activeSection ? `${activeSection.title}` : null,
      activeSubsection: activeSubsection ? `${activeSubsection.title}` : null,
      sectionCount: sortedSections.length,
      characterCount: (storyBibleStore.characters || []).length,
      locationCount: (storyBibleStore.locations || []).length,
      threadCount: threads.length,
      newCharacters,
      updatedThreads,
      unresolvedThreads: unresolvedThreads.slice(0, 10),
      keyDecisions: [],
      toneNotes: projectStore.currentCategory || '',
      wordCountDelta: Math.max(0, totalWordCount - (projectStore.initialWordCount || 0))
    }

    return snapshot
  }

  function snapshotToContextString(snapshot) {
    if (!snapshot) return ''
    const parts = []
    if (snapshot.projectName) parts.push(`Project: ${snapshot.projectName}`)
    if (snapshot.wordCount !== undefined) parts.push(`Total words: ${snapshot.wordCount}`)
    if (snapshot.activeSection) parts.push(`Current section: ${snapshot.activeSection}`)
    if (snapshot.sectionCount !== undefined) parts.push(`Total sections: ${snapshot.sectionCount}`)
    if (snapshot.characterCount !== undefined) parts.push(`Characters: ${snapshot.characterCount}`)
    if (snapshot.locationCount !== undefined) parts.push(`Locations: ${snapshot.locationCount}`)
    if (snapshot.unresolvedThreads?.length > 0) {
      parts.push(`Unresolved plot threads: ${snapshot.unresolvedThreads.slice(0, 5).join(', ')}`)
    }
    if (snapshot.toneNotes) parts.push(`Tone/genre: ${snapshot.toneNotes}`)
    return parts.length > 0 ? `[Story State]\n${parts.join('\n')}` : ''
  }

  function snapshotToRecap(snapshot) {
    if (!snapshot) return ''
    const parts = []
    if (snapshot.wordCountDelta > 0) parts.push(`+${snapshot.wordCountDelta} words`)
    if (snapshot.newCharacters?.length > 0) {
      parts.push(`${snapshot.newCharacters.length} new character(s)`)
    }
    const resolved = snapshot.updatedThreads?.filter((t) => t.includes('resolved')).length || 0
    if (resolved > 0) parts.push(`${resolved} thread(s) resolved`)
    const open = snapshot.unresolvedThreads?.length || 0
    if (open > 0) parts.push(`${open} unresolved thread(s)`)
    if (snapshot.activeSection) parts.push(`at "${snapshot.activeSection}"`)
    return parts.length > 0 ? `Last session: ${parts.join(', ')}.` : ''
  }

  return {
    summarize,
    snapshotToContextString,
    snapshotToRecap
  }
}
