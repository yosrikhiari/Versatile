import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useManuscriptStore } from '../stores/manuscriptStore'
import { useNotifications } from '../composables/useNotifications'
import { parseHtmlToParagraphs } from '../utils/dialogueParser'
import { detectDialogue } from '../utils/dialogueDetector'
import { identifySpeakers } from '../utils/speakerIdentifier'
import {
  getDialogueByProject,
  getDialogueBySpeaker,
  saveDialogueBatch,
  deleteDialogueByProject,
  reindexSection
} from '../services/db-dialogue'

export function useDialogueIndexer() {
  const projectStore = useProjectStore()
  const storyBibleStore = useStoryBibleStore()
  const manuscriptStore = useManuscriptStore()
  const { addToast } = useNotifications()

  const indexing = ref(false)
  const progress = ref({ current: 0, total: 0 })
  const lastResult = ref(null)

  function buildCharacterMap() {
    const map = {}
    for (const char of storyBibleStore.characters) {
      map[char.name.toLowerCase()] = {
        id: char.id,
        name: char.name,
        color: char.color || '#6366f1',
        aliases: (char.aliases || []).map(a => a.toLowerCase())
      }
    }
    return map
  }

  async function indexSubsection(subsection) {
    const html = subsection.content || ''
    if (!html.trim()) return []

    const paragraphs = parseHtmlToParagraphs(html)
    const results = []

    for (const para of paragraphs) {
      const dialogueLines = detectDialogue(para.textContent)
      if (dialogueLines.length === 0) continue

      const speakerMap = buildCharacterMap()
      const identified = identifySpeakers(dialogueLines, speakerMap, paragraphs, paragraphs.indexOf(para))

      for (const line of identified) {
        results.push({
          projectId: subsection.projectId,
          sectionId: subsection.sectionId || null,
          subsectionId: subsection.id,
          paragraphIndex: para.paragraphIndex,
          textContent: line.text,
          speakerId: line.speakerId || null,
          speakerName: line.speakerName || null,
          confidence: line.confidence || 0,
          needsReview: line.needsReview !== false,
          dialogueType: line.dialogueType || 'quoted',
          tagType: line.tagType || null,
          contextBefore: line.contextBefore || null,
          indexedAt: new Date().toISOString()
        })
      }
    }

    if (results.length > 0) {
      await saveDialogueBatch(results)
    }

    return results
  }

  async function indexProjectContent(projectId) {
    if (indexing.value) return
    indexing.value = true
    lastResult.value = null

    try {
      const subsections = manuscriptStore.subsections || []
      if (subsections.length === 0) {
        addToast('No manuscript content found to index.', 'info')
        return { total: 0, newEntries: 0 }
      }

      await deleteDialogueByProject(projectId)

      progress.value = { current: 0, total: subsections.length }
      let totalEntries = 0

      for (let i = 0; i < subsections.length; i++) {
        const entries = await indexSubsection(subsections[i])
        totalEntries += entries.length
        progress.value = { current: i + 1, total: subsections.length }
      }

      lastResult.value = { total: subsections.length, newEntries: totalEntries }
      addToast(`Dialogue index: ${totalEntries} lines across ${subsections.length} sections`, 'success')
      return lastResult.value
    } catch (err) {
      console.error('[useDialogueIndexer] indexProjectContent error:', err)
      addToast('Failed to index dialogue. Check console for details.', 'error')
      return null
    } finally {
      indexing.value = false
    }
  }

  async function reindexSubsection(subsection) {
    if (!subsection || !subsection.id) return

    try {
      await reindexSection(subsection.id, subsection.projectId, [])

      const entries = await indexSubsection(subsection)
      return entries
    } catch (err) {
      console.error('[useDialogueIndexer] reindexSubsection error:', err)
      return []
    }
  }

  async function loadDialogueForProject(projectId) {
    try {
      return await getDialogueByProject(projectId)
    } catch (err) {
      console.error('[useDialogueIndexer] loadDialogueForProject error:', err)
      return []
    }
  }

  async function loadDialogueByCharacter(projectId, speakerId) {
    try {
      return await getDialogueBySpeaker(projectId, speakerId)
    } catch (err) {
      console.error('[useDialogueIndexer] loadDialogueByCharacter error:', err)
      return []
    }
  }

  const dialogueStats = computed(() => {
    if (!lastResult.value) return null
    return {
      sectionsIndexed: lastResult.value.total,
      totalLines: lastResult.value.newEntries
    }
  })

  return {
    indexing,
    progress,
    lastResult,
    dialogueStats,
    indexProjectContent,
    indexSubsection,
    reindexSubsection,
    loadDialogueForProject,
    loadDialogueByCharacter
  }
}
