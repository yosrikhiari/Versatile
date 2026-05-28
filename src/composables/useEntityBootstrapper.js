import { ref } from 'vue'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useVolumeStoryNetworkStore } from '../stores/volumeStoryNetworkStore'

const MIN_CHARACTERS = 3
const MIN_LOCATIONS = 2
const MIN_THREADS = 1

const GENERATE_ENTITIES_PROMPT = `You are a fiction worldbuilder. Given a story synopsis, generate characters, locations, and plot threads that fit the premise.

For each entity, return fields that are internally consistent and would plausibly exist in this story world.

CHARACTER format: { "name": "...", "role": "...", "goal": "...", "voice": "...", "notes": "...", "sampleDialogue": "..." }
LOCATION format: { "name": "...", "description": "...", "notes": "..." }
PLOT THREAD format: { "title": "...", "notes": "..." }

Return valid JSON with no markdown, no explanation. The JSON must have exactly three keys: "characters" (array), "locations" (array), "plotThreads" (array).`

const CONSISTENCY_PROMPT = `You are a fiction editor. Review these generated entities and adjust their descriptions so they share a coherent world, genre, and tone. Keep each entity's core identity but rewrite descriptions/notes/goals to eliminate contradictions (e.g., a medieval fantasy character should not reference modern technology unless the synopsis warrants it).

Output the SAME JSON structure with adjusted fields. Do not change entity names or counts. Valid JSON only, no markdown.`

function sanitizeJson(raw) {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')
  cleaned = cleaned.trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export function useEntityBootstrapper() {
  const isBootstrapping = ref(false)
  const bootstrapError = ref(null)

  async function bootstrapEntities({ synopsis, projectId, volumeId }) {
    isBootstrapping.value = true
    bootstrapError.value = null

    const storyBibleStore = useStoryBibleStore()
    const networkStore = useVolumeStoryNetworkStore()

    try {
      const existingCharacters = storyBibleStore.characters.length
      const existingLocations = storyBibleStore.locations.length
      const existingThreads = storyBibleStore.plotThreads.length

      const needCharacters = Math.max(0, MIN_CHARACTERS - existingCharacters)
      const needLocations = Math.max(0, MIN_LOCATIONS - existingLocations)
      const needThreads = Math.max(0, MIN_THREADS - existingThreads)

      if (needCharacters === 0 && needLocations === 0 && needThreads === 0) {
        return { generatedIds: { characters: [], locations: [], plotThreads: [] } }
      }

      const userPrompt = `Story synopsis: "${synopsis}"

Generate ${needCharacters} character(s), ${needLocations} location(s), and ${needThreads} plot thread(s) that fit this premise.
Create entities that are distinct from any existing ones but consistent with the story world.`

      const response = await aiGenerate(userPrompt, GENERATE_ENTITIES_PROMPT, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.7
      })

      let parsed = sanitizeJson(response)
      if (!parsed) {
        throw new Error('Failed to parse generated entities')
      }

      const newCharacters = (parsed.characters || []).slice(0, needCharacters)
      const newLocations = (parsed.locations || []).slice(0, needLocations)
      const newThreads = (parsed.plotThreads || []).slice(0, needThreads)

      const consistencyInput = {
        characters: newCharacters,
        locations: newLocations,
        plotThreads: newThreads
      }

      const consistencyResponse = await aiGenerate(
        `Story synopsis: "${synopsis}"\n\nGenerated entities:\n${JSON.stringify(consistencyInput, null, 2)}`,
        CONSISTENCY_PROMPT,
        { feature: FEATURES.STORY_GENERATION, temperature: 0.4 }
      )

      let adjusted = sanitizeJson(consistencyResponse)
      if (!adjusted) adjusted = consistencyInput

      const generatedIds = { characters: [], locations: [], plotThreads: [] }

      for (const char of (adjusted.characters || [])) {
        if (char.name) {
          const id = await storyBibleStore.addCharacterData(projectId, {
            name: char.name,
            role: char.role || '',
            goal: char.goal || '',
            voice: char.voice || '',
            notes: char.notes || '',
            sampleDialogue: char.sampleDialogue || ''
          })
          generatedIds.characters.push(id)
          if (volumeId) {
            await networkStore.assignEntityToVolume('character', id, volumeId, false)
          }
        }
      }

      for (const loc of (adjusted.locations || [])) {
        if (loc.name) {
          const id = await storyBibleStore.addLocationData(projectId, {
            name: loc.name,
            description: loc.description || '',
            notes: loc.notes || ''
          })
          generatedIds.locations.push(id)
          if (volumeId) {
            await networkStore.assignEntityToVolume('location', id, volumeId, false)
          }
        }
      }

      for (const thread of (adjusted.plotThreads || [])) {
        if (thread.title) {
          const id = await storyBibleStore.addPlotThreadData(projectId, {
            title: thread.title,
            notes: thread.notes || ''
          })
          generatedIds.plotThreads.push(id)
          if (volumeId) {
            await networkStore.assignEntityToVolume('plotThread', id, volumeId, false)
          }
        }
      }

      return { generatedIds }
    } catch (err) {
      bootstrapError.value = err.message || 'Entity bootstrapping failed'
      throw err
    } finally {
      isBootstrapping.value = false
    }
  }

  return { bootstrapEntities, isBootstrapping, bootstrapError }
}
