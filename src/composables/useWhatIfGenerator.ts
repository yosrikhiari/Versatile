import { ref } from 'vue'
import { forkWithDivergence, getSections, getSubsections, updateSubsection } from '../services/dbService'
import { useBranchStore } from '../stores/branchStore'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { aiGenerate } from './useAiService'
import { FEATURES } from '../config/ai'
import { useStoryDocuments, renderExtractedVoiceGuide } from './useStoryDocuments'

/**
 * Prose for one diverged scene.
 *
 * Built out rather than inlined because what this used to send was a single
 * line — "Write a scene for: <title>" plus a generic system prompt — with no
 * story bible, no voice, no divergence premise and no sense of what the scene
 * follows. A branch written that way reads like a different book, which is the
 * opposite of what a what-if is for: the divergence is supposed to be the only
 * thing that changed.
 */
export function buildDivergedScenePrompt({
  sub,
  premise,
  storyBibleDocs,
  voiceGuide,
  precedingSummaries
}: {
  sub: any
  premise: string
  storyBibleDocs: string
  voiceGuide: string
  precedingSummaries: string[]
}): string {
  const parts = [`Write the prose for this scene: ${sub.title || 'Untitled'}`]

  if (sub.summary) parts.push(`\nSCENE INTENT:\n${sub.summary}`)
  if (precedingSummaries.length) {
    parts.push(`\nWHAT HAPPENS IMMEDIATELY BEFORE:\n${precedingSummaries.join('\n')}`)
  }
  if (storyBibleDocs) parts.push(`\nSTORY CANON (do not contradict):\n${storyBibleDocs}`)
  if (voiceGuide) {
    parts.push(`\nAUTHOR VOICE (match this — it is measured from the manuscript):\n${voiceGuide}`)
  }
  if (premise) {
    parts.push(
      `\nTHE DIVERGENCE — this branch exists because of it, and every scene must follow from it:\n${premise}\n\n` +
        'Everything the canon establishes still holds except where this divergence changes it. ' +
        'Do not re-litigate the divergence or hedge back toward the original story.'
    )
  }

  return parts.join('\n')
}

export function useWhatIfGenerator() {
  const isGenerating = ref(false)
  const progress = ref({ current: 0, total: 0, label: '' })
  const error = ref(null)

  async function generate(projectId: any, sourceBranchId: any, dslPrompt: any) {
    isGenerating.value = true
    error.value = null
    progress.value = { current: 0, total: 1, label: 'Forking branch...' }

    const branchStore = useBranchStore()

    try {
      const branch = await forkWithDivergence(projectId, sourceBranchId, dslPrompt)

      progress.value = { current: 0, total: 1, label: 'Loading diverged subsections...' }

      const allSections = await getSections(projectId, branch.id)
      const allSubsections = []
      for (const section of allSections) {
        const subList = await getSubsections(projectId, section.id, branch.id)
        for (const sub of subList) {
          if (sub.contentStatus === 'divergent') {
            allSubsections.push({ ...sub, section })
          }
        }
      }

      progress.value = { current: 0, total: allSubsections.length, label: 'Loading story canon...' }

      // Fetched once for the branch, not per scene — the same reasoning the main
      // writer uses for its own bible cache.
      const storyBibleDocs = await useStoryDocuments()
        .getStoryDocumentContext(projectId)
        .catch(() => '')
      const voiceGuide = renderExtractedVoiceGuide(useStoryBibleStore().voiceProfile).join('\n')

      progress.value = { current: 0, total: allSubsections.length, label: 'Generating content...' }

      // Summaries of what this branch has already written, so scene N follows
      // scene N-1 instead of each one being drafted in isolation.
      const precedingSummaries: string[] = []

      for (let i = 0; i < allSubsections.length; i++) {
        const sub = allSubsections[i]
        progress.value = { current: i + 1, total: allSubsections.length, label: `Writing: ${sub.title || 'Untitled'}...` }

        const content = await aiGenerate(
          buildDivergedScenePrompt({
            sub,
            premise: String(dslPrompt || ''),
            storyBibleDocs,
            voiceGuide,
            precedingSummaries: precedingSummaries.slice(-3)
          }),
          'You are a fiction writer continuing an existing manuscript. Match its voice exactly and honour its established canon.',
          { feature: FEATURES.STORY_GENERATION, temperature: 0.8, maxTokens: 2000 }
        )

        await updateSubsection(sub.id, { content, contentStatus: 'generated' })
        precedingSummaries.push(`- ${sub.title || 'Untitled'}: ${sub.summary || '(written)'}`)
      }

      progress.value = { current: allSubsections.length, total: allSubsections.length, label: 'Switching branch...' }

      await branchStore.setActiveBranch(branch.id)

      progress.value = { current: allSubsections.length, total: allSubsections.length, label: 'Done' }

      return branch
    } catch (e: any) {
      error.value = e.message || 'What-if generation failed'
      throw error.value
    } finally {
      isGenerating.value = false
    }
  }

  function reset() {
    isGenerating.value = false
    progress.value = { current: 0, total: 0, label: '' }
    error.value = null
  }

  return {
    isGenerating,
    progress,
    error,
    generate,
    reset
  }
}
