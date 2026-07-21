import { ref } from 'vue'
import { forkWithDivergence, getSections, getSubsections, updateSubsection } from '../services/dbService'
import { useBranchStore } from '../stores/branchStore'
import { aiGenerate } from './useAiService'
import { FEATURES } from '../config/ai'

export function useWhatIfGenerator() {
  const isGenerating = ref(false)
  const progress = ref({ current: 0, total: 0, label: '' })
  const error = ref(null)

  async function generate(projectId, sourceBranchId, dslPrompt) {
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

      progress.value = { current: 0, total: allSubsections.length, label: 'Generating content...' }

      for (let i = 0; i < allSubsections.length; i++) {
        const sub = allSubsections[i]
        progress.value = { current: i + 1, total: allSubsections.length, label: `Writing: ${sub.title || 'Untitled'}...` }

        const content = await aiGenerate(
          `Write a scene for: ${sub.title || 'Untitled'}\n${sub.summary ? `Context: ${sub.summary}` : ''}`,
          'You are a fiction writer. Write compelling narrative prose in the style of the existing work.',
          { feature: FEATURES.STORY_GENERATION, temperature: 0.8, maxTokens: 2000 }
        )

        await updateSubsection(sub.id, { content, contentStatus: 'generated' })
      }

      progress.value = { current: allSubsections.length, total: allSubsections.length, label: 'Switching branch...' }

      await branchStore.setActiveBranch(branch.id)

      progress.value = { current: allSubsections.length, total: allSubsections.length, label: 'Done' }

      return branch
    } catch (e) {
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
