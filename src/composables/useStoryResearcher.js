import { ref } from 'vue'
import {
  getCharacters,
  getLocations,
  getPlotThreads,
  getAuthorProfile
} from '../services/dbService'

const MAX_EVIDENCE_ITEMS = 10

function filterRelevant(entities, premise, isShortTerm) {
  if (!entities || entities.length === 0) return []
  if (isShortTerm && premise) {
    const keywords = premise
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 2)
    const scored = entities
      .map((e) => {
        const text =
          `${e.name || e.title || ''} ${e.description || ''} ${e.goal || ''}`.toLowerCase()
        const score = keywords.reduce((acc, kw) => {
          const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
          const matches = text.match(re)
          return acc + (matches ? matches.length : 0)
        }, 0)
        return { entity: e, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.map((s) => s.entity).slice(0, MAX_EVIDENCE_ITEMS)
  }
  return entities.slice(0, MAX_EVIDENCE_ITEMS)
}

export function useStoryResearcher() {
  const isResearching = ref(false)
  const researchError = ref(null)

  async function gatherEvidence(projectId, goal) {
    isResearching.value = true
    researchError.value = null

    try {
      const [characters, locations, plotThreads, authorProfile] = await Promise.all([
        getCharacters(projectId),
        getLocations(projectId),
        getPlotThreads(projectId),
        getAuthorProfile()
      ])

      let finalCharacters = characters || []
      let finalLocations = locations || []
      let finalPlotThreads = plotThreads || []

      if (goal) {
        const isShortTerm = goal.horizon === 'short_term'
        const premise = goal.premise || ''
        finalCharacters = filterRelevant(finalCharacters, premise, isShortTerm)
        finalLocations = filterRelevant(finalLocations, premise, isShortTerm)
        finalPlotThreads = filterRelevant(finalPlotThreads, premise, isShortTerm)
      }

      let evidenceText = `## Author Style\n`
      if (authorProfile?.preferences) {
        evidenceText += `Prose Style: ${authorProfile.preferences.proseStyle || 'Standard'}\n`
        evidenceText += `Pacing: ${authorProfile.preferences.pacing || 'Standard'}\n`
        evidenceText += `Dialogue Style: ${authorProfile.preferences.dialogueStyle || 'Standard'}\n`
        if (authorProfile.preferences.customInstructions) {
          evidenceText += `Custom Instructions: ${authorProfile.preferences.customInstructions}\n`
        }
      } else {
        evidenceText += `(No specific author style profile defined)\n`
      }

      evidenceText += `\n## Story Bible\n### Characters\n`
      if (finalCharacters.length > 0) {
        finalCharacters.forEach((c) => {
          evidenceText += `- **${c.name}** (${c.role || 'Character'}): ${c.description || ''} Goals: ${c.goal || 'None specified'}\n`
        })
      } else {
        evidenceText += `(No characters defined)\n`
      }

      evidenceText += `\n### Locations\n`
      if (finalLocations.length > 0) {
        finalLocations.forEach((l) => {
          evidenceText += `- **${l.name}**: ${l.description || ''}\n`
        })
      } else {
        evidenceText += `(No locations defined)\n`
      }

      evidenceText += `\n## Plot Threads\n`
      if (finalPlotThreads.length > 0) {
        finalPlotThreads.forEach((pt) => {
          evidenceText += `- **${pt.title}**: ${pt.description || ''} (Status: ${pt.status || 'open'})\n`
        })
      } else {
        evidenceText += `(No plot threads defined)\n`
      }

      const estimatedTokens = Math.round(evidenceText.length / 4)
      if (estimatedTokens > 3000) {
        console.warn(
          `[Evidence Gatherer] Payload exceeds estimated 3000 tokens (${estimatedTokens} tokens).`
        )
      }

      return evidenceText
    } catch (err) {
      researchError.value = err.message || 'Failed to gather evidence from the Story Bible.'
      throw err
    } finally {
      isResearching.value = false
    }
  }

  return { gatherEvidence, isResearching, researchError }
}

export { filterRelevant }
